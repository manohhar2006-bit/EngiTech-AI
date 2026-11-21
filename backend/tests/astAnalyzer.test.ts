/**
 * EngiTrace Part 2 (Group B) - Tree-sitter AST Source-Code Analyzer Tests
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  analyzeFileSource,
  analyzeRepositoryFiles,
  analyzeLocalRepository
} from '../../analyzer/src/index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

async function runTests() {
  console.log('=== Running Part 2 Group B: Tree-sitter AST Analyzer Tests ===\n');

  // B1: TypeScript parsing (imports, exports, functions, interfaces, type aliases, ranges)
  console.log('--- B1: TypeScript AST extraction ---');
  const tsCode = `import type { UserRecord } from './types';
import { verifyToken } from './auth';
import axios from 'axios';

export interface AuthConfig {
  secret: string;
}

export type Role = 'admin' | 'user';

export async function authenticateRequest(token: string): Promise<boolean> {
  return verifyToken(token);
}
`;
  const repoFiles = new Set(['src/handler.ts', 'src/types.ts', 'src/auth.ts']);
  const b1 = await analyzeFileSource({
    filePath: 'src/handler.ts',
    content: tsCode,
    repoFilePaths: repoFiles
  });
  assert(b1.status === 'ANALYZED' && b1.language === 'typescript', 'Parses .ts file cleanly with typescript grammar');
  assert(b1.imports.length === 3, 'Extracts all 3 import statements');
  assert(b1.imports[0].isTypeOnly === true && b1.imports[0].resolvedFilePath === 'src/types.ts', 'Detects type-only import and resolves relative path to src/types.ts');
  assert(b1.imports[2].kind === 'external_package' && b1.imports[2].externalPackageName === 'axios', 'Classifies axios as external_package');
  assert(b1.symbols.some((s) => s.kind === 'interface' && s.name === 'AuthConfig' && s.isExported), 'Extracts exported interface AuthConfig');
  assert(b1.symbols.some((s) => s.kind === 'type_alias' && s.name === 'Role' && s.isExported), 'Extracts exported type alias Role');
  const authFn = b1.symbols.find((s) => s.name === 'authenticateRequest');
  assert(
    authFn !== undefined &&
      authFn.kind === 'function' &&
      authFn.isAsync === true &&
      authFn.parameters[0]?.name === 'token' &&
      authFn.range.startLine >= 10 &&
      authFn.range.endLine > authFn.range.startLine,
    'Extracts async function parameter & multi-line source range'
  );

  // B2: JavaScript CommonJS require & module.exports
  console.log('\n--- B2: JavaScript + CommonJS extraction ---');
  const jsCode = `const { computeHash } = require('./crypto');
const helper = (x) => x * 2;
function signPayload(data) {
  return helper(data.length);
}
module.exports = { signPayload };
`;
  const b2 = await analyzeFileSource({
    filePath: 'src/legacy.js',
    content: jsCode,
    repoFilePaths: new Set(['src/legacy.js', 'src/crypto/index.js'])
  });
  assert(b2.status === 'ANALYZED' && b2.language === 'javascript', 'Parses .js file cleanly');
  assert(b2.imports[0]?.resolvedFilePath === 'src/crypto/index.js', 'Resolves CommonJS require("./crypto") to src/crypto/index.js');
  assert(b2.symbols.some((s) => s.name === 'signPayload' && s.isExported === true), 'Detects module.exports symbol exposure on signPayload');

  // B3: JSX and TSX React components + nested component composition
  console.log('\n--- B3: JSX and TSX React component detection ---');
  const jsxCode = `export function Badge({ label }) {
  return <span>{label}</span>;
}
`;
  const tsxCode = `import { Badge } from './Badge';
export const UserCard: React.FC<{ name: string }> = ({ name }) => {
  return <div><Badge label={name} /></div>;
};
`;
  const b3 = await analyzeRepositoryFiles({
    files: [
      { filePath: 'src/Badge.jsx', content: jsxCode },
      { filePath: 'src/UserCard.tsx', content: tsxCode }
    ]
  });
  const badgeAst = b3.files.find((f) => f.filePath === 'src/Badge.jsx');
  const cardAst = b3.files.find((f) => f.filePath === 'src/UserCard.tsx');
  assert(Boolean(badgeAst?.symbols.some((s) => s.name === 'Badge' && s.kind === 'component')), 'Detects JSX function component Badge');
  assert(Boolean(cardAst?.symbols.some((s) => s.name === 'UserCard' && s.kind === 'component')), 'Detects TSX arrow component UserCard');
  const cardComp = cardAst?.symbols.find((s) => s.name === 'UserCard');
  assert(
    Boolean(cardComp?.resolvedComponentsUsed?.some((c) => c.componentName === 'Badge' && c.targetFilePath === 'src/Badge.jsx')),
    'Deterministically links parent component UserCard -> rendered child Badge'
  );

  // B4 & B7: Cross-file verified calls vs identifier-coincidence restraint & dynamic calls
  console.log('\n--- B4 & B7: Call extraction, cross-file resolution & conservative non-guessing ---');
  const authTs = `export function verifyToken(raw: string) { return raw.length > 0; }
export function hash(v: string) { return v; }
`;
  const billingTs = `import { verifyToken } from './auth';
export function hash(v: string) { return 'billing-' + v; }
export class CheckoutService {
  process(token: string, k: string, handlers: Record<string, () => void>) {
    this.audit();
    verifyToken(token);
    hash(token);
    handlers[k]();
  }
  audit() {}
}
`;
  const unimportedOther = `export function ghostHelper() { return 1; }`;
  const b4 = await analyzeRepositoryFiles({
    files: [
      { filePath: 'src/auth.ts', content: authTs },
      { filePath: 'src/billing.ts', content: billingTs },
      { filePath: 'src/other.ts', content: unimportedOther }
    ]
  });
  const billingAst = b4.files.find((f) => f.filePath === 'src/billing.ts')!;
  const verifyCall = billingAst.calls.find((c) => c.calleeName === 'verifyToken');
  const thisAuditCall = billingAst.calls.find((c) => c.calleeText === 'this.audit');
  const localHashCall = billingAst.calls.find((c) => c.calleeName === 'hash');
  const dynamicCall = billingAst.calls.find((c) => c.targetKind === 'unresolved_dynamic');

  assert(
    verifyCall?.resolved === true &&
      verifyCall?.targetFilePath === 'src/auth.ts' &&
      verifyCall?.targetSymbolName === 'verifyToken',
    'Resolves imported verifyToken() call to src/auth.ts:verifyToken'
  );
  assert(
    thisAuditCall?.resolved === true &&
      thisAuditCall?.targetKind === 'same_class_method' &&
      thisAuditCall?.targetSymbolName === 'CheckoutService.audit',
    'Resolves this.audit() to CheckoutService.audit within class'
  );
  assert(
    localHashCall?.resolved === true && localHashCall?.targetFilePath === 'src/billing.ts',
    'Binds hash() to local billing.ts declaration rather than colliding with auth.ts:hash'
  );
  assert(dynamicCall !== undefined && dynamicCall.resolved === false, 'Marks handlers[k]() as unresolved_dynamic without inventing target');

  // Verify nonexistent identifier call never falsely matches unimported file
  const callerGhost = await analyzeRepositoryFiles({
    files: [
      { filePath: 'src/entry.ts', content: 'export function main() { ghostHelper(); }' },
      { filePath: 'src/other.ts', content: unimportedOther }
    ]
  });
  const ghostCall = callerGhost.files[0].calls.find((c) => c.calleeName === 'ghostHelper');
  assert(ghostCall?.resolved === false, 'Does NOT match ghostHelper() across files without an explicit import');

  // B5 & B6: Unresolved relative import, ESM .js->.ts import, alias specifier
  console.log('\n--- B5 & B6: Relative resolution & alias distinction ---');
  const resolverTestTs = `import { verifyToken } from './auth.js';
import { missing } from './does-not-exist';
import { util } from '@/lib/util';
`;
  const b5 = await analyzeFileSource({
    filePath: 'src/entry.ts',
    content: resolverTestTs,
    repoFilePaths: new Set(['src/entry.ts', 'src/auth.ts'])
  });
  assert(b5.imports[0]?.resolvedFilePath === 'src/auth.ts', 'Resolves TS ESM import "./auth.js" to existing "src/auth.ts"');
  assert(b5.imports[1]?.kind === 'relative_internal' && b5.imports[1]?.resolvedFilePath === undefined, 'Keeps missing relative target unresolved (never invents file)');
  assert(b5.imports[2]?.kind === 'alias_or_unresolved' && b5.imports[2]?.resolvedFilePath === undefined, 'Classifies "@/lib/util" cleanly as alias_or_unresolved');

  // B8 & B9: Malformed syntax recovery, empty file, unsupported extension, size skip
  console.log('\n--- B8 & B9: Error isolation, empty file, unsupported extension & size caps ---');
  const b8 = await analyzeRepositoryFiles({
    files: [
      { filePath: 'src/broken.ts', content: 'export function broken( { return ;;' },
      { filePath: 'src/totally-broken.ts', content: '{{{{ ::: )))' },
      { filePath: 'src/empty.ts', content: '   \n  ' },
      { filePath: 'scripts/train.py', content: 'def train(): pass' },
      { filePath: 'src/huge.ts', content: 'export const x = 1;\n'.repeat(200) }
    ],
    maxFileSizeBytes: 500
  });
  assert(b8.files.find((f) => f.filePath === 'src/totally-broken.ts')?.status === 'PARSE_ERROR', 'Totally malformed syntax reports PARSE_ERROR');
  assert(b8.files.find((f) => f.filePath === 'src/broken.ts')?.parseErrorsCount! > 0, 'Detects Tree-sitter parse errors cleanly');
  assert(b8.files.find((f) => f.filePath === 'src/empty.ts')?.status === 'ANALYZED', 'Empty supported file reports ANALYZED with 0 errors');
  assert(b8.files.find((f) => f.filePath === 'scripts/train.py')?.status === 'UNSUPPORTED_LANGUAGE', 'Unsupported extension reports UNSUPPORTED_LANGUAGE cleanly');
  assert(b8.files.find((f) => f.filePath === 'src/huge.ts')?.status === 'SKIPPED_SIZE_LIMIT', 'Oversized source file reports SKIPPED_SIZE_LIMIT');

  // B10: Local repository walk end-to-end
  console.log('\n--- B10: analyzeLocalRepository end-to-end ---');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engitrace-ast-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'math.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.ts'), "import { add } from './math';\nexport function run() { return add(1, 2); }\n");

    const localRes = await analyzeLocalRepository(tmpDir);
    assert(localRes.summary.analyzedFiles === 2, 'Local repository scan analyzes both files cleanly');
    assert(localRes.summary.resolvedInternalImports === 1 && localRes.summary.resolvedCalls === 1, 'Resolves import and cross-file call across local directory files');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\n✅ ALL PART 2 GROUP B TREE-SITTER AST TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('Group B test failure:', err);
  process.exit(1);
});
