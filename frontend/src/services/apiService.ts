import {
  AnalysisSummary,
  RepositoryMetadata,
  CommitItem,
  FileTreeItem,
  IssueItem,
  PullRequestItem,
  NormalizedEvidence,
  DependencyItem
} from '../types/evidence';
import { API_BASE_URL } from '../config';

export class ApiService {
  /**
   * Post repository URL for real GitHub analysis
   */
  static async analyzeRepository(url: string): Promise<{
    summary: AnalysisSummary;
    repository: RepositoryMetadata;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || `HTTP error ${response.status}: Failed to analyze repository`);
      }

      return (await response.json()) as { summary: AnalysisSummary; repository: RepositoryMetadata };
    } catch (err: unknown) {
      console.warn('[ApiService] Backend API call failed, falling back to mock dataset:', err);
      throw err;
    }
  }

  /**
   * Fetch repository summary by ID
   */
  static async fetchRepository(id: string): Promise<{ summary: AnalysisSummary; repository: RepositoryMetadata } | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${id}`);
      if (!response.ok) return null;
      return (await response.json()) as { summary: AnalysisSummary; repository: RepositoryMetadata };
    } catch {
      return null;
    }
  }

  /**
   * Fetch normalized historical evidence records
   */
  static async fetchEvidence(id: string): Promise<NormalizedEvidence[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${id}/evidence`);
      if (!response.ok) return [];
      const data = (await response.json()) as { evidence: NormalizedEvidence[] };
      return data.evidence;
    } catch {
      return [];
    }
  }

  /**
   * Fetch repository commits
   */
  static async fetchCommits(id: string): Promise<CommitItem[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${id}/commits`);
      if (!response.ok) return [];
      const data = (await response.json()) as { commits: CommitItem[] };
      return data.commits;
    } catch {
      return [];
    }
  }

  /**
   * Fetch file structure
   */
  static async fetchFiles(id: string): Promise<FileTreeItem[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${id}/files`);
      if (!response.ok) return [];
      const data = (await response.json()) as { fileTree: FileTreeItem[] };
      return data.fileTree;
    } catch {
      return [];
    }
  }

  /**
   * Fetch issues & pull requests
   */
  static async fetchIssues(id: string): Promise<{ issues: IssueItem[]; pullRequests: PullRequestItem[] }> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${id}/issues`);
      if (!response.ok) return { issues: [], pullRequests: [] };
      return (await response.json()) as { issues: IssueItem[]; pullRequests: PullRequestItem[] };
    } catch {
      return { issues: [], pullRequests: [] };
    }
  }

  /**
   * Fetch list of all analyzed repositories
   */
  static async fetchRepositories(): Promise<AnalysisSummary[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories`);
      if (!response.ok) return [];
      const data = (await response.json()) as { repositories: AnalysisSummary[] };
      return data.repositories || [];
    } catch {
      return [];
    }
  }
}
