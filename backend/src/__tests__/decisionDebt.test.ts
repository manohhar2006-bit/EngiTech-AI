/**
 * EngiTrace Phase 5 - Decision Debt & Engineering Risk Intelligence Standalone Verification Test Suite
 */

import { GraphRepository } from '../services/graphRepository';
import { DecisionDebtService } from '../services/decisionDebtService';
import { DecisionDebtDetectors } from '../services/decision-debt/decisionDebtDetectors';
import { DecisionDebtAiService } from '../services/decisionDebtAiService';
import { EngineeringMemoryGraph, GraphNode, GraphEdge } from '../../../graph-engine/src';
import { NormalizedEvidence } from '../types/evidence';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
  }
}

const now = new Date().toISOString();

function createMockNode(id: string, label: string, type: GraphNode['type'] = 'FILE', sublabel?: string): GraphNode {
  return {
    id,
    label,
    type,
    sublabel: sublabel || label,
    metadata: {},
    sourceReference: 'https://github.com/test/repo',
    createdAt: now,
    updatedAt: now
  };
}

function createMockEdge(id: string, source: string, target: string, relationshipType: GraphEdge['relationshipType'] = 'DEPENDS_ON'): GraphEdge {
  return {
    id,
    source,
    target,
    relationshipType,
    classification: 'FACT',
    confidence: 1.0,
    evidence: 'ev-1',
    sourceUrl: 'https://github.com/test/repo/commit/1234',
    timestamp: now
  };
}

