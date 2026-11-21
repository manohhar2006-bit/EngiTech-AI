/**
 * EngiTrace Engineering Memory Graph Engine
 */

export * from './models/graphModel';
export * from './relationships/relationshipRegistry';
export * from './validation/graphValidator';
export * from './builders/graphBuilder';

import { EngineeringMemoryGraph, GraphNode, GraphEdge } from './models/graphModel';

/**
 * Query helper functions for Engineering Memory Graph
 */
export class GraphQueryEngine {
  /**
   * Find node by ID
   */
  static findNode(graph: EngineeringMemoryGraph, nodeId: string): GraphNode | undefined {
    return graph.nodes.find((n) => n.id === nodeId);
  }

  /**
   * Get 1-step or multi-step neighborhood around a given node
   */
  static getNeighborhood(
    graph: EngineeringMemoryGraph,
    nodeId: string,
    depth: number = 1
  ): { targetNode?: GraphNode; nodes: GraphNode[]; edges: GraphEdge[] } {
    const targetNode = this.findNode(graph, nodeId);
    if (!targetNode) {
      return { nodes: [], edges: [] };
    }

    const visitedNodes = new Set<string>([nodeId]);
    const includedEdges = new Set<string>();
    let currentFrontier = new Set<string>([nodeId]);

    for (let d = 0; d < depth; d++) {
      const nextFrontier = new Set<string>();

      graph.edges.forEach((edge) => {
        if (currentFrontier.has(edge.source)) {
          visitedNodes.add(edge.target);
          nextFrontier.add(edge.target);
          includedEdges.add(edge.id);
        }
        if (currentFrontier.has(edge.target)) {
          visitedNodes.add(edge.source);
          nextFrontier.add(edge.source);
          includedEdges.add(edge.id);
        }
      });

      currentFrontier = nextFrontier;
    }

    const nodes = graph.nodes.filter((n) => visitedNodes.has(n.id));
    const edges = graph.edges.filter((e) => includedEdges.has(e.id));

    return { targetNode, nodes, edges };
  }

  /**
   * Find shortest path between source node and target node using BFS.
   * By default searches undirected paths for backward compatibility;
   * pass options: { directed: true } for strict directed graph traversal.
   */
  static findPath(
    graph: EngineeringMemoryGraph,
    sourceId: string,
    targetId: string,
    options?: { directed?: boolean }
  ): { found: boolean; nodes: GraphNode[]; edges: GraphEdge[] } {
    if (sourceId === targetId) {
      const node = this.findNode(graph, sourceId);
      return { found: true, nodes: node ? [node] : [], edges: [] };
    }

    const directed = Boolean(options?.directed);
    const adjacency = new Map<string, { neighbor: string; edge: GraphEdge }[]>();
    graph.edges.forEach((edge) => {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
      adjacency.get(edge.source)!.push({ neighbor: edge.target, edge });

      if (!directed) {
        if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
        adjacency.get(edge.target)!.push({ neighbor: edge.source, edge });
      }
    });

    const queue: string[] = [sourceId];
    const visited = new Set<string>([sourceId]);
    const parentMap = new Map<string, { parent: string; edge: GraphEdge }>();

    let found = false;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === targetId) {
        found = true;
        break;
      }

