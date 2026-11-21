import { resolveImportSpecifier } from './importResolver.js';
import { TreeSitterSyntaxNode, TreeSitterTree } from './treeSitterLoader.js';
import {
  AstCallReference,
  AstExportDeclaration,
  AstImportDeclaration,
  AstImportSpecifier,
  AstParameter,
  AstSymbol,
  AstSymbolKind,
  FileAnalysisStatus,
  FileAstResult,
  SourceRange,
  SupportedLanguage
} from './types.js';

function nodeToRange(node: TreeSitterSyntaxNode): SourceRange {
  return {
    startLine: node.startPosition.row + 1,
    startColumn: node.startPosition.column,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column
  };
}

function unquoteStringNode(node: TreeSitterSyntaxNode | null | undefined): string {
  if (!node) return '';
  const txt = node.text.trim();
  if (
    (txt.startsWith("'") && txt.endsWith("'")) ||
    (txt.startsWith('"') && txt.endsWith('"')) ||
    (txt.startsWith('`') && txt.endsWith('`'))
  ) {
    return txt.slice(1, -1);
  }
  return txt;
}

function extractParameters(paramContainer: TreeSitterSyntaxNode | null | undefined): AstParameter[] {
  if (!paramContainer) return [];
  const params: AstParameter[] = [];

  for (const child of paramContainer.namedChildren) {
    if (child.isError || child.type === 'ERROR') continue;

    if (
      child.type === 'required_parameter' ||
      child.type === 'optional_parameter'
    ) {
      const pattern = child.childForFieldName('pattern') || child.namedChildren[0];
      const typeNode = child.childForFieldName('type');
      const name = pattern?.text?.trim();
      if (name) {
        const typeText = typeNode?.text?.replace(/^:\s*/, '').trim();
        params.push({
          name: name.length > 60 ? `${name.slice(0, 57)}...` : name,
          typeAnnotation: typeText && typeText.length <= 80 ? typeText : undefined
        });
      }
    } else if (child.type === 'rest_pattern' || child.type === 'assignment_pattern' || child.type === 'identifier' || child.type === 'object_pattern' || child.type === 'array_pattern') {
      const rawName = child.type === 'assignment_pattern'
        ? child.childForFieldName('left')?.text?.trim() || child.text.trim()
        : child.text.trim();
      if (rawName) {
        params.push({
          name: rawName.length > 60 ? `${rawName.slice(0, 57)}...` : rawName
        });
      }
    }
  }

  return params;
}

function containsJsx(node: TreeSitterSyntaxNode): boolean {
  const jsxNodes = node.descendantsOfType([
    'jsx_element',
    'jsx_self_closing_element',
    'jsx_fragment'
  ]);
  return jsxNodes.length > 0;
}

function extractJsxChildComponentNames(node: TreeSitterSyntaxNode): string[] {
  const used = new Set<string>();
  const elements = node.descendantsOfType(['jsx_opening_element', 'jsx_self_closing_element']);
  for (const el of elements) {
    const nameNode = el.childForFieldName('name') || el.namedChildren[0];
    const tag = nameNode?.text?.trim();
    if (!tag) continue;
    // Uppercase first character indicates a React/JSX component rather than intrinsic HTML element
    if (/^[A-Z]/.test(tag)) {
      used.add(tag.split('.')[0]);
    }
  }
  return Array.from(used);
}

function isCapitalizedIdentifier(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/.test(name);
}

function isLikelyReactComponent(
  name: string,
  fnNode: TreeSitterSyntaxNode,
  typeAnnotationText?: string
): boolean {
  if (!isCapitalizedIdentifier(name)) return false;
  if (typeAnnotationText && /\b(FC|FunctionComponent|VFC|React\.FC|JSX\.Element|ReactNode)\b/.test(typeAnnotationText)) {
    return true;
  }
  return containsJsx(fnNode);
}

function isAsyncFunctionNode(node: TreeSitterSyntaxNode): boolean {
  return node.children.some((c) => !c.isNamed && c.type === 'async');
}

