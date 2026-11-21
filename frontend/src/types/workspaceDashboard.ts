export type RepositoryAnalysisStatus = 'READY' | 'ANALYZING' | 'NOT_ANALYZED' | 'FAILED' | 'NEEDS_ATTENTION';

export interface WorkspaceRepositoryItem {
  id: string;
  name: string;
  owner: string;
  repo: string;
  url: string;
  defaultBranch: string;
  language?: string;
  commitsCount: number;
  filesCount: number;
  dependenciesCount: number;
  evidenceCount: number;
  analyzedAt?: string;
  status: RepositoryAnalysisStatus;
  debtScore?: number;
  debtLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INSUFFICIENT';
  criticalFindingsCount?: number;
}

export type WorkspaceActivityType = 'COMMIT' | 'PULL_REQUEST' | 'ISSUE' | 'DEPENDENCY';

export interface WorkspaceActivityItem {
  id: string;
  repositoryId: string;
  repositoryName: string;
  type: WorkspaceActivityType;
  title: string;
  description?: string;
  author: string;
  timestamp: string;
  sourceUrl?: string;
  status?: string;
  nodeId?: string;
}

export interface WorkspaceMetrics {
  totalRepositories: number;
  analyzedRepositories: number;
  pendingRepositories: number;
  failedRepositories: number;
  totalCommitsAnalyzed: number;
  uniqueCommitsCount: number;
  totalDependenciesCount: number;
  uniquePackagesCount: number;
  totalDecisionDebtFindings: number;
  affectedComponentsCount: number;
  affectedRepositoriesCount: number;
  severityBreakdown: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
    CRITICAL: number;
  };
  totalEvidenceRecords: number;
  factCount: number;
  inferenceCount: number;
  unknownCount: number;
  evidenceCoverage: number;
}

export interface WorkspaceDecisionDebtInsight {
  totalFindings: number;
  affectedReposCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  topDebtComponent?: {
    repoName: string;
    componentLabel: string;
    score: number;
    level: string;
    explanation: string;
    signalsCount: number;
  };
  summaryText: string;
}

export interface WorkspaceDependencyInsight {
  uniquePackagesCount: number;
  totalDeclarations: number;
  topEcosystems: Array<{ name: string; count: number }>;
  topPackages: Array<{ name: string; count: number }>;
  summaryText: string;
}

export interface WorkspaceHistoricalInsight {
  totalEvidence: number;
  factCount: number;
  inferenceCount: number;
  unknownCount: number;
  coveragePercentage: number;
  summaryText: string;
}

export interface WorkspaceDashboardData {
  metrics: WorkspaceMetrics;
  repositories: WorkspaceRepositoryItem[];
  recentActivities: WorkspaceActivityItem[];
  decisionDebtInsight: WorkspaceDecisionDebtInsight;
  dependencyInsight: WorkspaceDependencyInsight;
  historicalInsight: WorkspaceHistoricalInsight;
  isDemo?: boolean;
}

