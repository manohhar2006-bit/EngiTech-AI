/**
 * EngiTrace Engineering Memory Graph - Domain Model
 */

export type GraphNodeType =
  | 'REPOSITORY'
  | 'FILE'
  | 'FUNCTION'
  | 'COMPONENT'
  | 'COMMIT'
  | 'PULL_REQUEST'
  | 'ISSUE'
  | 'DECISION'
  | 'INCIDENT'
  | 'DEPENDENCY'
  | 'OUTCOME'
  | 'AUTHOR';

export type EvidenceClassification = 'FACT' | 'INFERENCE' | 'UNKNOWN';

export interface GraphNodeMetadata {
  description?: string;
  author?: string;
  timestamp?: string;
  date?: string;
  hash?: string;
  path?: string;
  url?: string;
  number?: number;
  state?: string;
  ecosystem?: string;
  version?: string;
  stars?: number;
  forks?: number;
  openIssuesCount?: number;
  language?: string;
  additions?: number;
  deletions?: number;
  degree?: number;
  inDegree?: number;
  outDegree?: number;
  sha?: string;
  analysisStatus?: string;
  declaredVersion?: string;
  resolvedVersion?: string;
  lockfileSource?: string;
  category?: string;
  workspaceName?: string;
  isDirect?: boolean;
  transitiveDependenciesCount?: number;
  manifestCount?: number;
  lockfileCount?: number;
  symbolKind?: string;
  isExported?: boolean;
  lineRange?: { startLine: number; endLine: number };
  parameters?: Array<{ name: string; typeAnnotation?: string }>;
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  sublabel?: string;
  metadata: GraphNodeMetadata;
  sourceReference: string;
  createdAt: string;
  updatedAt: string;
  highlighted?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string; // source node id
  target: string; // target node id
  relationshipType: string;
  evidence: string;
  confidence: number; // 0.0 to 1.0
  sourceUrl: string;
  timestamp: string;
  classification: EvidenceClassification;
  highlighted?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GraphSummary {
  repositoryId: string;
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<GraphNodeType, number>;
  edgesByType: Record<string, number>;
  factCount: number;
  inferenceCount: number;
  unknownCount: number;
  topConnectedNodes: { id: string; label: string; type: GraphNodeType; connectionCount: number }[];
  builtAt: string;
}

export interface EngineeringMemoryGraph {
  repositoryId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: GraphSummary;
}