function countParseErrors(root: TreeSitterSyntaxNode): number {
  let count = 0;
  const visit = (node: TreeSitterSyntaxNode) => {
    if (node.type === 'ERROR' || node.isError || node.isMissing) {
      count++;
    }
    for (const child of node.children) {
      if (child.hasError || child.isError || child.isMissing || child.type === 'ERROR') {
        visit(child);
      }
    }
  };
  if (root.hasError) {
    visit(root);
  }
  return count;
}

function extractSpecifiersFromImportClause(clause: TreeSitterSyntaxNode): AstImportSpecifier[] {
  const specifiers: AstImportSpecifier[] = [];

  for (const child of clause.namedChildren) {
    if (child.type === 'identifier') {
      specifiers.push({
        localName: child.text,
        importedName: 'default',
        kind: 'default'
      });
    } else if (child.type === 'namespace_import') {
      const id = child.namedChildren.find((c) => c.type === 'identifier');
      if (id) {
        specifiers.push({
          localName: id.text,
          importedName: '*',
          kind: 'namespace'
        });
      }
    } else if (child.type === 'named_imports') {
      for (const spec of child.namedChildren) {
        if (spec.type !== 'import_specifier') continue;
        const nameNode = spec.childForFieldName('name') || spec.namedChildren[0];
        const aliasNode = spec.childForFieldName('alias');
        if (nameNode) {
          specifiers.push({
            localName: aliasNode?.text || nameNode.text,
            importedName: nameNode.text,
            kind: 'named'
          });
        }
      }
    }
  }

  return specifiers;
}

function unwrapFunctionExpression(node: TreeSitterSyntaxNode | null | undefined): TreeSitterSyntaxNode | null {
  if (!node) return null;
  if (
    node.type === 'arrow_function' ||
    node.type === 'function_expression' ||
    node.type === 'function' ||
    node.type === 'generator_function'
  ) {
    return node;
  }
  if (node.type === 'parenthesized_expression' || node.type === 'as_expression' || node.type === 'satisfies_expression') {
    return unwrapFunctionExpression(node.firstNamedChild);
  }
  // Support common React wrappers like React.memo(() => ...) / forwardRef((props, ref) => ...)
  if (node.type === 'call_expression') {
    const calleeText = node.childForFieldName('function')?.text || '';
    if (/(^|\.)(memo|forwardRef)$/.test(calleeText)) {
      const argsNode = node.childForFieldName('arguments');
      const firstArg = argsNode?.namedChildren[0];
      return unwrapFunctionExpression(firstArg);
    }
  }
  return null;
}

