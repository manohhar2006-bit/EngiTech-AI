export type EvidenceClassification = 'FACT' | 'INFERENCE' | 'UNKNOWN';

export type RelationshipType =
  | 'MODIFIED_BY'
  | 'MODIFIED'
  | 'AUTHORED'
  | 'CONTAINS_FILE'
  | 'REFERENCES_ISSUE'
  | 'MERGED_PR'
  | 'DEPENDS_ON'
  | 'RESOLVED_BY'
  | 'RESOLVES';


export interface RepositoryMetadata {
  id: string;
  url: string;
  owner: string;
  repo: string;
  name: string;
  description: string;
  defaultBranch: string;
  language: string;
  stars: number;
  forks: number;
  openIssuesCount: number;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FileTreeItem {
  path: string;
  type: 'file' | 'dir';
  size?: number;
  extension?: string;
  sha?: string;
}

export interface CommitItem {
  hash: string;
  shortHash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  date: string;
  url: string;
  changedFilesCount: number;
  files?: {
    path: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }[];
}

export interface PullRequestItem {
  id: number;
  number: number;
  title: string;
  body: string;
  author: string;
  state: 'open' | 'closed' | 'merged';
  createdAt: string;
  mergedAt?: string;
  closedAt?: string;
  url: string;
  associatedCommitsCount?: number;
}

export interface IssueItem {
  id: number;
  number: number;
  title: string;
  body: string;
  author: string;
  state: 'open' | 'closed';
  labels: string[];
  createdAt: string;
  closedAt?: string;
  url: string;
}

export type DependencyCategory =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

export interface DependencyItem {
  name: string;
  version: string;
  sourceFile: string;
  ecosystem: 'npm' | 'pip' | 'cargo' | 'go' | 'maven' | 'other';
  category?: DependencyCategory;
  declaredVersion?: string;
  resolvedVersion?: string;
  lockfileSource?: string;
  isDirect?: boolean;
  isTransitive?: boolean;
  workspaceName?: string;
  manifestType?: string;
}

export interface NormalizedEvidence {
  id: string;
  repositoryId: string;
  source: string; // e.g. "issue:142" or "commit:8af42d"
  target: string; // e.g. "pr:87" or "file:src/PaymentService.ts"
  relationshipType: RelationshipType;
  classification: EvidenceClassification;
  confidence: number; // 0.0 to 1.0
  title: string;
  description: string;
  sourceUrl: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AnalysisSummary {
  repository: RepositoryMetadata;
  totalFiles: number;
  totalCommits: number;
  totalPullRequests: number;
  totalIssues: number;
  totalDependencies: number;
  totalEvidenceRecords: number;
  analyzedAt: string;
  factCount: number;
  inferenceCount: number;
  unknownCount: number;
  recentCommits?: CommitItem[];
  dependencyStats?: {
    directCount: number;
    transitiveCount: number;
    manifestCount: number;
    lockfileCount: number;
    ecosystems: string[];
  };
  astStats?: {
    supportedFilesCount: number;
    analyzedFilesCount: number;
    partiallyAnalyzedFilesCount: number;
    parseErrorFilesCount: number;
    skippedSizeLimitCount: number;
    unsupportedLanguageCount: number;
    totalSymbols: number;
    totalImports: number;
    resolvedImports: number;
    unresolvedImports: number;
    confirmedCalls: number;
    unresolvedCalls: number;
  };
}

export interface AnalysisProgressStep {
  step: 'CONNECTING' | 'METADATA' | 'FILE_TREE' | 'COMMITS' | 'ISSUES_PRS' | 'DEPENDENCIES' | 'NORMALIZING' | 'COMPLETE' | 'FAILED';
  message: string;
  percent: number;
  error?: string;
}
