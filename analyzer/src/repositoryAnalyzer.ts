import fs from 'fs';
import path from 'path';
import { getLanguageForFile, isSupportedSourceFile } from './languageRegistry.js';
import { normalizeRepoPath } from './importResolver.js';
import { getParserForLanguage } from './treeSitterLoader.js';
import { extractAstFromTree } from './tsJsExtractor.js';
import {
  FileAstResult,
  RepositoryAstAnalysis,
  RepositoryAstSummary,
  RepositorySourceInput
} from './types.js';

export const DEFAULT_MAX_AST_FILE_BYTES = 120 * 1024;

export async function analyzeFileSource(params: {
  filePath: string;
  content: string;
  repoFilePaths?: Set<string>;
  maxFileSizeBytes?: number;
}): Promise<FileAstResult> {
  const normPath = normalizeRepoPath(params.filePath);
  const sizeBytes = Buffer.byteLength(params.content, 'utf8');
  const maxBytes = params.maxFileSizeBytes ?? DEFAULT_MAX_AST_FILE_BYTES;
  const language = getLanguageForFile(normPath);

  if (!language) {
    return {
      filePath: normPath,
      language: 'unsupported',
      status: 'UNSUPPORTED_LANGUAGE',
      imports: [],
      exports: [],
      symbols: [],
      calls: [],
      parseErrorsCount: 0,
      warnings: [`Unsupported language for AST analysis: ${normPath}`],
      sizeBytes
    };
  }

  if (sizeBytes > maxBytes) {
    return {
      filePath: normPath,
      language,
      status: 'SKIPPED_SIZE_LIMIT',
      imports: [],
      exports: [],
      symbols: [],
      calls: [],
      parseErrorsCount: 0,
      warnings: [`Skipped file exceeding AST size limit (${sizeBytes} bytes > ${maxBytes} bytes).`],
      sizeBytes
    };
  }

  if (params.content.trim().length === 0) {
    return {
      filePath: normPath,
      language,
      status: 'ANALYZED',
      imports: [],
      exports: [],
      symbols: [],
      calls: [],
      parseErrorsCount: 0,
      warnings: [],
      sizeBytes
    };
  }

  try {
    const parser = await getParserForLanguage(language);
    if (!parser) {
      return {
        filePath: normPath,
        language: 'unsupported',
        status: 'UNSUPPORTED_LANGUAGE',
        imports: [],
        exports: [],
        symbols: [],
        calls: [],
        parseErrorsCount: 0,
        warnings: [`No Tree-sitter grammar loaded for ${language}`],
        sizeBytes
      };
    }

    const tree = parser.parse(params.content);
    try {
      return extractAstFromTree({
        filePath: normPath,
        language,
        tree,
        sizeBytes,
        repoFilePaths: params.repoFilePaths
      });
    } finally {
      tree.delete();
    }
  } catch (err: unknown) {
    return {
      filePath: normPath,
      language,
      status: 'PARSE_ERROR',
      imports: [],
      exports: [],
      symbols: [],
      calls: [],
      parseErrorsCount: 1,
      warnings: [err instanceof Error ? err.message : 'Unexpected Tree-sitter parse failure'],
      sizeBytes
    };
  }
}

