/**
 * EngiTrace Engineering Memory Graph API Service
 */

import { GraphNode, GraphEdge, GraphSummary, WhyGraphData, NodeType } from '../types/graph';
import { API_BASE_URL } from '../config';
import { MOCK_HERO_GRAPH } from '../data/mockGraph';

export class GraphService {
  /**
   * Fetch complete Engineering Memory Graph for a repository
   */
  static async fetchGraph(repositoryId: string): Promise<WhyGraphData | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(repositoryId)}/graph`);
      if (!response.ok) {
        if (repositoryId === 'demo-repo' || !repositoryId) {
          return MOCK_HERO_GRAPH;
        }
        return null;
      }
      const data = (await response.json()) as WhyGraphData;
      return data;
    } catch (err) {
      console.warn(`[GraphService] Failed to fetch graph for ${repositoryId}:`, err);
      if (repositoryId === 'demo-repo' || !repositoryId) {
        return MOCK_HERO_GRAPH;
      }
      return null;
    }
  }

  /**
   * Fetch Engineering Memory Graph Summary
   */
  static async fetchGraphSummary(repositoryId: string): Promise<GraphSummary | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(repositoryId)}/graph/summary`);
      if (!response.ok) return null;
      const data = (await response.json()) as { summary: GraphSummary };
      return data.summary;
    } catch {
      return null;
    }
  }

  /**
   * Fetch nodes filtered by node type
   */
  static async fetchNodesByType(repositoryId: string, type: NodeType): Promise<GraphNode[]> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(repositoryId)}/graph/nodes?type=${encodeURIComponent(type)}`
      );
      if (!response.ok) return [];
      const data = (await response.json()) as { total: number; nodes: GraphNode[] };
      return data.nodes || [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch all edges for a repository graph
   */
  static async fetchEdges(repositoryId: string): Promise<GraphEdge[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(repositoryId)}/graph/edges`);
      if (!response.ok) return [];
      const data = (await response.json()) as { total: number; edges: GraphEdge[] };
      return data.edges || [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch single node details with 1-step neighborhood
   */
  static async fetchNodeDetails(
    repositoryId: string,
    nodeId: string
  ): Promise<{ node: GraphNode; connectedEdges: GraphEdge[]; connectedNodes: GraphNode[] } | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${repositoryId}/graph/node/${encodeURIComponent(nodeId)}`);
      if (!response.ok) return null;
      return (await response.json()) as {
        node: GraphNode;
        connectedEdges: GraphEdge[];
        connectedNodes: GraphNode[];
      };
    } catch {
      return null;
    }
  }

  /**
   * Find shortest path between two nodes
   */
  static async findPath(
    repositoryId: string,
    sourceId: string,
    targetId: string
  ): Promise<{ found: boolean; nodes: GraphNode[]; edges: GraphEdge[] }> {
    try {
      const url = `${API_BASE_URL}/repositories/${repositoryId}/graph/path?source=${encodeURIComponent(sourceId)}&target=${encodeURIComponent(targetId)}`;
      const response = await fetch(url);
      if (!response.ok) return { found: false, nodes: [], edges: [] };
      return (await response.json()) as { found: boolean; nodes: GraphNode[]; edges: GraphEdge[] };
    } catch {
      return { found: false, nodes: [], edges: [] };
    }
  }

  /**
   * Constructs a pure focused subgraph containing only specified relevant node IDs
   * and valid interconnecting edges present in the full repository graph.
   * Does NOT mutate original graph data.
   */
  static createFocusedSubgraph(
    fullGraph: WhyGraphData | null,
    relevantNodeIds: string[]
  ): WhyGraphData {
    if (!relevantNodeIds || relevantNodeIds.length === 0) {
      return { nodes: [], edges: [] };
    }

    const relevantIdSet = new Set(relevantNodeIds);
    const nodeMap = new Map<string, GraphNode>();

    if (fullGraph && Array.isArray(fullGraph.nodes)) {
      for (const node of fullGraph.nodes) {
        if (relevantIdSet.has(node.id)) {
          nodeMap.set(node.id, { ...node });
        }
      }
    }

    const edgeMap = new Map<string, GraphEdge>();

    if (fullGraph && Array.isArray(fullGraph.edges)) {
      for (const edge of fullGraph.edges) {
        if (relevantIdSet.has(edge.source) && relevantIdSet.has(edge.target)) {
          edgeMap.set(edge.id, { ...edge });
        }
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
      summary: fullGraph?.summary
    };
  }

  /**
   * Constructs a focused WHY subgraph from a WhyResult and optional full graph.
   * Combines target node, historical chain nodes, connected evidence edges,
   * and preserves classification (FACT/INFERENCE/UNKNOWN), confidence, and source links.
   */
  static createFocusedWhySubgraph(
    fullGraph: WhyGraphData | null,
    whyResult: any
  ): WhyGraphData {
    if (!whyResult || !whyResult.target) {
      return { nodes: [], edges: [] };
    }

    const nodeMap = new Map<string, GraphNode>();
    const relevantIdSet = new Set<string>();

    // 1. Target Node
    const targetId = whyResult.target.id;
    relevantIdSet.add(targetId);
    nodeMap.set(targetId, {
      ...whyResult.target,
      highlighted: true
    });

    // 2. Historical Chain Nodes
    if (Array.isArray(whyResult.historicalChain)) {
      for (const step of whyResult.historicalChain) {
        if (step.node && step.node.id) {
          relevantIdSet.add(step.node.id);
          if (!nodeMap.has(step.node.id)) {
            nodeMap.set(step.node.id, { ...step.node });
          }
        }
      }
    }

    // 3. Evidence Items (source and target IDs)
    if (Array.isArray(whyResult.evidence)) {
      for (const ev of whyResult.evidence) {
        if (ev.source) relevantIdSet.add(ev.source);
        if (ev.target) relevantIdSet.add(ev.target);
      }
    }

    // Enrich node details from fullGraph if available
    if (fullGraph && Array.isArray(fullGraph.nodes)) {
      for (const gNode of fullGraph.nodes) {
        if (relevantIdSet.has(gNode.id)) {
          const existing = nodeMap.get(gNode.id);
          nodeMap.set(gNode.id, {
            ...gNode,
            ...existing,
            metadata: {
              ...(gNode.metadata || {}),
              ...(existing?.metadata || {})
            }
          });
        }
      }
    }

    // 4. Collect Edges
    const edgeMap = new Map<string, GraphEdge>();

    // From full graph edges where both source and target are in relevant set
    if (fullGraph && Array.isArray(fullGraph.edges)) {
      for (const edge of fullGraph.edges) {
        if (relevantIdSet.has(edge.source) && relevantIdSet.has(edge.target)) {
          edgeMap.set(edge.id, { ...edge });
        }
      }
    }

    // From whyResult evidence records
    if (Array.isArray(whyResult.evidence)) {
      for (const ev of whyResult.evidence) {
        if (ev.source && ev.target && relevantIdSet.has(ev.source) && relevantIdSet.has(ev.target)) {
          const edgeId = ev.id || `ev-edge-${ev.source}-${ev.target}`;
          if (!edgeMap.has(edgeId)) {
            edgeMap.set(edgeId, {
              id: edgeId,
              source: ev.source,
              target: ev.target,
              relationshipType: ev.relationshipType,
              label: ev.relationshipType,
              classification: ev.classification,
              confidence: ev.confidence,
              evidence: ev.description || ev.title,
              sourceUrl: ev.sourceUrl,
              timestamp: ev.timestamp
            });
          }
        }
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values())
    };
  }

  /**
   * Constructs a focused WHAT-IF impact subgraph from an ImpactResult and optional full graph.
   * Combines target node (Red), direct impact nodes (Orange), indirect impact nodes (Yellow),
   * affected APIs (Emerald), and affected tests (Indigo).
   * Collects valid interconnecting relationship edges.
   */
  static createFocusedImpactSubgraph(
    fullGraph: WhyGraphData | null,
    impactResult: any
  ): WhyGraphData {
    if (!impactResult || !impactResult.target) {
      return { nodes: [], edges: [] };
    }

    const nodeMap = new Map<string, GraphNode>();
    const relevantIdSet = new Set<string>();

    // 1. Target node
    const targetId = impactResult.target.id;
    relevantIdSet.add(targetId);
    nodeMap.set(targetId, {
      ...impactResult.target,
      highlighted: true
    });

    // 2. Direct impact nodes
    if (Array.isArray(impactResult.directImpact)) {
      for (const node of impactResult.directImpact) {
        if (node && node.id) {
          relevantIdSet.add(node.id);
          if (!nodeMap.has(node.id)) {
            nodeMap.set(node.id, { ...node });
          }
        }
      }
    }

    // 3. Indirect impact nodes
    if (Array.isArray(impactResult.indirectImpact)) {
      for (const node of impactResult.indirectImpact) {
        if (node && node.id) {
          relevantIdSet.add(node.id);
          if (!nodeMap.has(node.id)) {
            nodeMap.set(node.id, { ...node });
          }
        }
      }
    }

    // 4. Affected APIs and Tests
    if (Array.isArray(impactResult.affectedAPIs)) {
      for (const node of impactResult.affectedAPIs) {
        if (node && node.id) {
          relevantIdSet.add(node.id);
          if (!nodeMap.has(node.id)) {
            nodeMap.set(node.id, { ...node });
          }
        }
      }
    }

    if (Array.isArray(impactResult.affectedTests)) {
      for (const node of impactResult.affectedTests) {
        if (node && node.id) {
          relevantIdSet.add(node.id);
          if (!nodeMap.has(node.id)) {
            nodeMap.set(node.id, { ...node });
          }
        }
      }
    }

    // Enrich with fullGraph node metadata if present
    if (fullGraph && Array.isArray(fullGraph.nodes)) {
      for (const gNode of fullGraph.nodes) {
        if (relevantIdSet.has(gNode.id)) {
          const existing = nodeMap.get(gNode.id);
          nodeMap.set(gNode.id, {
            ...gNode,
            ...existing,
            metadata: {
              ...(gNode.metadata || {}),
              ...(existing?.metadata || {})
            }
          });
        }
      }
    }

    // 5. Collect interconnecting edges
    const edgeMap = new Map<string, GraphEdge>();

    // From full graph edges where both source & target are in relevant set
    if (fullGraph && Array.isArray(fullGraph.edges)) {
      for (const edge of fullGraph.edges) {
        if (relevantIdSet.has(edge.source) && relevantIdSet.has(edge.target)) {
          edgeMap.set(edge.id, { ...edge });
        }
      }
    }

    // From impactResult.relationships
    if (Array.isArray(impactResult.relationships)) {
      for (const edge of impactResult.relationships) {
        if (edge && edge.source && edge.target && relevantIdSet.has(edge.source) && relevantIdSet.has(edge.target)) {
          if (!edgeMap.has(edge.id)) {
            edgeMap.set(edge.id, { ...edge });
          }
        }
      }
    }

    // From impactResult.evidence items
    if (Array.isArray(impactResult.evidence)) {
      for (const ev of impactResult.evidence) {
        if (ev.sourceId && ev.targetId && relevantIdSet.has(ev.sourceId) && relevantIdSet.has(ev.targetId)) {
          const edgeId = ev.edgeId || ev.id || `ev-imp-${ev.sourceId}-${ev.targetId}`;
          if (!edgeMap.has(edgeId)) {
            edgeMap.set(edgeId, {
              id: edgeId,
              source: ev.sourceId,
              target: ev.targetId,
              relationshipType: ev.relationshipType,
              label: ev.relationshipType,
              classification: ev.classification,
              confidence: ev.confidence,
              evidence: ev.evidence,
              sourceUrl: ev.sourceUrl,
              timestamp: ev.timestamp
            });
          }
        }
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values())
    };
  }
}


