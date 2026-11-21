/**
 * EngiTrace Phase 4 - AI-Assisted Evidence Reasoning Unit & Integration Tests
 */

import { GraphBuilder, EngineeringMemoryGraph, RawIngestionData } from '../../graph-engine/src';
import { GraphRepository } from '../src/services/graphRepository';
import { WhyExplorerService } from '../src/services/whyExplorerService';
import { EvidenceContextBuilder } from '../../ai-engine/services/evidenceContextBuilder';
import { StructuredOutputValidator } from '../../ai-engine/validators/structuredOutputValidator';
import { ReasoningService } from '../../ai-engine/services/reasoningService';
import { ReasoningCache } from '../../ai-engine/cache/reasoningCache';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

async function runTests() {
  console.log('=== Running EngiTrace Phase 4 AI Evidence Reasoning Unit Tests ===\n');

  // 1. Setup Mock Ingestion Data & Engineering Memory Graph
  const sampleIngestion: RawIngestionData = {
    repository: {
      id: 'repo-ai-test',
      owner: 'codeorigin',
      repo: 'checkout-service',
      url: 'https://github.com/codeorigin/checkout-service',
      description: 'High throughput checkout engine',
      defaultBranch: 'main',
      language: 'TypeScript',
      stars: 1200,
      forks: 95,
      openIssuesCount: 2,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-11-20T00:00:00Z'
    },
    fileTree: [
      { path: 'src/services/PaymentService.ts', type: 'file' },
      { path: 'src/cache/RedisPool.ts', type: 'file' }
    ],
    commits: [
      {
        hash: 'c8af42d91029384758af42d91029384758af42d9',
        shortHash: 'c8af42d',
        message: 'feat(redis): add connection pool wrapper resolves #142',
        authorName: 'Alex Rivera',
        authorEmail: 'alex@codeorigin.dev',
        date: '2024-11-15T10:00:00Z',
        url: 'https://github.com/codeorigin/checkout-service/commit/c8af42d',
        files: [{ path: 'src/services/PaymentService.ts', additions: 35, deletions: 2, changes: 37 }]
      }
    ],
    pullRequests: [
      {
        id: 87,
        number: 87,
        title: 'Redis Caching for Payment Service',
        body: 'Fixes #142 by preventing PostgreSQL connection pool starvation.',
        author: 'Alex Rivera',
        state: 'merged',
        createdAt: '2024-11-14T10:00:00Z',
        url: 'https://github.com/codeorigin/checkout-service/pull/87'
      }
    ],
    issues: [
      {
        id: 142,
        number: 142,
        title: 'Payment Timeouts under Surge Load',
        body: 'High concurrency checkout causes connection pool locks.',
        author: 'Ops Team',
        state: 'closed',
        labels: ['critical', 'performance'],
        createdAt: '2024-11-13T10:00:00Z',
        url: 'https://github.com/codeorigin/checkout-service/issues/142'
      }
    ],
    dependencies: [
      { name: 'ioredis', version: '^5.3.0', sourceFile: 'package.json', ecosystem: 'npm' }
    ],
    evidenceRecords: []
  };

  const graph: EngineeringMemoryGraph = GraphBuilder.buildGraph(sampleIngestion);
  GraphRepository.saveGraph('repo-ai-test', graph);

  const fileNodeId = 'file:repo-ai-test:src/services/PaymentService.ts';
  const whyResult = WhyExplorerService.executeQuery({
    repositoryId: 'repo-ai-test',
    nodeId: fileNodeId,
    question: 'Why does PaymentService.ts exist?'
  });

  // --- Test 1: Evidence Context Builder ---
  console.log('--- 1. Testing Evidence Context Builder & Ranking ---');
  const aiContext = EvidenceContextBuilder.buildContext(whyResult);

  assert(aiContext.target.id === fileNodeId, 'AIContext target node matches');
  assert(aiContext.evidence.length > 0, 'Evidence records present in AIContext');
  assert(aiContext.historicalChain.length >= 3, 'Historical chain preserved');
  assert(aiContext.facts.length > 0, 'Established facts preserved');
  assert(aiContext.sourceLinks.length > 0, 'Source URLs preserved');

  const serialized = EvidenceContextBuilder.serializeContext(aiContext);
  assert(typeof serialized === 'string' && serialized.includes('PaymentService.ts'), 'Context serialized to compact string payload');

  // --- Test 2: Structured Output Validator & Hallucination Defense ---
  console.log('\n--- 2. Testing Structured Output Validation & Hallucination Defense ---');

  const validEvidenceId = aiContext.evidence[0]?.id || 'ev-rec-1';

  const mockRawModelOutput = {
    summary: 'PaymentService was modified to include Redis connection pooling.',
    claims: [
      {
        text: 'PaymentService.ts was modified by commit c8af42d.',
        classification: 'FACT',
        confidence: 0.98,
        evidenceIds: [validEvidenceId],
        sourceUrls: ['https://github.com/codeorigin/checkout-service/commit/c8af42d']
      },
      {
        text: 'The Redis pooling change mitigated database connection locks.',
        classification: 'INFERENCE',
        confidence: 0.88,
        evidenceIds: [validEvidenceId],
        sourceUrls: ['https://github.com/codeorigin/checkout-service/pull/87'],
        reasoning: 'PR #87 body details PostgreSQL pool starvation.'
      },
      {
        text: 'Redis was chosen because it was recommended in an internal company blog.',
        classification: 'FACT', // Invalid claim! No blog evidence exists!
        confidence: 0.99,
        evidenceIds: ['bogus-fake-evidence-999'], // Fake evidence ID
        sourceUrls: []
      }
    ],
    reasoningSteps: [
      'Verified direct commit modification',
      'Verified linked PR #87'
    ],
    unknownAreas: [
      {
        area: 'Redis TTL Parameter Selection',
        reason: 'No ADR or commit message explains 300s cache TTL.'
      }
    ]
  };

  const validationResult = StructuredOutputValidator.validate(mockRawModelOutput, aiContext);

  assert(validationResult.isValid === true, 'Validation passed');
  assert(validationResult.claims.length === 3, 'Extracted 3 claims');
  assert(validationResult.claims[0].classification === 'FACT', 'Valid fact claim preserved');
  assert(validationResult.claims[1].classification === 'INFERENCE', 'Valid inference claim preserved');

  // Grounding check on fake evidence claim:
  const hallucinatedClaim = validationResult.claims.find((c) => c.text.includes('internal company blog'));
  assert(
    hallucinatedClaim?.classification === 'UNKNOWN',
    'Hallucination Defense: Claim citing non-existent evidence ID downgraded from FACT to UNKNOWN'
  );
  assert(validationResult.validationLog.some((log) => log.includes('Hallucination Defense')), 'Validation log recorded hallucination defense intervention');

  // --- Test 3: Reasoning Service & Fallback Mechanism ---
  console.log('\n--- 3. Testing AI Reasoning Orchestrator Service & Fallback ---');
  ReasoningCache.clear();

  const reasoningResponse = await ReasoningService.reasonOverEvidence(whyResult);

  assert(reasoningResponse.target.id === fileNodeId, 'Reasoning response target matches');
  assert(reasoningResponse.claims.length > 0, 'Reasoning response contains structured claims');
  assert(reasoningResponse.confidence.level === 'HIGH' || reasoningResponse.confidence.level === 'MEDIUM', 'Confidence level calculated');
  assert(reasoningResponse.modelMetadata.cached === false, 'Initial call is uncached');

  // --- Test 4: Response Caching ---
  console.log('\n--- 4. Testing AI Response Server-Side Cache ---');
  const secondCallResponse = await ReasoningService.reasonOverEvidence(whyResult);
  assert(secondCallResponse.modelMetadata.cached === true, 'Second identical request served from cache');

  // --- Test 5: Unknown Rationale Handling ---
  console.log('\n--- 5. Testing Honest UNKNOWN Rationale Output ---');
  assert(reasoningResponse.unknowns.length > 0, 'Undocumented areas explicitly flagged as UNKNOWN');

  console.log('\n✅ ALL PHASE 4 AI EVIDENCE REASONING UNIT TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Unexpected test error:', err);
  process.exit(1);
});