function resolveCrossFileCallsAndComponents(files: FileAstResult[]): void {
  const byPath = new Map<string, FileAstResult>();
  for (const file of files) {
    if (file.status === 'ANALYZED' || file.status === 'PARTIALLY_ANALYZED') {
      byPath.set(file.filePath, file);
    }
  }

  for (const file of files) {
    if (file.status !== 'ANALYZED' && file.status !== 'PARTIALLY_ANALYZED') continue;

    // Index imported bindings by local identifier name
    const importByLocalName = new Map<
      string,
      {
        source: string;
        kind: string;
        importedName: string;
        specKind: string;
        resolvedFilePath?: string;
        externalPackageName?: string;
      }
    >();

    for (const imp of file.imports) {
      for (const spec of imp.specifiers) {
        if (!spec.localName) continue;
        importByLocalName.set(spec.localName, {
          source: imp.source,
          kind: imp.kind,
          importedName: spec.importedName,
          specKind: spec.kind,
          resolvedFilePath: imp.resolvedFilePath,
          externalPackageName: imp.externalPackageName
        });
      }
    }

    // Index caller symbol info to find class context for `this.method()`
    const symbolByQualified = new Map(file.symbols.map((s) => [s.qualifiedName, s]));

    // Resolve JSX Component containment (<Child /> inside Parent) deterministically
    for (const sym of file.symbols) {
      if (sym.kind !== 'component' || !sym.jsxChildrenUsed?.length) continue;
      const resolvedComponents: NonNullable<typeof sym.resolvedComponentsUsed> = [];

      for (const childTag of sym.jsxChildrenUsed) {
        const localComp = file.symbols.find((s) => s.name === childTag && (s.kind === 'component' || s.kind === 'class'));
        if (localComp && localComp.id !== sym.id) {
          resolvedComponents.push({
            componentName: localComp.name,
            targetFilePath: file.filePath,
            targetSymbolId: localComp.id
          });
          continue;
        }

        const impBinding = importByLocalName.get(childTag);
        if (impBinding?.resolvedFilePath) {
          const targetAst = byPath.get(impBinding.resolvedFilePath);
          if (targetAst) {
            const matchName =
              impBinding.specKind === 'default'
                ? targetAst.exports.find((e) => e.kind === 'default')?.exportedNames[0] || childTag
                : impBinding.importedName;
            const targetSym = targetAst.symbols.find(
              (s) => (s.name === matchName || s.name === childTag) && (s.kind === 'component' || s.kind === 'class' || s.kind === 'function')
            );
            if (targetSym) {
              resolvedComponents.push({
                componentName: targetSym.name,
                targetFilePath: targetAst.filePath,
                targetSymbolId: targetSym.id
              });
            }
          }
        }
      }

      if (resolvedComponents.length > 0) {
        sym.resolvedComponentsUsed = resolvedComponents;
      }
    }

    // Resolve syntactic call references strictly
    for (const call of file.calls) {
      if (call.targetKind === 'unresolved_dynamic') continue;

      if (call.targetKind === 'same_class_method') {
        const callerSym = symbolByQualified.get(call.callerName);
        const className = callerSym?.parentName;
        if (className) {
          const targetMethod = file.symbols.find(
            (s) => s.kind === 'method' && s.parentName === className && s.name === call.calleeName
          );
          if (targetMethod) {
            call.resolved = true;
            call.targetFilePath = file.filePath;
            call.targetSymbolName = targetMethod.qualifiedName;
            call.targetSymbolId = targetMethod.id;
            continue;
          }
        }
        call.targetKind = 'unresolved';
        call.reason = `Enclosing class method "${call.calleeName}" could not be statically resolved`;
        continue;
      }

      // 1. Direct identifier call: foo()
      if (!call.calleeText.includes('.')) {
        const localTarget = file.symbols.find(
          (s) =>
            s.name === call.calleeName &&
            !s.parentName &&
            (s.kind === 'function' || s.kind === 'component' || s.kind === 'class')
        );
        if (localTarget) {
          call.resolved = true;
          call.targetKind = 'local_symbol';
          call.targetFilePath = file.filePath;
          call.targetSymbolName = localTarget.qualifiedName;
          call.targetSymbolId = localTarget.id;
          continue;
        }

        const binding = importByLocalName.get(call.calleeName);
        if (binding) {
          if (binding.kind === 'external_package') {
            call.targetKind = 'unresolved_external';
            call.reason = `External package symbol from "${binding.externalPackageName || binding.source}"`;
            continue;
          }
          if (binding.resolvedFilePath) {
            const targetAst = byPath.get(binding.resolvedFilePath);
            if (targetAst) {
              let targetSym;
              if (binding.specKind === 'default') {
                const defaultName = targetAst.exports.find((e) => e.kind === 'default')?.exportedNames[0];
                targetSym = targetAst.symbols.find(
                  (s) => !s.parentName && (s.name === defaultName || (defaultName === 'default' && s.isExported))
                );
              } else {
                targetSym = targetAst.symbols.find(
                  (s) => !s.parentName && s.name === binding.importedName
                );
              }

              if (targetSym) {
                call.resolved = true;
                call.targetKind = 'imported_symbol';
                call.targetFilePath = targetAst.filePath;
                call.targetSymbolName = targetSym.qualifiedName;
                call.targetSymbolId = targetSym.id;
                continue;
              }
            }
          }
          call.targetKind = 'unresolved';
          call.reason = `Imported target "${call.calleeName}" from "${binding.source}" could not be verified in analyzed repo files`;
          continue;
        }

        call.targetKind = 'unresolved';
        call.reason = `Local/global identifier "${call.calleeName}" has no resolved declaration in module scope`;
        continue;
      }

      // 2. Two-segment member call: Mod.fn()
      const parts = call.calleeText.split('.');
      if (parts.length === 2) {
        const [objName, propName] = parts;
        const binding = importByLocalName.get(objName);
        if (binding) {
          if (binding.kind === 'external_package') {
            call.targetKind = 'unresolved_external';
            call.reason = `External package call on "${binding.externalPackageName || binding.source}"`;
            continue;
          }
          if (binding.resolvedFilePath) {
            const targetAst = byPath.get(binding.resolvedFilePath);
            if (targetAst) {
              const targetSym = targetAst.symbols.find(
                (s) => !s.parentName && s.name === propName && (s.kind === 'function' || s.kind === 'component')
              );
              if (targetSym) {
                call.resolved = true;
                call.targetKind = 'imported_symbol';
                call.targetFilePath = targetAst.filePath;
                call.targetSymbolName = targetSym.qualifiedName;
                call.targetSymbolId = targetSym.id;
                continue;
              }
            }
          }
        }
      }

      call.targetKind = 'unresolved';
      call.reason = `Member expression "${call.calleeText}" target type cannot be resolved statically without type inference`;
    }
  }
}

