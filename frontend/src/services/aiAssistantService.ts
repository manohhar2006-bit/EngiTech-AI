import { API_BASE_URL } from '../config';
import { ApiService } from './apiService';
import { GraphService } from './graphService';
import { WhyService } from './whyService';
import { MOCK_REPOSITORIES } from '../data/mockRepository';
import { GraphNode, WhyGraphData } from '../types/graph';
import {
  InvestigationMode,
  GroupedEvidence,
  AssistantChatMessage,
  EvidenceClaim
} from '../types/aiAssistant';

export interface ChatApiPayload {
  nodeId: string;
  analysisType: 'WHY' | 'WHAT_IF';
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  nodeMetadata?: Record<string, any>;
}

export interface ChatApiResponse {
  answer: string;
  claims: EvidenceClaim[];
  suggestedFollowUps: string[];
  provider: string;
  model: string;
  isFallback: boolean;
  error?: string;
}

export class AIAssistantService {
  /**
   * Load available repositories from backend, falling back to mock repositories
   */
  static async getAvailableRepositories(): Promise<Array<{ id: string; name: string }>> {
    try {
      const summaries = await ApiService.fetchRepositories();
      if (summaries && summaries.length > 0) {
        return summaries.map((s) => ({
          id: s.repository.id,
          name: s.repository.name || `${s.repository.owner}/${s.repository.repo}`
        }));
      }
    } catch (err) {
      console.warn('[AIAssistantService] Backend fetchRepositories failed, using mock list:', err);
    }

    return MOCK_REPOSITORIES.map((r) => ({ id: r.id, name: r.name }));
  }

  /**
   * Load graph topology for active repository
   */
  static async getRepositoryGraph(repositoryId: string): Promise<WhyGraphData | null> {
    return await GraphService.fetchGraph(repositoryId);
  }

