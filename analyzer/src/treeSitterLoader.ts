import { createRequire } from 'module';
import path from 'path';
import { getLanguageSpecForFile } from './languageRegistry.js';
import { SupportedLanguage } from './types.js';

export interface TreeSitterPoint {
  row: number;
  column: number;
}

export interface TreeSitterSyntaxNode {
  type: string;
  text: string;
  isNamed: boolean;
  isMissing: boolean;
  hasError: boolean;
  isError: boolean;
  startPosition: TreeSitterPoint;
  endPosition: TreeSitterPoint;
  parent: TreeSitterSyntaxNode | null;
  children: TreeSitterSyntaxNode[];
  namedChildren: TreeSitterSyntaxNode[];
  firstNamedChild: TreeSitterSyntaxNode | null;
  childForFieldName(fieldName: string): TreeSitterSyntaxNode | null;
  childrenForFieldName(fieldName: string): TreeSitterSyntaxNode[];
  descendantsOfType(types: string | string[]): TreeSitterSyntaxNode[];
}

export interface TreeSitterTree {
  readonly rootNode: TreeSitterSyntaxNode;
  delete(): void;
}

export interface TreeSitterLanguage {}

export interface TreeSitterParserInstance {
  setLanguage(language: TreeSitterLanguage | null): void;
  parse(input: string): TreeSitterTree;
  delete(): void;
}

interface TreeSitterModule {
  new (): TreeSitterParserInstance;
  init(moduleOptions?: object): Promise<void>;
  Language: {
    load(path: string): Promise<TreeSitterLanguage>;
  };
}

const requireFn = createRequire(__filename);
const RESOLUTION_SEARCH_PATHS = [
  __dirname,
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '../..'),
  path.resolve(__dirname, '../../backend'),
  path.resolve(__dirname, '../../../backend'),
  process.cwd(),
  path.resolve(process.cwd(), 'backend')
];

let tsModulePromise: Promise<TreeSitterModule> | null = null;
const loadedLanguages = new Map<string, Promise<TreeSitterLanguage>>();
let sharedParser: TreeSitterParserInstance | null = null;

async function ensureTreeSitterModule(): Promise<TreeSitterModule> {
  if (!tsModulePromise) {
    tsModulePromise = (async () => {
      const resolvedParserPath = requireFn.resolve('web-tree-sitter', {
        paths: RESOLUTION_SEARCH_PATHS
      });
      const ParserModule = requireFn(resolvedParserPath) as TreeSitterModule;
      const wasmDir = path.dirname(resolvedParserPath);
      await ParserModule.init({
        locateFile(scriptName: string) {
          return path.join(wasmDir, scriptName);
        }
      });
      return ParserModule;
    })();
  }
  return tsModulePromise;
}

export async function getLanguageGrammar(wasmFilename: string): Promise<TreeSitterLanguage> {
  if (!loadedLanguages.has(wasmFilename)) {
    const loadPromise = (async () => {
      const ParserModule = await ensureTreeSitterModule();
      const wasmPath = requireFn.resolve(`tree-sitter-wasms/out/${wasmFilename}`, {
        paths: RESOLUTION_SEARCH_PATHS
      });
      return ParserModule.Language.load(wasmPath);
    })();
    loadedLanguages.set(wasmFilename, loadPromise);
  }
  return loadedLanguages.get(wasmFilename)!;
}

export async function getParserForLanguage(
  filePathOrLang: string | SupportedLanguage
): Promise<TreeSitterParserInstance | null> {
  let wasmFilename: string | undefined;
  if (
    filePathOrLang === 'javascript' ||
    filePathOrLang === 'jsx'
  ) {
    wasmFilename = 'tree-sitter-javascript.wasm';
  } else if (filePathOrLang === 'typescript') {
    wasmFilename = 'tree-sitter-typescript.wasm';
  } else if (filePathOrLang === 'tsx') {
    wasmFilename = 'tree-sitter-tsx.wasm';
  } else {
    wasmFilename = getLanguageSpecForFile(filePathOrLang)?.wasmFilename;
  }

  if (!wasmFilename) return null;

  const ParserModule = await ensureTreeSitterModule();
  const grammar = await getLanguageGrammar(wasmFilename);
  if (!sharedParser) {
    sharedParser = new ParserModule();
  }
  sharedParser.setLanguage(grammar);
  return sharedParser;
}

