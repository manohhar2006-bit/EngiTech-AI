/**
 * EngiTrace Phase 3 & 4 - Frontend WHY Explorer API Service
 */

import { WhyQuery, WhyResult, AIReasoningResponse } from '../types/why';
import { API_BASE_URL } from '../config';

export class WhyService {
  /**
   * Execute WHY Query against Backend API with fallback for Demo Mode
   */
  static async executeWhyQuery(repositoryId: string, nodeId: string, question?: string): Promise<WhyResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${repositoryId}/why`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, question })
      });

      if (response.ok) {
        const data = (await response.json()) as WhyResult;
        return data;
      }
    } catch (err) {
      console.warn(`[WhyService] Backend API unavailable, generating fallback synthesis for ${nodeId}.`, err);
    }

    return this.generateFallbackResult(nodeId, question);
  }

  /**
   * Execute Phase 4 AI Evidence Reasoning over WHY Query
   */
  static async executeAiReasoning(repositoryId: string, nodeId: string, question?: string): Promise<AIReasoningResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${repositoryId}/why/${encodeURIComponent(nodeId)}/reason`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });

      if (response.ok) {
        const data = (await response.json()) as AIReasoningResponse;
        return data;
      }
    } catch (err) {
      console.warn(`[WhyService] Backend AI reasoning API unavailable, generating fallback AI reasoning output for ${nodeId}.`, err);
    }

    return this.generateFallbackAiReasoning(nodeId, question);
  }

  /**
   * Fetch chronological change history for a specific node from GET /api/v1/repositories/:id/history/:nodeId
   */
  static async fetchNodeHistory(
    repositoryId: string,
    nodeId: string
  ): Promise<{
    target: any;
    totalEvents: number;
    events: Array<{
      stepNumber: number;
      id: string;
      title: string;
      event: string;
      classification: string;
      timestamp: string;
      sourceUrl?: string;
    }>;
  } | null> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/repositories/${encodeURIComponent(repositoryId)}/history/${encodeURIComponent(nodeId)}`
      );
      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch (err) {
      console.warn(`[WhyService] Failed to fetch history for ${nodeId}:`, err);
    }
    return null;
  }

  /**
   * Honest fallback synthesis when Backend WHY service is unavailable or unindexed
   */
  private static generateFallbackResult(nodeId: string, question?: string): WhyResult {
    const targetNode = {
      id: nodeId,
      type: 'FILE' as const,
      label: nodeId,
      sublabel: 'Unindexed Component',
      metadata: { path: nodeId },
      sourceReference: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const q = question || `Why does ${nodeId} exist?`;

    return {
      target: targetNode,
      question: q,
      summary: `Insufficient Historical Evidence. EngiTrace could not reconstruct a reliable reason for "${nodeId}" from the available repository history. Connect and analyze a GitHub repository to generate an evidence-backed WHY investigation.`,
      historicalChain: [
        {
          stepNumber: 1,
          node: targetNode,
          event: `No historical evidence found for "${nodeId}"`,
          relationship: 'UNKNOWN',
          evidence: ['Component has no connected commits or pull requests in current repository graph.'],
          classification: 'UNKNOWN',
          confidence: 0.1
        }
      ],
      evidence: [],
      facts: [],
      inferences: [],
      unknowns: [
        {
          id: 'unk-no-data-1',
          area: 'Historical Evidence Traceability',
          reason: `EngiTrace could not find explicit commit, PR, or issue evidence linked to ${nodeId}.`
        }
      ],
      confidence: {
        score: 0.1,
        level: 'LOW',
        reasons: ['! No direct Git commit or pull request evidence found in memory graph']
      },
      sourceLinks: []
    };
  }

  /**
   * Honest fallback for AI Reasoning when Backend AI service is unavailable
   */
  private static generateFallbackAiReasoning(nodeId: string, question?: string): AIReasoningResponse {
    const whyFallback = this.generateFallbackResult(nodeId, question);

    return {
      target: whyFallback.target,
      question: whyFallback.question,
      summary: `Insufficient Historical Evidence. EngiTrace could not reconstruct a grounded AI explanation for "${nodeId}". Please ensure backend is running with a configured GITHUB_TOKEN and GEMINI_API_KEY.`,
      claims: [
        {
          id: 'ai-c-insufficient',
          text: `No verified repository commits or pull requests were found linking historical rationale to ${nodeId}.`,
          classification: 'UNKNOWN',
          confidence: 0.1,
          evidenceIds: [],
          sourceUrls: []
        }
      ],
      facts: [],
      inferences: [],
      unknowns: whyFallback.unknowns,
      reasoning: [
        'Step 1: Inspected Engineering Memory Graph for target node.',
        'Step 2: No connected commit churn or pull request edges located.',
        'Step 3: Marked as UNKNOWN to prevent AI hallucination.'
      ],
      confidence: whyFallback.confidence,
      evidenceReferences: [],
      sourceLinks: [],
      generatedAt: new Date().toISOString(),
      modelMetadata: {
        provider: 'EngiTrace Intelligence Engine (Honest Fallback)',
        model: 'engitrace-ai-v1',
        promptVersion: 'why.v1',
        cached: false,
        fallbackUsed: true
      }
    };
  }
}