  /**
   * Fetch and group related evidence for the current investigation
   */
  static async getRelatedEvidence(
    repositoryId: string,
    targetNode?: GraphNode | null
  ): Promise<GroupedEvidence> {
    const grouped: GroupedEvidence = {
      commits: [],
      pullRequests: [],
      issues: [],
      files: [],
      evidenceRecords: []
    };

    try {
      if (targetNode && targetNode.type !== 'REPOSITORY') {
        // Node-specific evidence retrieval
        const [whyResult, historyResult] = await Promise.all([
          WhyService.executeWhyQuery(repositoryId, targetNode.id).catch(() => null),
          WhyService.fetchNodeHistory(repositoryId, targetNode.id).catch(() => null)
        ]);

        if (whyResult) {
          // Add evidence records
          if (Array.isArray(whyResult.evidence)) {
            whyResult.evidence.forEach((ev: any) => {
              grouped.evidenceRecords.push({
                id: ev.id,
                title: ev.title || ev.relationshipType || 'Evidence Record',
                description: ev.description || ev.evidence || '',
                classification: ev.classification || 'FACT',
                sourceUrl: ev.sourceUrl,
                timestamp: ev.timestamp,
                relationshipType: ev.relationshipType
              });
            });
          }

          // Source links extraction
          if (Array.isArray(whyResult.sourceLinks)) {
            whyResult.sourceLinks.forEach((link: any) => {
              if (link.type === 'COMMIT') {
                grouped.commits.push({
                  id: link.label || link.url,
                  message: link.label || 'Commit reference',
                  url: link.url
                });
              } else if (link.type === 'PULL_REQUEST') {
                grouped.pullRequests.push({
                  id: link.label || link.url,
                  number: parseInt(link.label?.replace(/\D/g, '') || '0', 10),
                  title: link.label || 'Pull Request reference',
                  url: link.url
                });
              } else if (link.type === 'ISSUE') {
                grouped.issues.push({
                  id: link.label || link.url,
                  number: parseInt(link.label?.replace(/\D/g, '') || '0', 10),
                  title: link.label || 'Issue reference',
                  url: link.url
                });
              }
            });
          }
        }

        if (historyResult && Array.isArray(historyResult.events)) {
          historyResult.events.forEach((ev) => {
            const isCommit = ev.id?.startsWith('commit-') || ev.title?.toLowerCase().includes('commit');
            if (isCommit && !grouped.commits.some((c) => c.id === ev.id)) {
              grouped.commits.push({
                id: ev.id,
                message: ev.title,
                url: ev.sourceUrl,
                date: ev.timestamp
              });
            }
          });
        }

        // Add the target file
        const filePath = (targetNode.metadata?.path as string) || targetNode.id.replace(/^file:[^:]+:/, '');
        grouped.files.push({
          path: filePath || targetNode.label,
          size: typeof targetNode.metadata?.size === 'number' ? targetNode.metadata.size : undefined
        });
      } else {
        // Repository-wide evidence retrieval
        const [commits, issuesAndPRs, files, evidenceList] = await Promise.all([
          ApiService.fetchCommits(repositoryId).catch(() => []),
          ApiService.fetchIssues(repositoryId).catch(() => ({ issues: [], pullRequests: [] })),
          ApiService.fetchFiles(repositoryId).catch(() => []),
          ApiService.fetchEvidence(repositoryId).catch(() => [])
        ]);

        if (Array.isArray(commits)) {
          commits.slice(0, 15).forEach((c) => {
            grouped.commits.push({
              id: c.hash || c.shortHash || c.message,
              hash: c.hash,
              shortHash: c.shortHash,
              message: c.message,
              authorName: c.authorName,
              date: c.date,
              url: c.url
            });
          });
        }

        if (issuesAndPRs) {
          if (Array.isArray(issuesAndPRs.pullRequests)) {
            issuesAndPRs.pullRequests.slice(0, 10).forEach((pr) => {
              grouped.pullRequests.push({
                id: pr.id,
                number: pr.number,
                title: pr.title,
                author: pr.author,
                state: pr.state,
                url: pr.url
              });
            });
          }
          if (Array.isArray(issuesAndPRs.issues)) {
            issuesAndPRs.issues.slice(0, 10).forEach((iss) => {
              grouped.issues.push({
                id: iss.id,
                number: iss.number,
                title: iss.title,
                author: iss.author,
                state: iss.state,
                url: iss.url
              });
            });
          }
        }

        if (Array.isArray(files)) {
          files.slice(0, 20).forEach((f) => {
            grouped.files.push({
              path: f.path,
              size: f.size,
              extension: f.extension
            });
          });
        }

        if (Array.isArray(evidenceList)) {
          evidenceList.slice(0, 15).forEach((ev) => {
            grouped.evidenceRecords.push({
              id: ev.id,
              title: ev.title || `${ev.source} -> ${ev.target}`,
              description: ev.description,
              classification: ev.classification,
              sourceUrl: ev.sourceUrl,
              timestamp: ev.timestamp,
              relationshipType: ev.relationshipType
            });
          });
        }
      }
    } catch (err) {
      console.warn('[AIAssistantService] Error fetching related evidence:', err);
    }

    return grouped;
  }

