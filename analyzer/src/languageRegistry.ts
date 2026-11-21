import { SupportedLanguage } from './types.js';

export interface LanguageParserSpec {
  language: SupportedLanguage;
  extensions: string[];
  wasmFilename: string;
}

const LANGUAGE_SPECS: LanguageParserSpec[] = [
  {
    language: 'javascript',
    extensions: ['.js', '.mjs', '.cjs'],
    wasmFilename: 'tree-sitter-javascript.wasm'
  },
  {
    language: 'jsx',
    extensions: ['.jsx'],
    wasmFilename: 'tree-sitter-javascript.wasm'
  },
  {
    language: 'typescript',
    extensions: ['.ts', '.mts', '.cts'],
    wasmFilename: 'tree-sitter-typescript.wasm'
  },
  {
    language: 'tsx',
    extensions: ['.tsx'],
    wasmFilename: 'tree-sitter-tsx.wasm'
  }
];

const EXTENSION_TO_SPEC = new Map<string, LanguageParserSpec>();
for (const spec of LANGUAGE_SPECS) {
  for (const ext of spec.extensions) {
    EXTENSION_TO_SPEC.set(ext, spec);
  }
}

export function getLanguageSpecForFile(filePath: string): LanguageParserSpec | null {
  const lower = filePath.toLowerCase();
  // Skip declaration bundles if treated purely or keep? Allow .d.ts as typescript cleanly
  for (const [ext, spec] of EXTENSION_TO_SPEC.entries()) {
    if (lower.endsWith(ext)) {
      return spec;
    }
  }
  return null;
}

export function getLanguageForFile(filePath: string): SupportedLanguage | null {
  return getLanguageSpecForFile(filePath)?.language ?? null;
}

export function isSupportedSourceFile(filePath: string): boolean {
  return getLanguageSpecForFile(filePath) !== null;
}

export function listSupportedExtensions(): string[] {
  return Array.from(EXTENSION_TO_SPEC.keys());
}

