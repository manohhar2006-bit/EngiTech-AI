/**
 * EngiTrace Phase 6 - What-If Impact Analysis Standalone Test Suite
 */

import { GraphRepository } from '../services/graphRepository';
import { ImpactAnalysisService } from '../services/impactAnalysisService';
import { ImpactAiService } from '../services/impactAiService';
import { EngineeringMemoryGraph, GraphNode, GraphEdge } from '../../../graph-engine/src';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
  }
}

const now = new Date().toISOString();

function createMockNode(
  id: string,
  label: string,
  type: GraphNode['type'] = 'FILE',
  sublabel?: string
): GraphNode {
  return {
    id,
    label,
    type,
    sublabel: sublabel || label,
    metadata: { path: label },
    sourceReference: `https://github.com/test/repo/blob/main/${label}`,
    createdAt: now,
    updatedAt: now
  };
}

function createMockEdge(
  id: string,
  source: string,
  target: string,
  relationshipType: GraphEdge['relationshipType'] = 'DEPENDS_ON'
): GraphEdge {
  return {
    id,
    source,
    target,
    relationshipType,
    classification: 'FACT',
    confidence: 1.0,
    evidence: `${source} ${relationshipType} ${target}`,
    sourceUrl: 'https://github.com/test/repo/commit/1234',
    timestamp: now
  };
}