export async function analyzeRepositoryFiles(params: {
  files: RepositorySourceInput[];
  repoFilePaths?: Set<string> | string[];
  maxFileSizeBytes?: number;
}): Promise<RepositoryAstAnalysis> {
  const maxBytes = params.maxFileSizeBytes ?? DEFAULT_MAX_AST_FILE_BYTES;
  const repoPathSet = new Set<string>();

  if (params.repoFilePaths) {
    for (const p of params.repoFilePaths) {
      repoPathSet.add(normalizeRepoPath(p));
    }
  }
  for (const f of params.files) {
    repoPathSet.add(normalizeRepoPath(f.filePath));
  }

  const results: FileAstResult[] = [];

  for (const input of params.files) {
    const normPath = normalizeRepoPath(input.filePath);
    const language = getLanguageForFile(normPath);

    if (input.skippedReason && input.content === undefined) {
      results.push({
        filePath: normPath,
        language: language ?? 'unsupported',
        status: 'SKIPPED_SIZE_LIMIT',
        imports: [],
        exports: [],
        symbols: [],
        calls: [],
        parseErrorsCount: 0,
        warnings: [input.skippedReason],
        sizeBytes: input.sizeBytes ?? 0
      });
      continue;
    }

    if (input.content === undefined) continue;

    const fileRes = await analyzeFileSource({
      filePath: normPath,
      content: input.content,
      repoFilePaths: repoPathSet,
      maxFileSizeBytes: maxBytes
    });
    results.push(fileRes);
  }

  resolveCrossFileCallsAndComponents(results);

  const summary: RepositoryAstSummary = {
    totalInputFiles: results.length,
    supportedFiles: 0,
    analyzedFiles: 0,
    partiallyAnalyzedFiles: 0,
    parseErrorFiles: 0,
    skippedSizeLimitFiles: 0,
    unsupportedLanguageFiles: 0,
    totalSymbols: 0,
    totalImports: 0,
    resolvedInternalImports: 0,
    unresolvedImports: 0,
    externalImports: 0,
    totalCalls: 0,
    resolvedCalls: 0,
    unresolvedCalls: 0,
    analyzedAt: new Date().toISOString()
  };

  for (const r of results) {
    if (r.language !== 'unsupported') summary.supportedFiles++;
    if (r.status === 'ANALYZED') summary.analyzedFiles++;
    else if (r.status === 'PARTIALLY_ANALYZED') summary.partiallyAnalyzedFiles++;
    else if (r.status === 'PARSE_ERROR') summary.parseErrorFiles++;
    else if (r.status === 'SKIPPED_SIZE_LIMIT') summary.skippedSizeLimitFiles++;
    else if (r.status === 'UNSUPPORTED_LANGUAGE') summary.unsupportedLanguageFiles++;

    summary.totalSymbols += r.symbols.length;
    summary.totalImports += r.imports.length;
    for (const imp of r.imports) {
      if (imp.kind === 'external_package') summary.externalImports++;
      else if (imp.resolvedFilePath) summary.resolvedInternalImports++;
      else summary.unresolvedImports++;
    }

    summary.totalCalls += r.calls.length;
    for (const c of r.calls) {
      if (c.resolved) summary.resolvedCalls++;
      else summary.unresolvedCalls++;
    }
  }

  return { files: results, summary };
}

/**
 * Analyze a local directory on disk cleanly using the same Tree-sitter AST pipeline.
 */
export async function analyzeLocalRepository(
  rootDir: string,
  options?: { maxFiles?: number; maxFileSizeBytes?: number }
): Promise<RepositoryAstAnalysis> {
  const maxFiles = options?.maxFiles ?? 200;
  const maxBytes = options?.maxFileSizeBytes ?? DEFAULT_MAX_AST_FILE_BYTES;
  const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'target']);

  const allPaths: string[] = [];
  const sourceInputs: RepositorySourceInput[] = [];

  const walkDir = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoreDirs.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = normalizeRepoPath(path.relative(rootDir, fullPath));
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        allPaths.push(relPath);
      }
    }
  };

  walkDir(rootDir);

  for (const relPath of allPaths) {
    if (sourceInputs.length >= maxFiles) break;
    if (!isSupportedSourceFile(relPath)) continue;
    const fullPath = path.join(rootDir, relPath);
    const stat = fs.statSync(fullPath);
    if (stat.size > maxBytes) {
      sourceInputs.push({
        filePath: relPath,
        sizeBytes: stat.size,
        skippedReason: `Skipped file exceeding AST size limit (${stat.size} bytes > ${maxBytes} bytes).`
      });
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    sourceInputs.push({ filePath: relPath, content, sizeBytes: stat.size });
  }

  return analyzeRepositoryFiles({
    files: sourceInputs,
    repoFilePaths: allPaths,
    maxFileSizeBytes: maxBytes
  });
}