export function extractAstFromTree(params: {
  filePath: string;
  language: SupportedLanguage;
  tree: TreeSitterTree;
  sizeBytes: number;
  repoFilePaths?: Set<string>;
}): FileAstResult {
  const { filePath, language, tree, sizeBytes, repoFilePaths } = params;
  const root = tree.rootNode;
  const parseErrorsCount = countParseErrors(root);
  const warnings: string[] = [];

  if (parseErrorsCount > 0) {
    warnings.push(`Tree-sitter detected ${parseErrorsCount} syntax error node(s) in ${filePath}.`);
  }

  const imports: AstImportDeclaration[] = [];
  const exports: AstExportDeclaration[] = [];
  const symbols: AstSymbol[] = [];
  const calls: AstCallReference[] = [];
  const symbolIdSeen = new Set<string>();

  const registerSymbol = (sym: AstSymbol) => {
    if (symbolIdSeen.has(sym.id)) return;
    symbolIdSeen.add(sym.id);
    symbols.push(sym);
  };

  const makeSymbolId = (kind: AstSymbolKind, qualifiedName: string, range: SourceRange): string => {
    return `${kind}:${filePath}:${qualifiedName}:${range.startLine}`;
  };

  // Recursive call expression scanner scoped to its nearest enclosing function/method/component
  const scanCallsInsideNode = (scopeNode: TreeSitterSyntaxNode, callerName: string) => {
    const walk = (node: TreeSitterSyntaxNode) => {
      if (node.type === 'ERROR' || node.isError) return;

      // Stop descending if we hit a nested named/anonymous function declaration handled separately
      if (
        node !== scopeNode &&
        (node.type === 'function_declaration' ||
          node.type === 'generator_function_declaration' ||
          node.type === 'method_definition' ||
          node.type === 'class_declaration' ||
          node.type === 'abstract_class_declaration')
      ) {
        return;
      }

      // Skip calls nested inside inner arrow callbacks ONLY? No: calls inside callbacks inside `callerName`
      // attribute to `callerName` unless given an explicit inner symbol!
      if (node.type === 'call_expression') {
        const fnNode = node.childForFieldName('function');
        const range = nodeToRange(node);

        if (fnNode) {
          const calleeText = fnNode.text.trim();
          // Require expressions are recorded as imports, not application call edges
          if (calleeText === 'require') {
            // handled in import extractor
          } else if (fnNode.type === 'identifier') {
            calls.push({
              callerName,
              callerFilePath: filePath,
              calleeText,
              calleeName: calleeText,
              targetKind: 'unresolved',
              resolved: false,
              range
            });
          } else if (fnNode.type === 'member_expression') {
            const prop = fnNode.childForFieldName('property');
            const obj = fnNode.childForFieldName('object');
            if (prop?.type === 'property_identifier' && (obj?.type === 'this' || obj?.type === 'identifier')) {
              calls.push({
                callerName,
                callerFilePath: filePath,
                calleeText,
                calleeName: prop.text,
                targetKind: obj.type === 'this' ? 'same_class_method' : 'unresolved',
                resolved: false,
                range
              });
            } else {
              calls.push({
                callerName,
                callerFilePath: filePath,
                calleeText,
                calleeName: calleeText,
                targetKind: 'unresolved_dynamic',
                resolved: false,
                reason: 'Chained or computed member call cannot be statically bound',
                range
              });
            }
          } else {
            calls.push({
              callerName,
              callerFilePath: filePath,
              calleeText,
              calleeName: calleeText,
              targetKind: 'unresolved_dynamic',
              resolved: false,
              reason: `Dynamic call expression (${fnNode.type}) cannot be statically resolved`,
              range
            });
          }
        }
      }

      for (const child of node.namedChildren) {
        walk(child);
      }
    };

    walk(scopeNode);
  };

  const handleClassDeclaration = (clsNode: TreeSitterSyntaxNode, isExported: boolean) => {
    const nameNode = clsNode.childForFieldName('name');
    const className = nameNode?.text?.trim();
    if (!className) return;

    const range = nodeToRange(clsNode);
    const extendsReact = /\b(Component|PureComponent|React\.Component|React\.PureComponent)\b/.test(
      clsNode.children.find((c) => c.type === 'class_heritage')?.text || ''
    );
    const kind: AstSymbolKind = extendsReact ? 'component' : 'class';
    const jsxChildrenUsed = kind === 'component' ? extractJsxChildComponentNames(clsNode) : undefined;

    registerSymbol({
      id: makeSymbolId(kind, className, range),
      name: className,
      qualifiedName: className,
      kind,
      filePath,
      parameters: [],
      isExported,
      jsxChildrenUsed,
      range
    });

    const bodyNode = clsNode.childForFieldName('body');
    if (!bodyNode) return;

    for (const member of bodyNode.namedChildren) {
      if (member.type !== 'method_definition' || member.isError) continue;
      const mNameNode = member.childForFieldName('name');
      const mName = mNameNode?.text?.trim();
      if (!mName) continue;

      const mRange = nodeToRange(member);
      const qualifiedName = `${className}.${mName}`;
      const params = extractParameters(member.childForFieldName('parameters'));
      registerSymbol({
        id: makeSymbolId('method', qualifiedName, mRange),
        name: mName,
        qualifiedName,
        kind: 'method',
        filePath,
        parentName: className,
        parameters: params,
        isExported,
        isAsync: isAsyncFunctionNode(member),
        range: mRange
      });

      const methodBody = member.childForFieldName('body');
      if (methodBody) {
        scanCallsInsideNode(methodBody, qualifiedName);
      }
    }
  };

  const handleVariableDeclaration = (declNode: TreeSitterSyntaxNode, isExported: boolean): string[] => {
    const declaredNames: string[] = [];

    for (const declarator of declNode.namedChildren) {
      if (declarator.type !== 'variable_declarator' || declarator.isError) continue;
      const nameNode = declarator.childForFieldName('name');
      const valueNode = declarator.childForFieldName('value');
      const typeNode = declarator.childForFieldName('type');

      // Detect CommonJS require(...) declarations
      if (valueNode?.type === 'call_expression') {
        const fnText = valueNode.childForFieldName('function')?.text;
        const firstArg = valueNode.childForFieldName('arguments')?.namedChildren[0];
        if (fnText === 'require' && firstArg?.type === 'string') {
          const modSpec = unquoteStringNode(firstArg);
          const resolved = resolveImportSpecifier(filePath, modSpec, repoFilePaths);
          const specifiers: AstImportSpecifier[] = [];
          if (nameNode?.type === 'identifier') {
            specifiers.push({
              localName: nameNode.text,
              importedName: 'default',
              kind: 'require'
            });
          } else if (nameNode?.type === 'object_pattern') {
            for (const prop of nameNode.namedChildren) {
              if (prop.type === 'shorthand_property_identifier_pattern') {
                specifiers.push({ localName: prop.text, importedName: prop.text, kind: 'require' });
              } else if (prop.type === 'pair_pattern') {
                const key = prop.childForFieldName('key')?.text;
                const val = prop.childForFieldName('value')?.text;
                if (key && val) {
                  specifiers.push({ localName: val, importedName: key, kind: 'require' });
                }
              }
            }
          }
          imports.push({
            source: modSpec,
            specifiers,
            isTypeOnly: false,
            kind: resolved.kind,
            externalPackageName: resolved.externalPackageName,
            resolvedFilePath: resolved.resolvedFilePath,
            resolutionNote: resolved.resolutionNote,
            range: nodeToRange(declarator)
          });
          continue;
        }
      }

      if (nameNode?.type !== 'identifier') continue;
      const varName = nameNode.text;
      declaredNames.push(varName);

      const unwrappedFn = unwrapFunctionExpression(valueNode);
      if (unwrappedFn) {
        const range = nodeToRange(declarator);
        const typeText = typeNode?.text;
        const isComp = isLikelyReactComponent(varName, unwrappedFn, typeText);
        const kind: AstSymbolKind = isComp ? 'component' : 'function';
        const params = extractParameters(unwrappedFn.childForFieldName('parameters'));
        const jsxChildrenUsed = isComp ? extractJsxChildComponentNames(unwrappedFn) : undefined;

        registerSymbol({
          id: makeSymbolId(kind, varName, range),
          name: varName,
          qualifiedName: varName,
          kind,
          filePath,
          parameters: params,
          isExported,
          isAsync: isAsyncFunctionNode(unwrappedFn),
          jsxChildrenUsed,
          range
        });

        const fnBody = unwrappedFn.childForFieldName('body') || unwrappedFn;
        scanCallsInsideNode(fnBody, varName);
      } else if (valueNode) {
        scanCallsInsideNode(valueNode, '<module>');
      }
    }

    return declaredNames;
  };

  const handleStatement = (stmt: TreeSitterSyntaxNode, isExported: boolean) => {
    if (stmt.isError || stmt.type === 'ERROR') return;

    if (stmt.type === 'import_statement') {
      const sourceNode = stmt.namedChildren.find((c) => c.type === 'string');
      const sourceText = unquoteStringNode(sourceNode);
      if (!sourceText) return;

      const isTypeOnly = stmt.children.some((c) => !c.isNamed && c.type === 'type');
      const clause = stmt.namedChildren.find((c) => c.type === 'import_clause');
      const specifiers: AstImportSpecifier[] = clause
        ? extractSpecifiersFromImportClause(clause)
        : [{ localName: '', importedName: '', kind: 'side_effect' }];

      const resolved = resolveImportSpecifier(filePath, sourceText, repoFilePaths);
      imports.push({
        source: sourceText,
        specifiers,
        isTypeOnly,
        kind: resolved.kind,
        externalPackageName: resolved.externalPackageName,
        resolvedFilePath: resolved.resolvedFilePath,
        resolutionNote: resolved.resolutionNote,
        range: nodeToRange(stmt)
      });
      return;
    }

    if (stmt.type === 'export_statement') {
      const isDefault = stmt.children.some((c) => !c.isNamed && c.type === 'default');
      const exportClause = stmt.namedChildren.find((c) => c.type === 'export_clause');
      const reexportSourceNode = stmt.namedChildren.find((c) => c.type === 'string');

      if (reexportSourceNode) {
        const sourceText = unquoteStringNode(reexportSourceNode);
        const resolved = resolveImportSpecifier(filePath, sourceText, repoFilePaths);
        const names: string[] = [];
        if (exportClause) {
          for (const spec of exportClause.namedChildren) {
            if (spec.type === 'export_specifier') {
              const alias = spec.childForFieldName('alias')?.text;
              const orig = spec.childForFieldName('name')?.text || spec.namedChildren[0]?.text;
              if (alias || orig) names.push(alias || orig!);
            }
          }
        } else {
          names.push('*');
        }
        exports.push({
          kind: 'reexport',
          exportedNames: names,
          source: sourceText,
          resolvedSourcePath: resolved.resolvedFilePath,
          range: nodeToRange(stmt)
        });
        return;
      }

      if (exportClause) {
        const names: string[] = [];
        for (const spec of exportClause.namedChildren) {
          if (spec.type === 'export_specifier') {
            const alias = spec.childForFieldName('alias')?.text;
            const orig = spec.childForFieldName('name')?.text || spec.namedChildren[0]?.text;
            if (alias || orig) {
              const exported = alias || orig!;
              names.push(exported);
              const matchedSym = symbols.find((s) => s.name === orig);
              if (matchedSym) matchedSym.isExported = true;
            }
          }
        }
        exports.push({
          kind: 'named',
          exportedNames: names,
          range: nodeToRange(stmt)
        });
        return;
      }

      const exportedDecl = stmt.namedChildren.find((c) =>
        [
          'function_declaration',
          'generator_function_declaration',
          'class_declaration',
          'abstract_class_declaration',
          'lexical_declaration',
          'variable_declaration',
          'interface_declaration',
          'type_alias_declaration'
        ].includes(c.type)
      );

      if (exportedDecl) {
        const beforeCount = symbols.length;
        handleStatement(exportedDecl, true);
        const newlyAddedNames = symbols.slice(beforeCount).filter((s) => !s.parentName).map((s) => s.name);
        exports.push({
          kind: isDefault ? 'default' : 'named',
          exportedNames: newlyAddedNames.length > 0 ? newlyAddedNames : isDefault ? ['default'] : [],
          range: nodeToRange(stmt)
        });
      } else if (isDefault) {
        const expr = stmt.namedChildren[0];
        if (expr?.type === 'identifier') {
          const matchedSym = symbols.find((s) => s.name === expr.text);
          if (matchedSym) matchedSym.isExported = true;
          exports.push({ kind: 'default', exportedNames: [expr.text], range: nodeToRange(stmt) });
        } else {
          exports.push({ kind: 'default', exportedNames: ['default'], range: nodeToRange(stmt) });
        }
      }
      return;
    }

    if (stmt.type === 'function_declaration' || stmt.type === 'generator_function_declaration') {
      const nameNode = stmt.childForFieldName('name');
      const fnName = nameNode?.text?.trim();
      if (!fnName) return;

      const range = nodeToRange(stmt);
      const isComp = isLikelyReactComponent(fnName, stmt, stmt.childForFieldName('return_type')?.text);
      const kind: AstSymbolKind = isComp ? 'component' : 'function';
      const params = extractParameters(stmt.childForFieldName('parameters'));
      const jsxChildrenUsed = isComp ? extractJsxChildComponentNames(stmt) : undefined;

      registerSymbol({
        id: makeSymbolId(kind, fnName, range),
        name: fnName,
        qualifiedName: fnName,
        kind,
        filePath,
        parameters: params,
        isExported,
        isAsync: isAsyncFunctionNode(stmt),
        jsxChildrenUsed,
        range
      });

      const body = stmt.childForFieldName('body');
      if (body) scanCallsInsideNode(body, fnName);
      return;
    }

    if (stmt.type === 'class_declaration' || stmt.type === 'abstract_class_declaration') {
      handleClassDeclaration(stmt, isExported);
      return;
    }

    if (stmt.type === 'interface_declaration') {
      const name = stmt.childForFieldName('name')?.text?.trim();
      if (!name) return;
      const range = nodeToRange(stmt);
      registerSymbol({
        id: makeSymbolId('interface', name, range),
        name,
        qualifiedName: name,
        kind: 'interface',
        filePath,
        parameters: [],
        isExported,
        range
      });
      return;
    }

    if (stmt.type === 'type_alias_declaration') {
      const name = stmt.childForFieldName('name')?.text?.trim();
      if (!name) return;
      const range = nodeToRange(stmt);
      registerSymbol({
        id: makeSymbolId('type_alias', name, range),
        name,
        qualifiedName: name,
        kind: 'type_alias',
        filePath,
        parameters: [],
        isExported,
        range
      });
      return;
    }

    if (stmt.type === 'lexical_declaration' || stmt.type === 'variable_declaration') {
      handleVariableDeclaration(stmt, isExported);
      return;
    }

    if (stmt.type === 'expression_statement') {
      const expr = stmt.firstNamedChild;
      if (expr?.type === 'call_expression') {
        const fnText = expr.childForFieldName('function')?.text;
        const firstArg = expr.childForFieldName('arguments')?.namedChildren[0];
        if (fnText === 'require' && firstArg?.type === 'string') {
          const modSpec = unquoteStringNode(firstArg);
          const resolved = resolveImportSpecifier(filePath, modSpec, repoFilePaths);
          imports.push({
            source: modSpec,
            specifiers: [{ localName: '', importedName: '', kind: 'side_effect' }],
            isTypeOnly: false,
            kind: resolved.kind,
            externalPackageName: resolved.externalPackageName,
            resolvedFilePath: resolved.resolvedFilePath,
            resolutionNote: resolved.resolutionNote,
            range: nodeToRange(expr)
          });
          return;
        }
      }
      if (expr?.type === 'assignment_expression') {
        const leftText = expr.childForFieldName('left')?.text?.trim() || '';
        const rightNode = expr.childForFieldName('right');
        if (leftText === 'module.exports' || leftText.startsWith('exports.')) {
          const exportedNames: string[] = [];
          if (leftText.startsWith('exports.')) {
            exportedNames.push(leftText.slice('exports.'.length));
          } else if (rightNode?.type === 'identifier') {
            exportedNames.push(rightNode.text);
            const match = symbols.find((s) => s.name === rightNode.text);
            if (match) match.isExported = true;
          } else if (rightNode?.type === 'object') {
            for (const prop of rightNode.namedChildren) {
              if (prop.type === 'shorthand_property_identifier' || prop.type === 'pair') {
                const name = prop.type === 'pair' ? prop.childForFieldName('key')?.text : prop.text;
                if (name) {
                  exportedNames.push(name);
                  const match = symbols.find((s) => s.name === name);
                  if (match) match.isExported = true;
                }
              }
            }
          }
          exports.push({
            kind: 'commonjs',
            exportedNames: exportedNames.length ? exportedNames : ['default'],
            range: nodeToRange(expr)
          });
        }
      }
      scanCallsInsideNode(stmt, '<module>');
      return;
    }

    scanCallsInsideNode(stmt, '<module>');
  };

  for (const child of root.namedChildren) {
    handleStatement(child, false);
  }

  let status: FileAnalysisStatus = 'ANALYZED';
  if (parseErrorsCount > 0) {
    const recoveredSomething = symbols.length > 0 || imports.length > 0 || exports.length > 0;
    status = recoveredSomething ? 'PARTIALLY_ANALYZED' : 'PARSE_ERROR';
  }

  return {
    filePath,
    language,
    status,
    imports,
    exports,
    symbols,
    calls,
    parseErrorsCount,
    warnings,
    sizeBytes
  };
}

