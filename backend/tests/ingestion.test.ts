/**
 * EngiTrace Phase 1 Backend Ingestion Unit Tests
 */

import { normalizeGitHubUrl } from '../src/services/githubService';
import { EvidenceService } from '../src/services/evidenceService';
import { RepositoryMetadata, CommitItem, PullRequestItem, IssueItem, DependencyItem } from '../src/types/evidence';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

console.log('=== Running EngiTrace Ingestion & Evidence Tests ===\n');

// 1. Test GitHub URL Normalization
console.log('--- 1. Testing GitHub URL Normalization ---');
const u1 = normalizeGitHubUrl('https://github.com/facebook/react');
assert(u1.owner === 'facebook' && u1.repo === 'react', 'Parses standard HTTPS GitHub URL');

const u2 = normalizeGitHubUrl('https://github.com/vercel/next.js.git');
assert(u2.owner === 'vercel' && u2.repo === 'next.js', 'Parses URL with trailing .git');

const u3 = normalizeGitHubUrl('expressjs/express');
assert(u3.owner === 'expressjs' && u3.repo === 'express', 'Parses shorthand owner/repo');

let thrown = false;
try {
  normalizeGitHubUrl('invalid-url-without-slash');
} catch {
  thrown = true;
}
assert(thrown, 'Throws error on malformed URL');

// 2. Test Evidence Classification Rules (FACT vs INFERENCE vs UNKNOWN)
console.log('\n--- 2. Testing Evidence Classification Engine ---');
const sampleRepo: RepositoryMetadata = {
  id: 'repo-test-01',
  url: 'https://github.com/test/repo',
  owner: 'test',
  repo: 'repo',
  name: 'test/repo',
  description: 'Test repository',
  defaultBranch: 'main',
  language: 'TypeScript',
  stars: 100,
  forks: 10,
  openIssuesCount: 2,
  isPrivate: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const sampleCommits: CommitItem[] = [
  {
    hash: '8af42d9102938475',
    shortHash: '8af42d9',
    message: 'fix(cache): resolve #142 database pool timeout',
    authorName: 'Alex Rivera',
    authorEmail: 'alex@codeorigin.dev',
    date: '2024-11-15T10:00:00Z',
    url: 'https://github.com/test/repo/commit/8af42d9102938475',
    changedFilesCount: 1,
    files: [{ path: 'src/PaymentService.ts', additions: 15, deletions: 2, changes: 17 }]
  },
  {
    hash: '9bc3110293847511',
    shortHash: '9bc3110',
    message: 'refactor formatting',
    authorName: 'Sarah Chen',
    authorEmail: 'sarah@codeorigin.dev',
    date: '2024-11-16T10:00:00Z',
    url: 'https://github.com/test/repo/commit/9bc3110293847511',
    changedFilesCount: 1
  }
];

const samplePRs: PullRequestItem[] = [
  {
    id: 87,
    number: 87,
    title: 'Emergency Redis Cache Circuit Breaker',
    body: 'Fixes #142 by adding Redis caching wrapper',
    author: 'Alex Rivera',
    state: 'merged',
    createdAt: '2024-11-14T10:00:00Z',
    url: 'https://github.com/test/repo/pull/87'
  }
];

const sampleIssues: IssueItem[] = [
  {
    id: 142,
    number: 142,
    title: 'DB Pool Exhaustion in Peak Checkout',
    body: 'Database connections locked under load.',
    author: 'Reporter',
    state: 'closed',
    labels: ['bug'],
    createdAt: '2024-11-13T10:00:00Z',
    url: 'https://github.com/test/repo/issues/142'
  }
];

const sampleDeps: DependencyItem[] = [
  { name: 'ioredis', version: '^5.3.0', sourceFile: 'package.json', ecosystem: 'npm' }
];

const { evidenceRecords, summary } = EvidenceService.normalizeEvidence(
  sampleRepo,
  sampleCommits,
  samplePRs,
  sampleIssues,
  sampleDeps
);

assert(evidenceRecords.length > 0, 'Evidence normalization generates records');
assert(summary.factCount > 0, 'Categorizes direct metadata links as FACT');

const factRecord = evidenceRecords.find((r) => r.classification === 'FACT' && r.source.includes('commit:8af42d9'));
assert(factRecord !== undefined && factRecord.confidence >= 0.95, 'Explicit fix commit marked as FACT with high confidence');

const unknownRecord = evidenceRecords.find((r) => r.classification === 'UNKNOWN' && r.source.includes('commit:9bc3110'));
assert(unknownRecord !== undefined, 'Commit without ticket rationale marked as UNKNOWN');

console.log('\n✅ ALL INGESTION & EVIDENCE UNIT TESTS PASSED SUCCESSFULLY!');
