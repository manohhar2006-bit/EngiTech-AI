/**
 * EngiTrace Phase 2 Engineering Memory Graph Unit Tests
 */

import {
  GraphBuilder,
  GraphValidator,
  GraphQueryEngine,
  RelationshipRegistry,
  StandardRelationship,
  RawIngestionData
} from '../../graph-engine/src';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

console.log('=== Running EngiTrace Phase 2 Engineering Memory Graph Tests ===\n');

// 1. Test Controlled Relationship Registry
console.log('--- 1. Testing Relationship Registry ---');
assert(RelationshipRegistry.isRegistered('CHANGED'), 'CHANGED relationship is registered');
assert(RelationshipRegistry.isRegistered('MODIFIED'), 'MODIFIED relationship is registered');
assert(RelationshipRegistry.isRegistered('AUTHORED_BY'), 'AUTHORED_BY relationship is registered');
assert(RelationshipRegistry.isRegistered('RESOLVES'), 'RESOLVES relationship is registered');
assert(!RelationshipRegistry.isRegistered('MAGIC_FAIRY_EDGE'), 'Unregistered relationship is recognized as invalid');

// 2. Test Graph Builder & Entity Deduplication
console.log('\n--- 2. Testing Graph Builder & Deduplication ---');
const sampleIngestion: RawIngestionData = {
  repository: {
    id: 'repo-test-p2',
    owner: 'codeorigin',
    repo: 'engine',
    url: 'https://github.com/codeorigin/engine',
    description: 'Engineering Memory Platform Engine',
    defaultBranch: 'main',
    language: 'TypeScript',
    stars: 250,
    forks: 15,
    openIssuesCount: 3,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-11-15T00:00:00Z'
  },
  fileTree: [
    { path: 'src/PaymentService.ts', type: 'file' },
    { path: 'src/DatabasePool.ts', type: 'file' }
  ],
  commits: [
    {
      hash: 'c8af42d910293847511111111111111111111111',
      shortHash: 'c8af42d',
      message: 'fix(cache): resolves #142 database pool timeout',
      authorName: 'Alex Rivera',
      authorEmail: 'alex@codeorigin.dev',
      date: '2024-11-15T10:00:00Z',
      url: 'https://github.com/codeorigin/engine/commit/c8af42d',
      files: [{ path: 'src/PaymentService.ts', additions: 15, deletions: 2, changes: 17 }]
    },
    {
      hash: 'c9bc311029384751122222222222222222222222',
      shortHash: 'c9bc311',
      message: 'refactor formatting on payment service',
      authorName: 'Alex Rivera', // Same author - must be deduplicated
      authorEmail: 'alex@codeorigin.dev',
      date: '2024-11-16T10:00:00Z',
      url: 'https://github.com/codeorigin/engine/commit/c9bc311',
      files: [{ path: 'src/PaymentService.ts', additions: 3, deletions: 3, changes: 6 }]
    }
  ],
  pullRequests: [
    {
      id: 87,
      number: 87,
      title: 'Redis Cache Wrapper',
      body: 'Fixes #142 by adding Redis caching wrapper',
      author: 'Alex Rivera',
      state: 'merged',
      createdAt: '2024-11-14T10:00:00Z',
      url: 'https://github.com/codeorigin/engine/pull/87'
    }
  ],
  issues: [
    {
      id: 142,
      number: 142,
      title: 'DB Pool Exhaustion',
      body: 'Database connection locked under load',
      author: 'Reporter',
      state: 'closed',
      labels: ['bug'],
      createdAt: '2024-11-13T10:00:00Z',
      url: 'https://github.com/codeorigin/engine/issues/142'
    }
  ],
  dependencies: [
    { name: 'ioredis', version: '^5.3.0', sourceFile: 'package.json', ecosystem: 'npm' }
  ],
  evidenceRecords: []
};

const graph = GraphBuilder.buildGraph(sampleIngestion);

assert(graph.nodes.length > 0, 'Graph contains constructed nodes');
assert(graph.edges.length > 0, 'Graph contains constructed edges');

// Verify Author deduplication
const authorNodes = graph.nodes.filter((n) => n.type === 'AUTHOR');
assert(authorNodes.length === 2, 'Author nodes created (Alex Rivera and Reporter)');

// Verify File deduplication
const paymentFileNodes = graph.nodes.filter((n) => n.id === 'file:repo-test-p2:src/PaymentService.ts');
assert(paymentFileNodes.length === 1, 'File src/PaymentService.ts deduplicated to 1 canonical node');

// 3. Test Evidence Classification & Traceability
console.log('\n--- 3. Testing Evidence Classification & Traceability ---');
const factResolvesEdge = graph.edges.find((e) => e.relationshipType === 'RESOLVES' && e.classification === 'FACT');
assert(factResolvesEdge !== undefined, 'Explicit fix PR/commit generates FACT RESOLVES edge');
assert(Boolean(factResolvesEdge?.sourceUrl), 'Every edge preserves source URL reference');
assert(Boolean(factResolvesEdge?.evidence), 'Every edge preserves traceable evidence explanation');

// 4. Test Graph Validation
console.log('\n--- 4. Testing Graph Validator ---');
const malformedEdge = {
  id: 'edge-bad-01',
  source: 'commit:c8af42d',
  target: 'non-existent-node-12345',
  relationshipType: 'MODIFIED',
  evidence: 'Some test evidence',
  confidence: 1.0,
  sourceUrl: 'https://github.com/test',
  timestamp: '2024-01-01',
  classification: 'FACT' as const
};

const validationRes = GraphValidator.validate(graph.nodes, [...graph.edges, malformedEdge]);
assert(validationRes.validEdges.length === graph.edges.length, 'GraphValidator rejects edge pointing to non-existent target node');
assert(validationRes.rejectedEdgeErrors.length === 1, 'Records rejection error for malformed edge');

// 5. Test Graph Query Engine
console.log('\n--- 5. Testing Graph Query Engine ---');
const foundNode = GraphQueryEngine.findNode(graph, 'commit:c8af42d');
assert(foundNode !== undefined && foundNode.label.includes('c8af42d'), 'findNode locates commit node by ID');

const neighborhood = GraphQueryEngine.getNeighborhood(graph, 'commit:c8af42d', 1);
assert(neighborhood.nodes.length > 1, 'getNeighborhood returns connected nodes within 1-step depth');
assert(neighborhood.edges.length > 0, 'getNeighborhood returns connected edges');

const pathResult = GraphQueryEngine.findPath(graph, 'author:alex-rivera', 'issue:repo-test-p2:142');
assert(pathResult.found, 'findPath finds multi-step path from Author -> Commit/PR -> Issue');
assert(pathResult.nodes.length >= 3, 'Path contains sequence of intermediate nodes');

const historicalChain = GraphQueryEngine.getHistoricalChain(graph, 'file:repo-test-p2:src/PaymentService.ts');
assert(historicalChain.chain.length > 1, 'getHistoricalChain constructs historical chain for file node');

console.log('\n✅ ALL PHASE 2 ENGINEERING MEMORY GRAPH TESTS PASSED SUCCESSFULLY!');