function setupMockGraph(repoId: string): EngineeringMemoryGraph {
  const nodes: GraphNode[] = [
    createMockNode('node-file-payment', 'PaymentService.ts', 'FILE', 'Payment Core'),
    createMockNode('node-file-auth', 'AuthMiddleware.ts', 'FILE', 'Auth Layer'),
    createMockNode('node-dep-redis', 'RedisAdapter.ts', 'DEPENDENCY', 'Redis Driver'),
    createMockNode('node-isolated', 'IsolatedUtility.ts', 'FILE', 'Unlinked File')
  ];

  const edges: GraphEdge[] = [
    createMockEdge('edge-1', 'node-file-payment', 'node-dep-redis', 'DEPENDS_ON'),
    createMockEdge('edge-2', 'node-file-auth', 'node-file-payment', 'CALLS')
  ];

  const graph: EngineeringMemoryGraph = {
    repositoryId: repoId,
    nodes,
    edges,
    summary: {
      repositoryId: repoId,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodesByType: {
        FILE: 3,
        DEPENDENCY: 1,
        REPOSITORY: 0,
        FUNCTION: 0,
        COMPONENT: 0,
        COMMIT: 0,
        PULL_REQUEST: 0,
        ISSUE: 0,
        DECISION: 0,
        INCIDENT: 0,
        OUTCOME: 0,
        AUTHOR: 0
      },
      edgesByType: { DEPENDS_ON: 1, CALLS: 1 },
      factCount: 2,
      inferenceCount: 0,
      unknownCount: 0,
      topConnectedNodes: [],
      builtAt: now
    }
  };

  GraphRepository.saveGraph(repoId, graph);
  return graph;
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING ENGITRACE PHASE 5 DECISION DEBT TEST SUITE');
  console.log('======================================================\n');

  const repoId = 'test-debt-repo';
  setupMockGraph(repoId);

  // Test 1: Missing Rationale Detector
  console.log('\n--- Test 1: Missing Rationale Detector ---');
  const node = createMockNode('node-file-payment', 'PaymentService.ts', 'FILE');
  const nodeEvidence: NormalizedEvidence[] = [
    {
      id: 'ev-mod-1',
      repositoryId: repoId,
      source: 'commit:1111',
      target: 'file:PaymentService.ts',
      relationshipType: 'MODIFIED_BY',
      classification: 'FACT',
      confidence: 1.0,
      title: 'Commit #1111 modified PaymentService.ts',
      description: 'No ticket reference',
      sourceUrl: 'https://github.com/test/repo/commit/1111',
      timestamp: '2024-01-01T00:00:00Z'
    },
    {
      id: 'ev-mod-2',
      repositoryId: repoId,
      source: 'commit:2222',
      target: 'file:PaymentService.ts',
      relationshipType: 'MODIFIED_BY',
      classification: 'FACT',
      confidence: 1.0,
      title: 'Commit #2222 modified PaymentService.ts',
      description: 'Adjusted pool',
      sourceUrl: 'https://github.com/test/repo/commit/2222',
      timestamp: '2024-02-01T00:00:00Z'
    }
  ];

  const signalA = DecisionDebtDetectors.detectMissingRationale(node, nodeEvidence);
  assert(signalA !== null, 'Missing rationale signal generated');
  assert(signalA?.type === 'MISSING_RATIONALE', 'Signal type is MISSING_RATIONALE');
  assert(signalA?.severity === 'MEDIUM', 'Severity is MEDIUM');

  // Test 2: Stale Reasoning Detector
  console.log('\n--- Test 2: Stale Reasoning Detector ---');
  const edges: GraphEdge[] = [
    createMockEdge('e1', 'node-file-payment', 'node-dep-redis', 'DEPENDS_ON'),
    createMockEdge('e2', 'node-file-auth', 'node-file-payment', 'CALLS')
  ];
  const oldEvidence: NormalizedEvidence[] = [
    {
      id: 'ev-old-1',
      repositoryId: repoId,
      source: 'commit:0001',
      target: 'file:PaymentService.ts',
      relationshipType: 'MODIFIED_BY',
      classification: 'FACT',
      confidence: 1.0,
      title: 'Old Redis wrapper commit',
      description: 'Legacy migration',
      sourceUrl: 'https://github.com/test/repo/commit/0001',
      timestamp: '2023-01-01T00:00:00Z'
    }
  ];

  const signalC = DecisionDebtDetectors.detectStaleReasoning(node, oldEvidence, edges);
  assert(signalC !== null, 'Stale reasoning signal generated');
  assert(signalC?.type === 'STALE_REASONING', 'Signal type is STALE_REASONING');

  // Test 3: Repeated Modification Detector
  console.log('\n--- Test 3: Repeated Modifications Detector ---');
  const churnEvidence: NormalizedEvidence[] = Array.from({ length: 5 }, (_, i) => ({
    id: `ev-churn-${i}`,
    repositoryId: repoId,
    source: `commit:${i}`,
    target: 'file:PaymentService.ts',
    relationshipType: 'MODIFIED_BY',
    classification: 'FACT',
    confidence: 1.0,
    title: `Commit #${i} modified PaymentService`,
    description: `Iterative refactor ${i}`,
    sourceUrl: `https://github.com/test/repo/commit/${i}`,
    timestamp: '2025-01-01T00:00:00Z'
  }));

  const signalD = DecisionDebtDetectors.detectRepeatedModifications(node, churnEvidence);
  assert(signalD !== null, 'Repeated modifications signal generated');
  assert(signalD?.type === 'REPEATED_MODIFICATIONS', 'Signal type is REPEATED_MODIFICATIONS');

  // Test 4: Insufficient Evidence Handling
  console.log('\n--- Test 4: Insufficient Evidence Handling ---');
  const debtInsufficient = DecisionDebtService.calculateComponentDebt(repoId, 'node-isolated');
  assert(debtInsufficient.level === 'INSUFFICIENT', 'Level is INSUFFICIENT');
  assert(debtInsufficient.score === 0, 'Score is 0');
  assert(debtInsufficient.reviewPriority === 'INSUFFICIENT_DATA', 'Review priority is INSUFFICIENT_DATA');

  // Test 5: Repository-wide Decision Debt Analysis
  console.log('\n--- Test 5: Repository Decision Debt Summary ---');
  const repoSummary = DecisionDebtService.analyzeRepositoryDebt(repoId);
  assert(repoSummary.totalComponents > 0, 'Total components analyzed > 0');
  assert(repoSummary.evidenceCoverage >= 0 && repoSummary.evidenceCoverage <= 1.0, 'Evidence coverage between 0 and 1.0');
  assert(repoSummary.historicalCoverage >= 0 && repoSummary.historicalCoverage <= 1.0, 'Historical coverage between 0 and 1.0');

  // Test 6: AI Explanation Grounding Score Preservation
  console.log('\n--- Test 6: AI Explanation Grounding ---');
  const debt = DecisionDebtService.calculateComponentDebt(repoId, 'node-file-payment');
  const aiExplanation = await DecisionDebtAiService.explainDecisionDebt(debt);
  assert(aiExplanation.score === debt.score, 'AI explanation preserves deterministic score');
  assert(aiExplanation.level === debt.level, 'AI explanation preserves debt level');
  assert(Array.isArray(aiExplanation.recommendedActions), 'Recommended actions returned as array');

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE 5 DECISION DEBT TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
