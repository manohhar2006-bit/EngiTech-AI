/**
 * EngiTrace Phase 6 - What-If Impact Analysis Engine
 * Deterministic graph-traversal and evidence-backed impact analysis service.
 */

import { EngineeringMemoryGraph, GraphNode, GraphEdge, GraphQueryEngine } from '../../../graph-engine/src';
import { GraphRepository } from './graphRepository';
import {
  ImpactQuery,
  ImpactResult,
  ImpactEvidenceItem,
  ImpactLevel,
  ExplainableConfidence,
  AffectedCategoryCounts,
  ImpactOperation
} from '../types/impactTypes';

/**
 * Controlled list of relationship types that contribute to structural code impact
 */
const IMPACT_RELEVANT_RELATIONSHIPS = new Set([
  'DEPENDS_ON',
  'CALLS',
  'IMPORTS',
  'USES',
  'CONSUMES',
  'CONTAINS',
  'DECLARES',
  'EXPOSES',
  'IMPLEMENTED_BY',
  'REFERENCES'
]);

/**
 * Node types that meaningfully support What-If Impact Analysis
 */
const SUPPORTED_NODE_TYPES = new Set([
  'FILE',
  'COMPONENT',
  'FUNCTION',
  'DEPENDENCY',
  'SERVICE',
  'MODULE',
  'API'
]);

export class ImpactAnalysisService {
  /**
   * Main entry point: Execute What-If Impact Query against repository graph
   */
  static analyzeImpact(query: ImpactQuery): ImpactResult {
    const { repositoryId, nodeId, operation = 'REMOVE', maxDepth = 3 } = query;
    const now = new Date().toISOString();

    // 1. Retrieve Graph from Storage
    const graph = GraphRepository.getGraph(repositoryId);
    if (!graph) {
      return this.generateEmptyResult(nodeId, operation, `Repository graph for "${repositoryId}" is unavailable.`);
    }

    // 2. Locate Target Node
    const decodedNodeId = decodeURIComponent(nodeId);
    const lowerNodeId = decodedNodeId.toLowerCase();

    const targetNode =
      GraphQueryEngine.findNode(graph, nodeId) ||
      GraphQueryEngine.findNode(graph, decodedNodeId) ||
      graph.nodes.find(
        (n) =>
          n.id === nodeId ||
          n.id === decodedNodeId ||
          n.label.toLowerCase() === lowerNodeId ||
          (typeof n.metadata?.path === 'string' && (n.metadata.path === decodedNodeId || n.metadata.path.toLowerCase() === lowerNodeId)) ||
          (typeof n.metadata?.hash === 'string' && (n.metadata.hash === decodedNodeId || n.metadata.hash.startsWith(decodedNodeId))) ||
          n.id.toLowerCase().endsWith(lowerNodeId) ||
          n.id.toLowerCase().includes(lowerNodeId) ||
          lowerNodeId.includes(n.id.toLowerCase())
      );

    if (!targetNode) {
      return this.generateEmptyResult(nodeId, operation, `Target node "${nodeId}" was not found in Engineering Memory Graph.`);
    }

    // 3. Verify Supported Node Type
    if (!SUPPORTED_NODE_TYPES.has(targetNode.type)) {
      return this.generateUnsupportedTypeResult(targetNode, operation);
    }

    // 4. Perform Directional Graph Traversal
    const traversalResult = this.traverseImpactGraph(graph, targetNode, maxDepth);

    // 5. Categorize Affected Nodes
    const categories = this.categorizeAffectedNodes(graph, traversalResult.directNodes, traversalResult.indirectNodes);

    // 6. Calculate Deterministic Impact Score & Level
    const targetDegree = graph.edges.filter((e) => e.source === targetNode.id || e.target === targetNode.id).length;
    const { impactScore, impactLevel } = this.calculateImpactScore(
      traversalResult.directNodes.length,
      traversalResult.indirectNodes.length,
      categories.affectedAPIs.length,
      categories.affectedTests.length,
      categories.affectedDependencies.length,
      targetDegree
    );

    // 7. Calculate Explainable Confidence
    const confidence = this.calculateConfidence(graph, traversalResult.impactEdges, categories.affectedTests.length);

    // 8. Generate Incomplete Graph Warnings
    const warnings = this.generateWarnings(graph, traversalResult.reachedDepthLimit, categories.affectedTests.length);

    // 9. Format Traceable Evidence Items
    const evidenceItems = this.formatEvidenceItems(traversalResult.impactEdges);

    // 10. Construct Human-Readable Synthesis Summary
    const summary = this.generateSummary(
      targetNode,
      operation,
      impactLevel,
      traversalResult.directNodes.length,
      traversalResult.indirectNodes.length,
      categories.affectedAPIs.length,
      categories.affectedTests.length
    );

    const categoryCounts: AffectedCategoryCounts = {
      directCount: traversalResult.directNodes.length,
      indirectCount: traversalResult.indirectNodes.length,
      fileCount: categories.affectedFiles.length,
      componentCount: categories.affectedComponents.length,
      apiCount: categories.affectedAPIs.length,
      testCount: categories.affectedTests.length,
      dependencyCount: categories.affectedDependencies.length
    };

    return {
      target: targetNode,
      operation,
      directImpact: traversalResult.directNodes,
      indirectImpact: traversalResult.indirectNodes,
      affectedFiles: categories.affectedFiles,
      affectedComponents: categories.affectedComponents,
      affectedAPIs: categories.affectedAPIs,
      affectedTests: categories.affectedTests,
      affectedDependencies: categories.affectedDependencies,
      relationships: traversalResult.impactEdges,
      evidence: evidenceItems,
      impactLevel,
      impactScore,
      confidence,
      categoryCounts,
      warnings,
      summary,
      analyzedAt: now
    };
  }