function setupMockGraph(repoId: string): EngineeringMemoryGraph {
  const nodes: GraphNode[] = [
    // Core target node C
    createMockNode('node-service-payment', 'PaymentService.ts', 'FILE', 'Payment Core Service'),
    // Direct dependent B (PaymentController depends on PaymentService)
    createMockNode('node-controller-payment', 'PaymentController.ts', 'COMPONENT', 'Payment Controller API'),
    // Indirect dependent A (CheckoutService depends on PaymentController)
    createMockNode('node-service-checkout', 'CheckoutService.ts', 'FILE', 'Checkout Workflow Service'),
    // Associated Test file
    createMockNode('node-test-payment', 'PaymentService.test.ts', 'FILE', 'Payment Unit Tests'),
    // Dependency
    createMockNode('node-dep-stripe', 'stripe-node', 'DEPENDENCY', 'Stripe SDK'),
    // Commit node (Historical, should NOT trigger structural code impact)
    createMockNode('node-commit-123', 'Commit #123456', 'COMMIT', 'Modified PaymentService'),
    // Isolated unrelated node
    createMockNode('node-isolated-util', 'LoggerUtils.ts', 'FILE', 'Unlinked Logger')
  ];

  const edges: GraphEdge[] = [
    // PaymentController -> DEPENDS_ON -> PaymentService (Direct)
    createMockEdge('e-dir-1', 'node-controller-payment', 'node-service-payment', 'DEPENDS_ON'),
    // CheckoutService -> DEPENDS_ON -> PaymentController (Indirect)
    createMockEdge('e-ind-1', 'node-service-checkout', 'node-controller-payment', 'DEPENDS_ON'),
    // PaymentService.test.ts -> DEPENDS_ON -> PaymentService (Test)
    createMockEdge('e-test-1', 'node-test-payment', 'node-service-payment', 'DEPENDS_ON'),
    // PaymentService -> DEPENDS_ON -> stripe-node (Dependency)
    createMockEdge('e-dep-1', 'node-service-payment', 'node-dep-stripe', 'DEPENDS_ON'),
    // Commit #123456 -> MODIFIED -> PaymentService (Historical edge, filtered out)
    createMockEdge('e-hist-1', 'node-commit-123', 'node-service-payment', 'MODIFIED')
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
        FILE: 4,
        COMPONENT: 1,
        DEPENDENCY: 1,
        COMMIT: 1,
        REPOSITORY: 0,
        FUNCTION: 0,
        PULL_REQUEST: 0,
        ISSUE: 0,
        DECISION: 0,
        INCIDENT: 0,
        OUTCOME: 0,
        AUTHOR: 0
      },
      edgesByType: { DEPENDS_ON: 4, MODIFIED: 1 },
      factCount: 5,
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
  console.log('🧪 RUNNING ENGITRACE PHASE 6 WHAT-IF IMPACT TEST SUITE');
  console.log('======================================================\n');

  const repoId = 'test-impact-repo';
  setupMockGraph(repoId);

  // Test 1: Direct & Indirect Traversal
  console.log('\n--- Test 1: Direct vs. Indirect Traversal ---');
  const result1 = ImpactAnalysisService.analyzeImpact({
    repositoryId: repoId,
    nodeId: 'node-service-payment',
    operation: 'REMOVE',
    maxDepth: 3
  });

  assert(result1.target.id === 'node-service-payment', 'Target node correctly identified');
  assert(result1.directImpact.some((n) => n.id === 'node-controller-payment'), 'PaymentController identified as DIRECT impact');
  assert(result1.indirectImpact.some((n) => n.id === 'node-service-checkout'), 'CheckoutService identified as INDIRECT impact');
  assert(result1.affectedTests.some((n) => n.id === 'node-test-payment'), 'PaymentService.test.ts detected in affectedTests');

  // Test 2: Relationship Filtering & Directionality
  console.log('\n--- Test 2: Relationship Filtering & Directionality ---');
  assert(
    !result1.directImpact.some((n) => n.id === 'node-commit-123') &&
    !result1.indirectImpact.some((n) => n.id === 'node-commit-123'),
    'Commit node excluded from structural code impact traversal'
  );

  // Test 3: Unrelated Node Isolation
  console.log('\n--- Test 3: Unrelated Node Isolation ---');
  assert(
    !result1.directImpact.some((n) => n.id === 'node-isolated-util') &&
    !result1.indirectImpact.some((n) => n.id === 'node-isolated-util'),
    'Unrelated LoggerUtils node remains isolated'
  );

  // Test 4: Empty Impact for Isolated Node
  console.log('\n--- Test 4: Isolated Node Impact Analysis ---');
  const resultIsolated = ImpactAnalysisService.analyzeImpact({
    repositoryId: repoId,
    nodeId: 'node-isolated-util',
    operation: 'REMOVE'
  });
  assert(resultIsolated.impactLevel === 'LOW', 'Isolated node impact level is LOW');
  assert(resultIsolated.impactScore === 0, 'Isolated node impact score is 0');
  assert(resultIsolated.directImpact.length === 0, 'Isolated node has 0 direct dependents');

  // Test 5: Impact Scoring & Level Thresholds
  console.log('\n--- Test 5: Impact Scoring & Classification ---');
  assert(result1.impactScore > 0, `Impact score is non-zero (${result1.impactScore})`);
  assert(result1.impactLevel === 'MEDIUM' || result1.impactLevel === 'HIGH', `Impact level classified as ${result1.impactLevel}`);
  assert(result1.confidence.rating === 'HIGH', `Confidence rating is ${result1.confidence.rating}`);

  // Test 6: Unsupported Node Type Handling
  console.log('\n--- Test 6: Unsupported Node Type Handling ---');
  const resultCommit = ImpactAnalysisService.analyzeImpact({
    repositoryId: repoId,
    nodeId: 'node-commit-123',
    operation: 'REMOVE'
  });
  assert(resultCommit.warnings.length > 0, 'Warning returned for unsupported COMMIT node type');
  assert(resultCommit.warnings[0].includes('not available for this node type'), 'Correct user-facing warning message');

  // Test 7: AI Explanation Grounding & Score Preservation
  console.log('\n--- Test 7: AI Grounded Explanation ---');
  const aiExplanation = await ImpactAiService.explainImpact(result1);
  assert(aiExplanation.impactScore === result1.impactScore, 'AI explanation preserves deterministic impact score');
  assert(aiExplanation.impactLevel === result1.impactLevel, 'AI explanation preserves deterministic impact level');
  assert(Array.isArray(aiExplanation.recommendedMitigations) && aiExplanation.recommendedMitigations.length > 0, 'Actionable mitigations returned');

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE 6 WHAT-IF IMPACT TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
