/**
 * EngiTrace Phase 5 - Frontend Decision Debt Service
 * Calls Backend API with fallback for Demo/Offline mode
 */

import {
  DecisionDebt,
  RepositoryDecisionDebtSummary,
  DecisionDebtAiExplanationResponse
} from '../types/decisionDebt';
import { API_BASE_URL } from '../config';

export class FrontendDecisionDebtService {
  /**
   * Fetch repository-level Decision Debt summary and component debts
   */
  static async fetchRepositoryDebt(repositoryId: string): Promise<RepositoryDecisionDebtSummary> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${repositoryId}/decision-debt`);
      if (response.ok) {
        return (await response.json()) as RepositoryDecisionDebtSummary;
      }
    } catch (err) {
      console.warn(`[FrontendDecisionDebtService] Backend API unavailable, generating fallback repo debt metrics.`, err);
    }

    return this.generateFallbackRepositorySummary(repositoryId);
  }

  /**
   * Fetch single component Decision Debt details
   */
  static async fetchComponentDebt(repositoryId: string, nodeId: string): Promise<DecisionDebt> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${repositoryId}/decision-debt/${encodeURIComponent(nodeId)}`);
      if (response.ok) {
        return (await response.json()) as DecisionDebt;
      }
    } catch (err) {
      console.warn(`[FrontendDecisionDebtService] Backend API unavailable for ${nodeId}, generating fallback component debt.`, err);
    }

    return this.generateFallbackComponentDebt(repositoryId, nodeId);
  }

  /**
   * Fetch AI explanation for component Decision Debt
   */
  static async fetchAiExplanation(repositoryId: string, nodeId: string): Promise<DecisionDebtAiExplanationResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${repositoryId}/decision-debt/${encodeURIComponent(nodeId)}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        return (await response.json()) as DecisionDebtAiExplanationResponse;
      }
    } catch (err) {
      console.warn(`[FrontendDecisionDebtService] AI explanation API unavailable, returning fallback AI explanation.`, err);
    }

    const debt = await this.fetchComponentDebt(repositoryId, nodeId);
    return this.generateFallbackAiExplanation(debt);
  }

  /**
   * Fallback Repository Summary Generator
   */
  private static generateFallbackRepositorySummary(repositoryId: string): RepositoryDecisionDebtSummary {
    const mockComponents: DecisionDebt[] = [
      {
        id: `debt-${repositoryId}-paymentservice`,
        repositoryId,
        targetNodeId: 'node-file-payment',
        targetNodeLabel: 'PaymentService.ts',
        targetNodeType: 'FILE',
        level: 'HIGH',
        score: 78,
        confidence: 0.91,
        signals: [
          {
            id: 'sig-1',
            type: 'MISSING_RATIONALE',
            severity: 'HIGH',
            title: 'Missing Architectural Rationale',
            description: 'Component has 19 recorded modifications but lacks explicit architectural rationale or linked design specs.',
            evidenceIds: ['ev-aut-8af42d91', 'ev-mod-8af42d91-src_services_PaymentService_ts'],
            confidence: 0.92
          },
          {
            id: 'sig-2',
            type: 'REPEATED_MODIFICATIONS',
            severity: 'HIGH',
            title: 'Repeated Modifications (19 Commits)',
            description: '19 historical commits modified connection pooling and checkout retry logic over 2 years.',
            evidenceIds: ['ev-mod-8af42d91-src_services_PaymentService_ts'],
            confidence: 0.90
          },
          {
            id: 'sig-3',
            type: 'STALE_REASONING',
            severity: 'MEDIUM',
            title: 'Stale Decision Rationale',
            description: 'Last supporting rationale evidence was recorded 2.8 years ago during legacy Redis migration.',
            evidenceIds: ['ev-ref-8af42d91-87'],
            confidence: 0.85
          }
        ],
        evidence: [
          {
            id: 'ev-aut-8af42d91',
            repositoryId,
            source: 'author:alex-dev',
            target: 'commit:8af42d91',
            relationshipType: 'AUTHORED',
            classification: 'FACT',
            confidence: 1.0,
            title: 'Author Alex Dev authored commit #8af42d91',
            description: 'Direct Git author signature recorded on 2024-11-15.',
            sourceUrl: 'https://github.com/codeorigin/engine/commit/8af42d91',
            timestamp: '2024-11-15T10:30:00Z'
          },
          {
            id: 'ev-mod-8af42d91-src_services_PaymentService_ts',
            repositoryId,
            source: 'commit:8af42d91',
            target: 'file:src/services/PaymentService.ts',
            relationshipType: 'MODIFIED_BY',
            classification: 'FACT',
            confidence: 1.0,
            title: 'Commit #8af42d91 modified src/services/PaymentService.ts',
            description: 'File churn: +145 -12 lines changed.',
            sourceUrl: 'https://github.com/codeorigin/engine/commit/8af42d91',
            timestamp: '2024-11-15T10:30:00Z'
          },
          {
            id: 'ev-ref-8af42d91-87',
            repositoryId,
            source: 'commit:8af42d91',
            target: 'issue:87',
            relationshipType: 'REFERENCES_ISSUE',
            classification: 'INFERENCE',
            confidence: 0.85,
            title: 'Commit #8af42d91 references Issue #87',
            description: 'Commit message mentions ticket #87 in description.',
            sourceUrl: 'https://github.com/codeorigin/engine/issues/87',
            timestamp: '2024-11-15T10:30:00Z'
          }
        ],
        evidenceChecklist: {
          commitEvidence: true,
          pullRequestEvidence: true,
          issueEvidence: true,
          explicitRationale: false,
          incidentEvidence: false,
          recentValidation: false
        },
        explanation: 'Decision Debt for PaymentService.ts is HIGH (78/100). Primary signals: Missing Architectural Rationale, 19 Historical Modifications, and Stale Rationale (2.8 yrs old).',
        reviewPriority: 'REVIEW_FIRST',
        lastRationaleDate: '2023-11-14',
        reasoningAgeYears: 2.8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `debt-${repositoryId}-redisadapter`,
        repositoryId,
        targetNodeId: 'node-dep-redis',
        targetNodeLabel: 'RedisAdapter.ts',
        targetNodeType: 'FILE',
        level: 'HIGH',
        score: 72,
        confidence: 0.88,
        signals: [
          {
            id: 'sig-redis-1',
            type: 'DEPENDENCY_EVOLUTION',
            severity: 'HIGH',
            title: 'Unvalidated Legacy Dependency',
            description: 'Redis caching client wrapper retained after database persistent layer shifted to distributed KV.',
            evidenceIds: ['ev-redis-01'],
            confidence: 0.88
          },
          {
            id: 'sig-redis-2',
            type: 'MISSING_RATIONALE',
            severity: 'MEDIUM',
            title: 'Implicit Architectural Coupling',
            description: 'No explicit ADR documentation recorded for persistent Redis session lock choice.',
            evidenceIds: ['ev-redis-02'],
            confidence: 0.82
          }
        ],
        evidence: [
          {
            id: 'ev-redis-01',
            repositoryId,
            source: 'commit:c4e32a',
            target: 'file:src/cache/RedisAdapter.ts',
            relationshipType: 'MODIFIED_BY',
            classification: 'FACT',
            confidence: 1.0,
            title: 'Commit #c4e32a modified RedisAdapter.ts',
            description: 'Redis connection pool timeout adjustments.',
            sourceUrl: 'https://github.com/codeorigin/engine/commit/c4e32a',
            timestamp: '2024-05-10T14:20:00Z'
          }
        ],
        evidenceChecklist: {
          commitEvidence: true,
          pullRequestEvidence: false,
          issueEvidence: false,
          explicitRationale: false,
          incidentEvidence: true,
          recentValidation: false
        },
        explanation: 'Decision Debt for RedisAdapter.ts is HIGH (72/100). Unvalidated legacy dependency coupling and missing explicit rationale.',
        reviewPriority: 'REVIEW_FIRST',
        lastRationaleDate: '2024-05-10',
        reasoningAgeYears: 2.3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `debt-${repositoryId}-authmiddleware`,
        repositoryId,
        targetNodeId: 'node-file-auth',
        targetNodeLabel: 'AuthMiddleware.ts',
        targetNodeType: 'FILE',
        level: 'MEDIUM',
        score: 54,
        confidence: 0.84,
        signals: [
          {
            id: 'sig-auth-1',
            type: 'HISTORICAL_FRAGMENTATION',
            severity: 'MEDIUM',
            title: 'Sparse Context Links',
            description: 'Modified across 8 commits with only 1 linked issue ticket.',
            evidenceIds: ['ev-auth-01'],
            confidence: 0.84
          }
        ],
        evidence: [],
        evidenceChecklist: {
          commitEvidence: true,
          pullRequestEvidence: true,
          issueEvidence: false,
          explicitRationale: false,
          incidentEvidence: false,
          recentValidation: true
        },
        explanation: 'Decision Debt for AuthMiddleware.ts is MEDIUM (54/100). Historical fragmentation across multiple commits with sparse context.',
        reviewPriority: 'REVIEW_CONVENIENT',
        lastRationaleDate: '2025-01-20',
        reasoningAgeYears: 1.6,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `debt-${repositoryId}-checkoutcontroller`,
        repositoryId,
        targetNodeId: 'node-file-checkout',
        targetNodeLabel: 'CheckoutController.ts',
        targetNodeType: 'FILE',
        level: 'LOW',
        score: 22,
        confidence: 0.95,
        signals: [],
        evidence: [],
        evidenceChecklist: {
          commitEvidence: true,
          pullRequestEvidence: true,
          issueEvidence: true,
          explicitRationale: true,
          incidentEvidence: false,
          recentValidation: true
        },
        explanation: 'Decision Debt for CheckoutController.ts is LOW (22/100). Explicit architectural rationale and clear issue link coverage.',
        reviewPriority: 'MONITOR',
        lastRationaleDate: '2026-06-15',
        reasoningAgeYears: 0.2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    return {
      repositoryId,
      repositoryName: 'codeorigin/engine',
      overallScore: 56,
      overallLevel: 'MEDIUM',
      evidenceCoverage: 0.88,
      historicalCoverage: 0.92,
      totalComponents: 14,
      breakdown: {
        HIGH: 4,
        MEDIUM: 5,
        LOW: 5,
        INSUFFICIENT: 0
      },
      topDebtComponents: mockComponents,
      unresolvedWhyCount: 4,
      weakContextComponentCount: 3,
      analyzedAt: new Date().toISOString()
    };
  }

  private static generateFallbackComponentDebt(repositoryId: string, nodeId: string): DecisionDebt {
    const summary = this.generateFallbackRepositorySummary(repositoryId);
    const existing = summary.topDebtComponents.find(
      (c) => c.targetNodeId === nodeId || c.targetNodeLabel.toLowerCase() === nodeId.toLowerCase()
    );

    if (existing) return existing;

    return {
      id: `debt-${repositoryId}-${nodeId.replace(/[/.:]/g, '_')}`,
      repositoryId,
      targetNodeId: nodeId,
      targetNodeLabel: nodeId,
      targetNodeType: 'FILE',
      level: 'MEDIUM',
      score: 52,
      confidence: 0.82,
      signals: [
        {
          id: 'sig-fallback-1',
          type: 'MISSING_RATIONALE',
          severity: 'MEDIUM',
          title: 'Missing Rationale Documentation',
          description: 'No explicit architectural decision record linked in repository memory.',
          evidenceIds: ['ev-fallback-01'],
          confidence: 0.82
        }
      ],
      evidence: [],
      evidenceChecklist: {
        commitEvidence: true,
        pullRequestEvidence: false,
        issueEvidence: false,
        explicitRationale: false,
        incidentEvidence: false,
        recentValidation: true
      },
      explanation: `Decision Debt for ${nodeId} is MEDIUM (52/100). Context records exist, but explicit design rationale is unlinked.`,
      reviewPriority: 'REVIEW_CONVENIENT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  private static generateFallbackAiExplanation(debt: DecisionDebt): DecisionDebtAiExplanationResponse {
    return {
      nodeId: debt.targetNodeId,
      nodeLabel: debt.targetNodeLabel,
      level: debt.level,
      score: debt.score,
      confidence: debt.confidence,
      summary: `EngiTrace Intelligence Engine evaluated ${debt.targetNodeLabel}. The component has accumulated Decision Debt level "${debt.level}" (Score: ${debt.score}/100, Confidence: ${Math.round(debt.confidence * 100)}%). Key factors: ${debt.signals.map((s) => s.title).join(', ') || 'historical change density'}.`,
      signalExplanations: debt.signals.map((s) => ({
        signalType: s.type,
        explanation: `${s.title}: ${s.description}`,
        evidenceIds: s.evidenceIds
      })),
      groundedClaims: debt.evidence.slice(0, 3).map((e) => ({
        claim: `${e.title} — ${e.description}`,
        classification: e.classification,
        evidenceIds: [e.id]
      })),
      recommendedActions: [
        `Review historical rationale in WHY Explorer to restore lost intent context.`,
        `Link explicit design ticket or ADR record to future modifications of ${debt.targetNodeLabel}.`,
        `Inspect connected Engineering Memory Graph nodes to verify architectural boundaries.`
      ],
      generatedAt: new Date().toISOString(),
      isAiFallback: true
    };
  }
}
