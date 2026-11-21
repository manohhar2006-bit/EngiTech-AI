/**
 * EngiTrace Phase 3 - WHY Explorer & Historical Reconstruction Unit Tests
 */

import {
  GraphBuilder,
  EngineeringMemoryGraph,
  RawIngestionData
} from '../../graph-engine/src';
import { GraphRepository } from '../src/services/graphRepository';
import { WhyExplorerService } from '../src/services/whyExplorerService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

console.log('=== Running EngiTrace Phase 3 WHY Explorer Unit Tests ===\n');

// 1. Setup Mock Ingestion Data & Graph
const sampleIngestion: RawIngestionData = {
  repository: {
    id: 'repo-why-test',
    owner: 'codeorigin',
    repo: 'payment-core',
    url: 'https://github.com/codeorigin/payment-core',
    description: 'Payment Service Engine',
    defaultBranch: 'main',
    language: 'TypeScript',
    stars: 500,
    forks: 42,
    openIssuesCount: 5,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-11-20T00:00:00Z'
  },
  fileTree: [
    { path: 'src/services/PaymentService.ts', type: 'file' },
    { path: 'src/cache/RedisWrapper.ts', type: 'file' }
  ],
  commits: [
    {
      hash: 'c8af42d91029384758af42d91029384758af42d9',
      shortHash: 'c8af42d',
      message: 'feat(cache): add Redis caching resolves #142',
      authorName: 'Alex Rivera',
      authorEmail: 'alex@codeorigin.dev',
      date: '2024-11-15T10:00:00Z',
      url: 'https://github.com/codeorigin/payment-core/commit/c8af42d',
      files: [{ path: 'src/services/PaymentService.ts', additions: 25, deletions: 4, changes: 29 }]
    }
  ],
  pullRequests: [
    {
      id: 87,
      number: 87,
      title: 'Mitigate Payment Timeout via Redis Cache',
      body: 'Fixes #142 by adding Redis caching wrapper to PaymentService',
      author: 'Alex Rivera',
      state: 'merged',
      createdAt: '2024-11-14T10:00:00Z',
      url: 'https://github.com/codeorigin/payment-core/pull/87'
    }
  ],
  issues: [
    {
      id: 142,
      number: 142,
      title: 'Payment Request Timeouts under peak traffic',
      body: 'PostgreSQL connection pool exhausted during checkout surge.',
      author: 'Support Team',
      state: 'closed',
      labels: ['bug', 'critical'],
      createdAt: '2024-11-13T10:00:00Z',
      url: 'https://github.com/codeorigin/payment-core/issues/142'
    }
  ],
  dependencies: [
    { name: 'ioredis', version: '^5.3.0', sourceFile: 'package.json', ecosystem: 'npm' }
  ],
  evidenceRecords: []
};

const graph: EngineeringMemoryGraph = GraphBuilder.buildGraph(sampleIngestion);
GraphRepository.saveGraph('repo-why-test', graph);

console.log('--- 1. Testing WHY Query on File Node (PaymentService.ts) ---');
const fileNodeId = 'file:repo-why-test:src/services/PaymentService.ts';
const whyResult = WhyExplorerService.executeQuery({
  repositoryId: 'repo-why-test',
  nodeId: fileNodeId,
  question: 'Why does PaymentService.ts exist?'
});

assert(whyResult.target.id === fileNodeId, 'Target node correctly identified');
assert(whyResult.historicalChain.length >= 3, 'Historical chain contains 3+ steps (FILE -> COMMIT -> PR -> ISSUE)');
assert(whyResult.historicalChain[0].node.type === 'FILE', 'Step 1 is target FILE');
assert(whyResult.confidence.level === 'HIGH' || whyResult.confidence.level === 'MEDIUM', 'Confidence level computed (HIGH/MEDIUM)');
assert(whyResult.confidence.reasons.length > 0, 'Confidence metrics include explainable reasons');
assert(whyResult.facts.length > 0, 'Verified FACT statements extracted');
assert(whyResult.sourceLinks.length > 0, 'Source links collected for GitHub commits/PRs/issues');

console.log('\n--- 2. Testing Evidence Classification (FACT / INFERENCE / UNKNOWN) ---');
const factItems = whyResult.facts;
const infItems = whyResult.inferences;
const unkItems = whyResult.unknowns;

assert(factItems.some((f) => f.statement.includes('Commit') || f.statement.includes('PaymentService')), 'FACT correctly identifies commit/file modification');
assert(unkItems.some((u) => u.area.includes('ADR') || u.area.includes('Architecture')), 'UNKNOWN correctly identifies missing explicit ADR documentation');

console.log('\n--- 3. Testing Non-Hallucination on Unindexed Node ---');
const unindexedResult = WhyExplorerService.executeQuery({
  repositoryId: 'repo-why-test',
  nodeId: 'non-existent-file-999.ts'
});

assert(unindexedResult.confidence.level === 'LOW', 'Unindexed node yields LOW confidence score');
assert(unindexedResult.unknowns.length > 0, 'Unindexed node returns UNKNOWN as a first-class result');
assert(unindexedResult.summary.includes('Insufficient historical evidence'), 'Summary explicitly acknowledges lack of evidence without hallucinating');

console.log('\n✅ ALL PHASE 3 WHY EXPLORER TESTS PASSED SUCCESSFULLY!');
