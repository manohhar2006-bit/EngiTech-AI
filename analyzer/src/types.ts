export type SupportedLanguage = 'javascript' | 'typescript' | 'jsx' | 'tsx';

export type FileAnalysisStatus =
  | 'ANALYZED'
  | 'PARTIALLY_ANALYZED'
  | 'UNSUPPORTED_LANGUAGE'
  | 'PARSE_ERROR'
  | 'SKIPPED_SIZE_LIMIT';

export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface AstImportSpecifier {
  localName: string;
  importedName: string;
  kind: 'named' | 'default' | 'namespace' | 'side_effect' | 'require';
}

export type ImportClassification =
  | 'relative_internal'
  | 'external_package'
  | 'alias_or_unresolved';

export interface AstImportDeclaration {
  source: string;
  specifiers: AstImportSpecifier[];
  isTypeOnly: boolean;
  kind: ImportClassification;
  externalPackageName?: string;
  resolvedFilePath?: string;
  resolutionNote?: string;
  range: SourceRange;
}

export interface AstExportDeclaration {
  kind: 'named' | 'default' | 'reexport' | 'commonjs';
  exportedNames: string[];
  source?: string;
  resolvedSourcePath?: string;
  range: SourceRange;
}

export interface AstParameter {
  name: string;
  typeAnnotation?: string;
}

export type AstSymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'component'
  | 'interface'
  | 'type_alias';

export interface AstSymbol {
  id: string;
  name: string;
  qualifiedName: string;
  kind: AstSymbolKind;
  filePath: string;
  parentName?: string;
  parameters: AstParameter[];
  isExported: boolean;
  isAsync?: boolean;
  jsxChildrenUsed?: string[];
  resolvedComponentsUsed?: Array<{
    componentName: string;
    targetFilePath: string;
    targetSymbolId?: string;
  }>;
  range: SourceRange;
}

export type CallTargetKind =
  | 'local_symbol'
  | 'imported_symbol'
  | 'same_class_method'
  | 'unresolved_dynamic'
  | 'unresolved_external'
  | 'unresolved';

export interface AstCallReference {
  callerName: string;
  callerFilePath: string;
  calleeText: string;
  calleeName: string;
  targetKind: CallTargetKind;
  targetFilePath?: string;
  targetSymbolName?: string;
  targetSymbolId?: string;
  resolved: boolean;
  reason?: string;
  range: SourceRange;
}

export interface FileAstResult {
  filePath: string;
  language: SupportedLanguage | 'unsupported';
  status: FileAnalysisStatus;
  imports: AstImportDeclaration[];
  exports: AstExportDeclaration[];
  symbols: AstSymbol[];
  calls: AstCallReference[];
  parseErrorsCount: number;
  warnings: string[];
  sizeBytes: number;
}

export interface RepositorySourceInput {
  filePath: string;
  content?: string;
  sizeBytes?: number;
  skippedReason?: string;
}

export interface RepositoryAstSummary {
  totalInputFiles: number;
  supportedFiles: number;
  analyzedFiles: number;
  partiallyAnalyzedFiles: number;
  parseErrorFiles: number;
  skippedSizeLimitFiles: number;
  unsupportedLanguageFiles: number;
  totalSymbols: number;
  totalImports: number;
  resolvedInternalImports: number;
  unresolvedImports: number;
  externalImports: number;
  totalCalls: number;
  resolvedCalls: number;
  unresolvedCalls: number;
  analyzedAt: string;
}

export interface RepositoryAstAnalysis {
  files: FileAstResult[];
  summary: RepositoryAstSummary;
}