      const neighbors = adjacency.get(curr) || [];
      for (const { neighbor, edge } of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          parentMap.set(neighbor, { parent: curr, edge });
          queue.push(neighbor);
        }
      }
    }

    if (!found) {
      return { found: false, nodes: [], edges: [] };
    }

    // Reconstruct path
    const pathNodes: GraphNode[] = [];
    const pathEdges: GraphEdge[] = [];
    let curr: string | undefined = targetId;

    while (curr && curr !== sourceId) {
      const n = this.findNode(graph, curr);
      if (n) pathNodes.unshift(n);

      const pInfo = parentMap.get(curr);
      if (pInfo) {
        pathEdges.unshift(pInfo.edge);
        curr = pInfo.parent;
      } else {
        break;
      }
    }

    const startNode = this.findNode(graph, sourceId);
    if (startNode) pathNodes.unshift(startNode);

    return { found: true, nodes: pathNodes, edges: pathEdges };
  }

  /**
   * Get historical reasoning chain for a given node (Component/File -> Commit -> PR -> Issue)
   * Prioritizes canonical chronological relationship types:
   * File -> Commit (MODIFIED/CHANGED) -> PR (IMPLEMENTED/MERGED) -> Issue (RESOLVES/REFERENCES).
   */
  static getHistoricalChain(
    graph: EngineeringMemoryGraph,
    nodeId: string
  ): { targetNode?: GraphNode; chain: { node: GraphNode; edge?: GraphEdge }[] } {
    const targetNode = this.findNode(graph, nodeId);
    if (!targetNode) return { chain: [] };

    const { nodes, edges } = this.getNeighborhood(graph, nodeId, 3);
    const chain: { node: GraphNode; edge?: GraphEdge }[] = [{ node: targetNode }];

    const visited = new Set<string>([nodeId]);

    const targetTypePriorities: Record<string, { nodeTypes: string[]; relTypes: string[] }> = {
      FILE: {
        nodeTypes: ['COMMIT', 'PULL_REQUEST', 'ISSUE'],
        relTypes: ['MODIFIED', 'CHANGED', 'IMPLEMENTED', 'RESOLVES']
      },
      FUNCTION: {
        nodeTypes: ['FILE', 'COMMIT', 'PULL_REQUEST'],
        relTypes: ['DECLARES', 'EXPOSES', 'CONTAINS', 'MODIFIED']
      },
      COMPONENT: {
        nodeTypes: ['FILE', 'COMMIT', 'PULL_REQUEST'],
        relTypes: ['DECLARES', 'EXPOSES', 'CONTAINS', 'MODIFIED']
      },
      COMMIT: {
        nodeTypes: ['PULL_REQUEST', 'ISSUE', 'FILE', 'AUTHOR'],
        relTypes: ['IMPLEMENTED', 'RESOLVES', 'REFERENCES', 'CHANGED', 'AUTHORED_BY']
      },
      PULL_REQUEST: {
        nodeTypes: ['ISSUE', 'COMMIT', 'FILE', 'AUTHOR'],
        relTypes: ['RESOLVES', 'REFERENCES', 'IMPLEMENTED', 'CHANGED', 'AUTHORED_BY']
      },
      ISSUE: {
        nodeTypes: ['PULL_REQUEST', 'COMMIT'],
        relTypes: ['RESOLVES', 'REFERENCES']
      }
    };

    let currentId = nodeId;
    let currentNode: GraphNode | undefined = targetNode;

    for (let step = 0; step < 3; step++) {
      const candidateEdges = edges.filter(
        (e) => (e.source === currentId && !visited.has(e.target)) || (e.target === currentId && !visited.has(e.source))
      );

      if (candidateEdges.length === 0) break;

      const priorityConfig = currentNode ? targetTypePriorities[currentNode.type] : undefined;

      let bestEdge: GraphEdge | undefined;
      let nextNode: GraphNode | undefined;

      if (priorityConfig) {
        for (const prefType of priorityConfig.nodeTypes) {
          for (const edge of candidateEdges) {
            const neighborId = edge.source === currentId ? edge.target : edge.source;
            const candNode = nodes.find((n) => n.id === neighborId);
            if (candNode && candNode.type === prefType) {
              const rel = (edge.relationshipType || '').toUpperCase();
              if (priorityConfig.relTypes.includes(rel) || !bestEdge) {
                bestEdge = edge;
                nextNode = candNode;
                if (priorityConfig.relTypes.includes(rel)) break;
              }
            }
          }
          if (nextNode && bestEdge) break;
        }
      }

      // Fallback if no priority match found
      if (!nextNode || !bestEdge) {
        bestEdge = candidateEdges[0];
        const nextId = bestEdge.source === currentId ? bestEdge.target : bestEdge.source;
        nextNode = nodes.find((n) => n.id === nextId);
      }

      if (nextNode && bestEdge) {
        chain.push({ node: nextNode, edge: bestEdge });
        visited.add(nextNode.id);
        currentId = nextNode.id;
        currentNode = nextNode;
      } else {
        break;
      }
    }

    return { targetNode, chain };
  }
}
