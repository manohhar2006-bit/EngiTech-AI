/**
 * EngiTrace Engineering Memory Graph - Validation Engine
 */

import { GraphNode, GraphEdge, GraphNodeType, EvidenceClassification } from '../models/graphModel';
import { RelationshipRegistry } from '../relationships/relationshipRegistry';

export interface ValidationResult {
  isValid: boolean;
  validNodes: GraphNode[];
  validEdges: GraphEdge[];
  rejectedNodeErrors: string[];
  rejectedEdgeErrors: string[];
}

const VALID_NODE_TYPES: Set<GraphNodeType> = new Set([
  'REPOSITORY',
  'FILE',
  'FUNCTION',
  'COMPONENT',
  'COMMIT',
  'PULL_REQUEST',
  'ISSUE',
  'DECISION',
  'INCIDENT',
  'DEPENDENCY',
  'OUTCOME',
  'AUTHOR'
]);

const VALID_CLASSIFICATIONS: Set<EvidenceClassification> = new Set(['FACT', 'INFERENCE', 'UNKNOWN']);

export class GraphValidator {
  /**
   * Validate nodes and edges, filtering out malformed entities
   */
  static validate(nodes: GraphNode[], edges: GraphEdge[]): ValidationResult {
    const validNodes: GraphNode[] = [];
    const validEdges: GraphEdge[] = [];
    const rejectedNodeErrors: string[] = [];
    const rejectedEdgeErrors: string[] = [];

    const nodeMap = new Map<string, GraphNode>();

    // 1. Validate Nodes
    nodes.forEach((node) => {
      if (!node.id || typeof node.id !== 'string') {
        rejectedNodeErrors.push(`Node missing valid string ID`);
        return;
      }

      if (nodeMap.has(node.id)) {
        rejectedNodeErrors.push(`Duplicate node ID: ${node.id}`);
        return;
      }

      if (!VALID_NODE_TYPES.has(node.type)) {
        rejectedNodeErrors.push(`Node ${node.id} has invalid type: ${node.type}`);
        return;
      }

      if (!node.label || typeof node.label !== 'string') {
        rejectedNodeErrors.push(`Node ${node.id} missing valid label`);
        return;
      }

      if (!node.sourceReference || typeof node.sourceReference !== 'string') {
        rejectedNodeErrors.push(`Node ${node.id} missing valid sourceReference`);
        return;
      }

      nodeMap.set(node.id, node);
      validNodes.push(node);
    });

    // 2. Validate Edges
    const edgeSet = new Set<string>();

    edges.forEach((edge) => {
      if (!edge.id || typeof edge.id !== 'string') {
        rejectedEdgeErrors.push(`Edge missing valid string ID`);
        return;
      }

      if (!nodeMap.has(edge.source)) {
        rejectedEdgeErrors.push(`Edge ${edge.id} references missing source node: ${edge.source}`);
        return;
      }

      if (!nodeMap.has(edge.target)) {
        rejectedEdgeErrors.push(`Edge ${edge.id} references missing target node: ${edge.target}`);
        return;
      }

      if (!RelationshipRegistry.isRegistered(edge.relationshipType)) {
        rejectedEdgeErrors.push(`Edge ${edge.id} has unregistered relationship type: ${edge.relationshipType}`);
        return;
      }

      if (!VALID_CLASSIFICATIONS.has(edge.classification)) {
        rejectedEdgeErrors.push(`Edge ${edge.id} has invalid classification: ${edge.classification}`);
        return;
      }

      if (typeof edge.confidence !== 'number' || edge.confidence < 0 || edge.confidence > 1.0) {
        rejectedEdgeErrors.push(`Edge ${edge.id} has invalid confidence score: ${edge.confidence}`);
        return;
      }

      if (edge.classification !== 'UNKNOWN' && (!edge.evidence || edge.evidence.trim().length === 0)) {
        rejectedEdgeErrors.push(`Edge ${edge.id} classified as ${edge.classification} must contain supporting evidence`);
        return;
      }

      // Check duplicate edges
      const edgeKey = `${edge.source}->${edge.relationshipType}->${edge.target}`;
      if (edgeSet.has(edgeKey)) {
        // Skip duplicate edge gracefully
        return;
      }

      edgeSet.add(edgeKey);
      validEdges.push(edge);
    });

    return {
      isValid: rejectedNodeErrors.length === 0 && rejectedEdgeErrors.length === 0,
      validNodes,
      validEdges,
      rejectedNodeErrors,
      rejectedEdgeErrors
    };
  }
}