  /**
   * Execute contextual chat with backend ChatController
   */
  static async sendChatMessage(
    repositoryId: string,
    payload: ChatApiPayload
  ): Promise<ChatApiResponse> {
    const url = `${API_BASE_URL}/repositories/${encodeURIComponent(repositoryId)}/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorDetails = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errJson = await response.json();
        errorDetails = errJson.details || errJson.error || errorDetails;
      } catch {
        // non-json response
      }
      throw new Error(errorDetails);
    }

    return (await response.json()) as ChatApiResponse;
  }

  /**
   * Return mode-appropriate suggested questions for the active context
   */
  static getDefaultSuggestedQuestions(
    mode: InvestigationMode,
    targetLabel?: string,
    repoName?: string
  ): string[] {
    const label = targetLabel && targetLabel !== 'Repository-wide investigation' ? targetLabel : 'this repository';

    if (mode === 'WHY') {
      return [
        `Why does ${label} exist?`,
        `Which commit introduced ${label}?`,
        `Which pull request modified ${label}?`,
        `Is there an undocumented architectural decision around ${label}?`,
        `What historical rationale is recorded for ${label}?`
      ];
    }

    if (mode === 'WHAT_IF') {
      return [
        `What happens if I remove ${label}?`,
        `Which components depend on ${label}?`,
        `What is the calculated impact score and risk level for changing ${label}?`,
        `What downstream APIs or tests could break if ${label} is modified?`,
        `What mitigation steps are required before modifying ${label}?`
      ];
    }

    // GENERAL Mode
    return [
      `Explain the high-level architecture of ${repoName || 'this repository'}.`,
      `What are the core components and key dependencies?`,
      `How does data and execution flow between services?`,
      `What are the most heavily modified files or hot spots?`,
      `Summarize recent changes and open issues in ${repoName || 'this codebase'}.`
    ];
  }

  /**
   * Format target label according to node type
   */
  static formatTargetLabel(node: GraphNode | null, fallbackRaw?: string | null): string {
    if (!node) {
      if (fallbackRaw) {
        return fallbackRaw;
      }
      return 'Repository-wide investigation';
    }

    const rawLabel = node.label || node.id;

    switch (node.type) {
      case 'FILE': {
        const filePath = (node.metadata?.path as string) || node.id.replace(/^file:[^:]+:/, '').replace(/^file:/, '');
        return filePath || rawLabel;
      }
      case 'DEPENDENCY': {
        const clean = rawLabel.replace(/^dependency:/i, '');
        return `dependency:${clean}`;
      }
      case 'COMMIT': {
        const hash = (node.metadata?.hash as string) || (node.metadata?.shortHash as string) || rawLabel.replace(/^commit\s*#?/i, '');
        const displayHash = hash.length > 7 ? hash.substring(0, 7) : hash;
        return `commit:${displayHash}`;
      }
      case 'PULL_REQUEST': {
        const num = node.metadata?.number || rawLabel.replace(/\D/g, '');
        return num ? `PR #${num}` : `PR:${rawLabel}`;
      }
      case 'ISSUE': {
        const num = node.metadata?.number || rawLabel.replace(/\D/g, '');
        return num ? `Issue #${num}` : `Issue:${rawLabel}`;
      }
      case 'COMPONENT': {
        const clean = rawLabel.replace(/^component:/i, '');
        return `component:${clean}`;
      }
      case 'FUNCTION': {
        const clean = rawLabel.replace(/^function:/i, '');
        return `function:${clean}`;
      }
      case 'DECISION': {
        return rawLabel;
      }
      case 'REPOSITORY': {
        return `${rawLabel} (Repository-wide)`;
      }
      default:
        return rawLabel;
    }
  }

  /**
   * Generate context-appropriate initial investigation question for a node
   */
  static getInitialQuestionForNode(
    node: GraphNode | null,
    mode: InvestigationMode,
    targetLabel: string,
    repoName?: string
  ): string {
    if (!node) {
      return mode === 'WHAT_IF'
        ? `What happens if core dependencies or entry points in ${repoName || 'this repository'} are changed?`
        : `Explain the architecture, structure, and historical context of ${repoName || 'this repository'}.`;
    }

    if (mode === 'WHAT_IF') {
      switch (node.type) {
        case 'DEPENDENCY':
          return `What happens if I remove ${targetLabel}? Which components and imports depend on it, and what is the calculated impact?`;
        case 'FILE':
        case 'COMPONENT':
        case 'FUNCTION':
          return `What happens if ${targetLabel} is removed? Please explain its impact on downstream components, APIs, and tests.`;
        default:
          return `What is the calculated impact and risk level if ${targetLabel} is altered or removed?`;
      }
    }

    // mode === 'WHY' or 'GENERAL'
    switch (node.type) {
      case 'COMMIT':
        return `Which changes were introduced in ${targetLabel}, who authored it, and what pull request or issue does it reference?`;
      case 'DEPENDENCY':
        return `Why is ${targetLabel} a dependency of this repository, which components import it, and what rationale exists for its inclusion?`;
      case 'PULL_REQUEST':
        return `What changes, architectural intent, and decisions are associated with ${targetLabel}?`;
      case 'ISSUE':
        return `What problem does ${targetLabel} describe, and which commits or pull requests resolve it?`;
      case 'COMPONENT':
      case 'FUNCTION':
        return `Why does ${targetLabel} exist and what is its role in the system architecture?`;
      case 'FILE':
      default:
        return `Why does ${targetLabel} exist? Please provide a grounded initial explanation of its purpose, history, and connections.`;
    }
  }
}

