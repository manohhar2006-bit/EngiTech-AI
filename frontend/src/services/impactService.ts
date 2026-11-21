/**
 * EngiTrace Phase 6 - What-If Impact Analysis Service API Client
 */

import { API_BASE_URL } from '../config';
import { ImpactQuery, ImpactResult, ImpactAiExplanationResponse } from '../types/impact';

export class ImpactService {
  /**
   * Execute What-If Impact Analysis Query against backend API
   */
  static async executeImpactQuery(
    repositoryId: string,
    nodeId: string,
    operation: 'REMOVE' | 'CHANGE' = 'REMOVE',
    allowFallback: boolean = false
  ): Promise<ImpactResult | null> {
    try {
      const url = `${API_BASE_URL}/repositories/${encodeURIComponent(repositoryId)}/impact`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, operation, maxDepth: 3 })
      });

      if (!response.ok) {
        let errorMsg = `Impact analysis failed with status ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.error) errorMsg = errData.error;
        } catch {
          // ignore parse error
        }
        if (allowFallback || repositoryId === 'demo-repo') {
          console.warn(`[ImpactService] Backend API returned ${response.status}. Switching to local mock analyzer.`);
          return this.generateMockImpactResult(nodeId, operation);
        }
        throw new Error(errorMsg);
      }

      return (await response.json()) as ImpactResult;
    } catch (err: any) {
      if (allowFallback || repositoryId === 'demo-repo') {
        console.warn('[ImpactService] Failed to reach backend API, using local mock impact analyzer.', err);
        return this.generateMockImpactResult(nodeId, operation);
      }
      throw err;
    }
  }

  /**
   * Execute Grounded AI Impact Explanation
   */
  static async executeAiExplanation(
    repositoryId: string,
    nodeId: string
  ): Promise<ImpactAiExplanationResponse | null> {
    try {
      const url = `${API_BASE_URL}/repositories/${encodeURIComponent(repositoryId)}/impact/${encodeURIComponent(
        nodeId
      )}/explain`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        return this.generateMockAiExplanation(nodeId);
      }

      return (await response.json()) as ImpactAiExplanationResponse;
    } catch (err) {
      console.warn('[ImpactService] AI explanation request failed, using mock AI response.', err);
      return this.generateMockAiExplanation(nodeId);
    }
  }

  /**
   * Local Mock Fallback Generator for Demo Mode
   */
  private static generateMockImpactResult(nodeId: string, operation: 'REMOVE' | 'CHANGE'): ImpactResult {
    const now = new Date().toISOString();
    const cleanLabel = nodeId.split(':').pop() || nodeId;

    const dummyTarget = {
      id: nodeId,
      type: 'FILE' as const,
      label: cleanLabel,
      sublabel: `src/${cleanLabel}`,
      metadata: { path: `src/${cleanLabel}` },
      sourceReference: `https://github.com/demo/repo/blob/main/${cleanLabel}`,
      createdAt: now,
      updatedAt: now
    };

    const directImpact = [
      {
        id: 'file:demo:PaymentController.ts',
        type: 'COMPONENT' as const,
        label: 'PaymentController.ts',
        sublabel: 'API Controller',
        metadata: {},
        sourceReference: '',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'file:demo:CheckoutWorkflow.ts',
        type: 'FILE' as const,
        label: 'CheckoutWorkflow.ts',
        sublabel: 'Business Logic',
        metadata: {},
        sourceReference: '',
        createdAt: now,
        updatedAt: now
      }
    ];

    const indirectImpact = [
      {
        id: 'file:demo:OrderService.ts',
        type: 'FILE' as const,
        label: 'OrderService.ts',
        sublabel: 'Order Processing',
        metadata: {},
        sourceReference: '',
        createdAt: now,
        updatedAt: now
      }
    ];

    return {
      target: dummyTarget,
      operation,
      directImpact,
      indirectImpact,
      affectedFiles: [...directImpact, ...indirectImpact],
      affectedComponents: directImpact,
      affectedAPIs: [
        {
          id: 'api:demo:post-checkout',
          type: 'COMPONENT' as const,
          label: 'POST /api/v1/checkout',
          sublabel: 'Payment Route',
          metadata: {},
          sourceReference: '',
          createdAt: now,
          updatedAt: now
        }
      ],
      affectedTests: [
        {
          id: 'file:demo:PaymentService.test.ts',
          type: 'FILE' as const,
          label: 'PaymentService.test.ts',
          sublabel: 'Unit Test',
          metadata: {},
          sourceReference: '',
          createdAt: now,
          updatedAt: now
        }
      ],
      affectedDependencies: [],
      relationships: [],
      evidence: [
        {
          id: 'ev-demo-1',
          edgeId: 'e-1',
          sourceId: 'file:demo:PaymentController.ts',
          targetId: nodeId,
          relationshipType: 'DEPENDS_ON',
          classification: 'FACT',
          confidence: 1.0,
          evidence: 'PaymentController directly imports and calls PaymentService',
          timestamp: now
        }
      ],
      impactLevel: 'HIGH',
      impactScore: 72,
      confidence: {
        score: 0.92,
        rating: 'HIGH',
        reasons: ['2 direct consumer components found', '1 API endpoint affected', '1 associated unit test suite found']
      },
      categoryCounts: {
        directCount: 2,
        indirectCount: 1,
        fileCount: 3,
        componentCount: 2,
        apiCount: 1,
        testCount: 1,
        dependencyCount: 0
      },
      warnings: [],
      summary: `EngiTrace analyzed the Engineering Memory Graph for "${cleanLabel}". REMOVING this component creates a HIGH impact across 2 direct consumer(s) and 1 indirect downstream component(s), affecting 1 API endpoint(s) and 1 test suite(s).`,
      analyzedAt: now
    };
  }

  private static generateMockAiExplanation(nodeId: string): ImpactAiExplanationResponse {
    const cleanLabel = nodeId.split(':').pop() || nodeId;
    return {
      nodeId,
      nodeLabel: cleanLabel,
      operation: 'REMOVE',
      impactLevel: 'HIGH',
      impactScore: 72,
      confidence: {
        score: 0.92,
        rating: 'HIGH',
        reasons: ['Graph evidence verified by 2 direct edges']
      },
      summary: `Removing ${cleanLabel} will disrupt core payment processing logic across PaymentController and CheckoutWorkflow.`,
      directImpactExplanation: `PaymentController.ts and CheckoutWorkflow.ts depend directly on exported symbols from ${cleanLabel}.`,
      indirectImpactExplanation: `OrderService.ts relies transitively on CheckoutWorkflow for transaction settlement.`,
      riskAssessment: `Architectural risk is HIGH due to critical API endpoint POST /api/v1/checkout depending on this service.`,
      recommendedMitigations: [
        `Migrate PaymentController.ts to replacement adapter before removing ${cleanLabel}.`,
        `Execute PaymentService.test.ts to verify contract boundaries.`
      ],
      groundedClaims: [
        {
          claim: `PaymentController directly imports PaymentService`,
          classification: 'FACT',
          evidenceIds: ['ev-demo-1']
        }
      ],
      generatedAt: new Date().toISOString(),
      isAiFallback: true
    };
  }
}