  /**
   * Directional BFS Traversal for Code Impact
   */
  private static traverseImpactGraph(
    graph: EngineeringMemoryGraph,
    targetNode: GraphNode,
    maxDepth: number
  ): {
    directNodes: GraphNode[];
    indirectNodes: GraphNode[];
    impactEdges: GraphEdge[];
    reachedDepthLimit: boolean;
  } {
    const directNodesMap = new Map<string, GraphNode>();
    const indirectNodesMap = new Map<string, GraphNode>();
    const impactEdgesMap = new Map<string, GraphEdge>();
    const visited = new Set<string>([targetNode.id]);

    // Queue entries: { nodeId, depth }
    let currentFrontier = new Set<string>([targetNode.id]);
    let reachedDepthLimit = false;

    for (let depth = 1; depth <= maxDepth; depth++) {
      const nextFrontier = new Set<string>();

      graph.edges.forEach((edge) => {
        const relType = edge.relationshipType.toUpperCase();
        if (!IMPACT_RELEVANT_RELATIONSHIPS.has(relType)) return;

        let dependentNodeId: string | null = null;

        // Direction rule:
        // Source --DEPENDS_ON/CALLS/IMPORTS/USES/CONSUMES--> Target
        // If Target is in currentFrontier, Source is a dependent being affected!
        if (currentFrontier.has(edge.target) && !visited.has(edge.source)) {
          const sourceNode = GraphQueryEngine.findNode(graph, edge.source);
          if (sourceNode && sourceNode.type !== 'REPOSITORY') {
            dependentNodeId = edge.source;
          }
        }
        // Source --CONTAINS/DECLARES/EXPOSES--> Target
        // If Source is in currentFrontier (e.g. file declaring/exposing component/function), Target is affected child!
        else if ((relType === 'CONTAINS' || relType === 'DECLARES' || relType === 'EXPOSES') && currentFrontier.has(edge.source) && !visited.has(edge.target)) {
          const sourceNode = GraphQueryEngine.findNode(graph, edge.source);
          if (sourceNode && sourceNode.type !== 'REPOSITORY') {
            dependentNodeId = edge.target;
          }
        }

        if (dependentNodeId) {
          const dependentNode = GraphQueryEngine.findNode(graph, dependentNodeId);
          if (dependentNode && SUPPORTED_NODE_TYPES.has(dependentNode.type)) {
            // Verify repository isolation if node ID has repository slug prefix
            const nodeParts = dependentNodeId.split(':');
            if (nodeParts.length >= 3 && ['file', 'function', 'component', 'service'].includes(nodeParts[0])) {
              const nodeRepo = nodeParts[1].toLowerCase().replace(/^repo-/, '').replace(/\//g, '-');
              const currentRepo = (graph.repositoryId || '').toLowerCase().replace(/^repo-/, '').replace(/\//g, '-');
              if (currentRepo && nodeRepo !== currentRepo && !currentRepo.endsWith(nodeRepo) && !nodeRepo.endsWith(currentRepo)) {
                return; // Exclude cross-repository node
              }
            }

            visited.add(dependentNodeId);
            nextFrontier.add(dependentNodeId);
            impactEdgesMap.set(edge.id, edge);

            if (depth === 1) {
              directNodesMap.set(dependentNodeId, dependentNode);
            } else {
              indirectNodesMap.set(dependentNodeId, dependentNode);
            }
          }
        }
      });

      if (nextFrontier.size === 0) break;
      if (depth === maxDepth && nextFrontier.size > 0) {
        reachedDepthLimit = true;
      }
      currentFrontier = nextFrontier;
    }

    return {
      directNodes: Array.from(directNodesMap.values()),
      indirectNodes: Array.from(indirectNodesMap.values()),
      impactEdges: Array.from(impactEdgesMap.values()),
      reachedDepthLimit
    };
  }

  /**
   * Categorize Affected Nodes into Files, Components, APIs, Tests, Dependencies
   */
  private static categorizeAffectedNodes(
    graph: EngineeringMemoryGraph,
    directNodes: GraphNode[],
    indirectNodes: GraphNode[]
  ) {
    const allAffected = [...directNodes, ...indirectNodes];

    const affectedFiles: GraphNode[] = [];
    const affectedComponents: GraphNode[] = [];
    const affectedAPIs: GraphNode[] = [];
    const affectedTests: GraphNode[] = [];
    const affectedDependencies: GraphNode[] = [];

    const isTestNode = (n: GraphNode): boolean => {
      const lower = `${n.id} ${n.label} ${n.sublabel || ''} ${n.metadata?.path || ''}`.toLowerCase();
      return lower.includes('.test.') || lower.includes('.spec.') || lower.includes('__tests__') || lower.includes('/test/');
    };

    const isApiNode = (n: GraphNode): boolean => {
      const lower = `${n.id} ${n.label} ${n.sublabel || ''} ${n.metadata?.path || ''}`.toLowerCase();
      return (
        (n.type as string) === 'API' ||
        lower.includes('/api/') ||
        lower.includes('controller') ||
        lower.includes('route') ||
        lower.includes('endpoint')
      );
    };

    allAffected.forEach((node) => {
      if (node.type === 'FILE') {
        affectedFiles.push(node);
      }
      if (node.type === 'COMPONENT' || node.type === 'FILE' || node.type === 'FUNCTION') {
        affectedComponents.push(node);
      }
      if (node.type === 'DEPENDENCY') {
        affectedDependencies.push(node);
      }
      if (isTestNode(node)) {
        affectedTests.push(node);
      }
      if (isApiNode(node)) {
        affectedAPIs.push(node);
      }
    });

    return {
      affectedFiles,
      affectedComponents,
      affectedAPIs,
      affectedTests,
      affectedDependencies
    };
  }

  /**
   * Deterministic Score & Level Calculation
   */
  private static calculateImpactScore(
    directCount: number,
    indirectCount: number,
    apiCount: number,
    testCount: number,
    dependencyCount: number,
    targetDegree: number
  ): { impactScore: number; impactLevel: ImpactLevel } {
    if (directCount === 0 && indirectCount === 0) {
      return { impactScore: 0, impactLevel: 'LOW' };
    }

    const rawScore =
      directCount * 15 +
      indirectCount * 5 +
      apiCount * 20 +
      testCount * 10 +
      dependencyCount * 10 +
      targetDegree * 2;

    const impactScore = Math.min(Math.max(rawScore, 5), 100);

    let impactLevel: ImpactLevel = 'LOW';
    if (impactScore >= 85) impactLevel = 'CRITICAL';
    else if (impactScore >= 50) impactLevel = 'HIGH';
    else if (impactScore >= 20) impactLevel = 'MEDIUM';
    else impactLevel = 'LOW';

    return { impactScore, impactLevel };
  }

  /**
   * Calculate Explainable Confidence Score & Justification
   */
  private static calculateConfidence(
    graph: EngineeringMemoryGraph,
    impactEdges: GraphEdge[],
    testCount: number
  ): ExplainableConfidence {
    const reasons: string[] = [];
    let score = 0.85; // Base graph confidence

    if (impactEdges.length > 0) {
      const factCount = impactEdges.filter((e) => e.classification === 'FACT').length;
      const factRatio = factCount / impactEdges.length;
      score *= 0.6 + factRatio * 0.4;
      reasons.push(`${Math.round(factRatio * 100)}% of impact relationship edges are verified FACT records.`);
    } else {
      reasons.push('No downstream dependency relationships found for this component.');
    }

    if (testCount > 0) {
      score += 0.05;
      reasons.push(`Detected ${testCount} associated test specifications in graph dependency graph.`);
    } else {
      score -= 0.1;
      reasons.push('No direct test relationships detected in current repository graph segment.');
    }

    if (graph.summary && graph.summary.totalNodes > 50) {
      reasons.push(`Graph evidence coverage spans ${graph.summary.totalNodes} nodes and ${graph.summary.totalEdges} edges.`);
    }

    score = Math.min(Math.max(Number(score.toFixed(2)), 0.3), 0.98);

    const rating = score >= 0.8 ? 'HIGH' : score >= 0.5 ? 'MEDIUM' : 'LOW';

    return { score, rating, reasons };
  }

  /**
   * Generate Incomplete Graph Warnings
   */
  private static generateWarnings(
    graph: EngineeringMemoryGraph,
    reachedDepthLimit: boolean,
    testCount: number
  ): string[] {
    const warnings: string[] = [];

    if (reachedDepthLimit) {
      warnings.push(
        'Traversal reached maximum depth limit (3 hops). Deep downstream indirect dependencies may exist beyond this boundary.'
      );
    }

    if (testCount === 0) {
      warnings.push(
        'No test relationship records were detected for this component. Test suite impact cannot be fully determined from current graph.'
      );
    }

    if (graph.summary && graph.summary.inferenceCount > graph.summary.factCount) {
      warnings.push(
        'Repository graph contains a high ratio of inference edges. Some dependency linkages are estimated.'
      );
    }

    return warnings;
  }

  /**
   * Format Evidence Items from Impact Edges
   */
  private static formatEvidenceItems(impactEdges: GraphEdge[]): ImpactEvidenceItem[] {
    return impactEdges.map((e) => ({
      id: `ev-imp-${e.id}`,
      edgeId: e.id,
      sourceId: e.source,
      targetId: e.target,
      relationshipType: e.relationshipType,
      classification: e.classification || 'FACT',
      confidence: e.confidence || 0.9,
      evidence: e.evidence || `${e.source} ${e.relationshipType} ${e.target}`,
      sourceUrl: e.sourceUrl,
      timestamp: e.timestamp
    }));
  }

  /**
   * Generate Summary Synthesis
   */
  private static generateSummary(
    targetNode: GraphNode,
    operation: ImpactOperation,
    impactLevel: ImpactLevel,
    directCount: number,
    indirectCount: number,
    apiCount: number,
    testCount: number
  ): string {
    const opText = operation === 'REMOVE' ? 'removing' : 'modifying';

    if (directCount === 0 && indirectCount === 0) {
      return `EngiTrace analyzed the Engineering Memory Graph for ${targetNode.type} "${targetNode.label}". No downstream components or consumers depend on this node. Removing it presents LOW architectural risk.`;
    }

    return `EngiTrace analyzed the Engineering Memory Graph for ${targetNode.type} "${targetNode.label}". ${opText.toUpperCase()} this component creates a ${impactLevel} impact across ${directCount} direct consumer(s) and ${indirectCount} indirect downstream component(s)${apiCount > 0 ? `, affecting ${apiCount} API endpoint(s)` : ''
      }${testCount > 0 ? ` and ${testCount} test suite(s)` : ''}.`;
  }

  /**
   * Fallback for Unsupported Node Types
   */
  private static generateUnsupportedTypeResult(targetNode: GraphNode, operation: ImpactOperation): ImpactResult {
    const now = new Date().toISOString();
    return {
      target: targetNode,
      operation,
      directImpact: [],
      indirectImpact: [],
      affectedFiles: [],
      affectedComponents: [],
      affectedAPIs: [],
      affectedTests: [],
      affectedDependencies: [],
      relationships: [],
      evidence: [],
      impactLevel: 'LOW',
      impactScore: 0,
      confidence: {
        score: 1.0,
        rating: 'HIGH',
        reasons: ['Node type does not represent a structural software component.']
      },
      categoryCounts: {
        directCount: 0,
        indirectCount: 0,
        fileCount: 0,
        componentCount: 0,
        apiCount: 0,
        testCount: 0,
        dependencyCount: 0
      },
      warnings: ['Impact analysis is not available for this node type yet.'],
      summary: `Impact analysis is not available for node type "${targetNode.type}". EngiTrace What-If analysis is currently available for Files, Components, Functions, Dependencies, and APIs.`,
      analyzedAt: now
    };
  }

  /**
   * Empty Fallback Result
   */
  private static generateEmptyResult(nodeId: string, operation: ImpactOperation, reason: string): ImpactResult {
    const now = new Date().toISOString();
    const dummyNode: GraphNode = {
      id: nodeId,
      type: 'FILE',
      label: nodeId,
      metadata: {},
      sourceReference: '',
      createdAt: now,
      updatedAt: now
    };

    return {
      target: dummyNode,
      operation,
      directImpact: [],
      indirectImpact: [],
      affectedFiles: [],
      affectedComponents: [],
      affectedAPIs: [],
      affectedTests: [],
      affectedDependencies: [],
      relationships: [],
      evidence: [],
      impactLevel: 'LOW',
      impactScore: 0,
      confidence: {
        score: 0.0,
        rating: 'LOW',
        reasons: [reason]
      },
      categoryCounts: {
        directCount: 0,
        indirectCount: 0,
        fileCount: 0,
        componentCount: 0,
        apiCount: 0,
        testCount: 0,
        dependencyCount: 0
      },
      warnings: [reason],
      summary: reason,
      analyzedAt: now
    };
  }
}
