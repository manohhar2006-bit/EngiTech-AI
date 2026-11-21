/**
 * EngiTrace Engineering Memory Graph - Storage Abstraction Layer
 */

import {
  EngineeringMemoryGraph,
  GraphNode,
  GraphEdge,
  GraphSummary,
  GraphQueryEngine
} from '../../../graph-engine/src';

export class GraphRepository {
  private static graphStore = new Map<string, EngineeringMemoryGraph>();

  /**
   * Save or update graph in repository store
   */
  static saveGraph(repositoryId: string, graph: EngineeringMemoryGraph, altKeys: string[] = []): void {
    this.graphStore.set(repositoryId, graph);
    altKeys.forEach((key) => {
      this.graphStore.set(key, graph);
    });
    console.log(`[GraphRepository] Saved graph for ${repositoryId}: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`);
  }

  /**
   * Retrieve stored graph by repository ID with slug variation handling
   */
  static getGraph(repositoryId: string): EngineeringMemoryGraph | undefined {
    if (!repositoryId) return undefined;
    
    // Direct match
    if (this.graphStore.has(repositoryId)) {
      return this.graphStore.get(repositoryId);
    }

    const decoded = decodeURIComponent(repositoryId);
    if (this.graphStore.has(decoded)) {
      return this.graphStore.get(decoded);
    }

    const cleanId = decoded.replace(/^repo-/, '');
    const altKeys = [
      `repo-${cleanId}`,
      cleanId,
      cleanId.replace(/\//g, '-'),
      cleanId.replace(/-/g, '/'),
      repositoryId.toLowerCase(),
      decoded.toLowerCase(),
      cleanId.toLowerCase()
    ];

    for (const key of altKeys) {
      if (this.graphStore.has(key)) {
        return this.graphStore.get(key);
      }
    }

    // Fallback: search keys by suffix
    for (const [key, graph] of this.graphStore.entries()) {
      if (key.toLowerCase().endsWith(cleanId.toLowerCase()) || cleanId.toLowerCase().endsWith(key.toLowerCase())) {
        return graph;
      }
    }

    return undefined;
  }

  /**
   * Retrieve nodes for a repository graph with optional type filtering
   */
  static getNodes(repositoryId: string, typeFilter?: string): GraphNode[] {
    const graph = this.getGraph(repositoryId);
    if (!graph) return [];

    if (typeFilter && typeFilter.toUpperCase() !== 'ALL') {
      return graph.nodes.filter((n) => n.type === typeFilter.toUpperCase());
    }

    return graph.nodes;
  }

  /**
   * Retrieve edges for a repository graph
   */
  static getEdges(repositoryId: string): GraphEdge[] {
    const graph = this.getGraph(repositoryId);
    return graph ? graph.edges : [];
  }

  /**
   * Retrieve single node by ID
   */
  static getNode(repositoryId: string, nodeId: string): GraphNode | undefined {
    const graph = this.getGraph(repositoryId);
    return graph ? GraphQueryEngine.findNode(graph, nodeId) : undefined;
  }

  /**
   * Retrieve neighborhood around node
   */
  static getNeighborhood(repositoryId: string, nodeId: string, depth: number = 1) {
    const graph = this.getGraph(repositoryId);
    if (!graph) return { nodes: [], edges: [] };
    return GraphQueryEngine.getNeighborhood(graph, nodeId, depth);
  }

  /**
   * Find path between source and target
   */
  static findPath(repositoryId: string, sourceId: string, targetId: string) {
    const graph = this.getGraph(repositoryId);
    if (!graph) return { found: false, nodes: [], edges: [] };
    return GraphQueryEngine.findPath(graph, sourceId, targetId);
  }

  /**
   * Get graph summary metrics
   */
  static getSummary(repositoryId: string): GraphSummary | undefined {
    const graph = this.getGraph(repositoryId);
    return graph ? graph.summary : undefined;
  }
}
