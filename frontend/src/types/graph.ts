import { AnalysisSummary, CommitItem, IssueItem, PullRequestItem } from './evidence';
import { RepositoryDecisionDebtSummary } from './decisionDebt';

export type NodeType =
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
  hash?: string;
  author?: string;
  date?: string;
  timestamp?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  debtScore?: number;
  description?: string;
  path?: string;
  version?: string;
  number?: number;
  state?: string;
  ecosystem?: string;
  stars?: number;
  forks?: number;
  openIssuesCount?: number;
  degree?: number;
  url?: string;
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
  sourceReference?: string;
  createdAt?: string;
  updatedAt?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  radius?: number;
  color?: string;
  metadata?: GraphNodeMetadata;
  highlighted?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string; // source node id
  target: string; // target node id
  label?: string;
  relationshipType?: string;
  evidence?: string;
  confidence?: number;
  sourceUrl?: string;
  timestamp?: string;
  classification?: EvidenceClassification;
  type?: 'MODIFIED' | 'RESOLVED' | 'MOTIVATED_BY' | 'DEPENDS_ON' | 'AUTHORED' | 'CONTAINS' | string;
  animated?: boolean;
  highlighted?: boolean;
}

export interface GraphSummary {
  repositoryId: string;
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  factCount: number;
  inferenceCount: number;
  unknownCount: number;
  topConnectedNodes: { id: string; label: string; type: NodeType; connectionCount: number }[];
  builtAt: string;
}

export interface WhyGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary?: GraphSummary;
}

export interface TimelineEvent {
  id: string;
  year: number;
  date: string;
  title: string;
  category: 'DECISION' | 'INCIDENT' | 'REFACTOR' | 'DEPENDENCY' | 'ARCHITECTURE';
  summary: string;
  impact: string;
  evidence: {
    commits: string[];
    issues: string[];
    pullRequests: string[];
    author: string;
  };
  riskScore: number;
}

export interface DecisionRecord {
  id: string;
  title: string;
  date: string;
  status: 'ACTIVE' | 'OBSOLETE' | 'UNDER_REVIEW' | 'DEPRECATED';
  author: string;
  rationale: string;
  originalContext: string;
  currentRisk: string;
  debtScore: number;
  evidence: {
    commitHash: string;
    issueKey: string;
    prNumber: string;
    incidentId?: string;
  };
  affectedFiles: string[];
}

export interface RepositoryStats {
  id: string;
  name: string;
  organization: string;
  stars: number;
  forks: number;
  totalCommits: number;
  totalNodes: number;
  decisionDebtScore: number;
  lastAnalyzed: string;
  healthStatus: 'HEALTHY' | 'MODERATE_DEBT' | 'HIGH_RISK';
}

export interface RecentEngineeringEvent {
  id: string;
  type: 'COMMIT' | 'PULL_REQUEST' | 'ISSUE' | 'DECISION' | 'INCIDENT';
  title: string;
  description: string;
  author: string;
  timestamp: string;
  sourceUrl?: string;
  nodeId?: string;
}

export interface HighImpactComponentSummary {
  id: string;
  label: string;
  type: NodeType;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
  impactScore: number;
  directDependentsCount: number;
  indirectDependentsCount: number;
  affectedAPIsCount: number;
}

export interface DashboardData {
  repository: {
    id: string;
    name: string;
    branch: string;
    status: string;
    analyzedAt: string;
    url?: string;
  } | null;
  repositories: Array<{
    id: string;
    name: string;
    url: string;
    analyzedAt: string;
    totalCommits: number;
    totalEvidenceRecords: number;
  }>;
  graphSummary: GraphSummary | null;
  evidenceSummary: {
    totalRecords: number;
    evidenceCoverage: number;
    factCount: number;
    inferenceCount: number;
    unknownCount: number;
  };
  whySummary: {
    reconstructablePercentage: number;
    unknownRationaleCount: number;
    lowConfidenceCount: number;
  };
  decisionDebtSummary: {
    score: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INSUFFICIENT';
    highCount: number;
    mediumCount: number;
    lowCount: number;
    topDebtComponents: Array<{
      id: string;
      targetNodeId: string;
      targetNodeLabel: string;
      score: number;
      level: string;
      explanation: string;
      signalsCount: number;
      lastRationaleDate?: string;
    }>;
  };
  impactSummary: {
    highImpactCount: number;
    mostConnectedCount: number;
    topImpactComponents: HighImpactComponentSummary[];
  };
  recentEvents: RecentEngineeringEvent[];
  isDemo: boolean;
  graphData?: WhyGraphData | null;
  summary?: AnalysisSummary | null;
  commits?: CommitItem[];
  issues?: IssueItem[];
  pullRequests?: PullRequestItem[];
  debtSummary?: RepositoryDecisionDebtSummary | null;
}

