/**
 * EngiTrace Phase 6 - AI Grounded Impact Explanation Service
 * Uses Google Gemini API (via ai-engine) to generate natural explanations of deterministic impact graph results.
 * AI IS SOLELY AN EXPLANATION LAYER AND CANNOT ALTER GRAPH TRAVERSAL RESULTS OR SCORES.
 */

import { ImpactResult, ImpactAiExplanationResponse } from '../types/impactTypes';
import { ProviderService } from '../../../ai-engine/services/providerService';

export class ImpactAiService {
  /**
   * Explain deterministic Impact Analysis results using AI grounding
   */
  static async explainImpact(impact: ImpactResult): Promise<ImpactAiExplanationResponse> {
    const {
      target,
      operation,
      impactLevel,
      impactScore,
      confidence,
      directImpact,
      indirectImpact,
      affectedAPIs,
      affectedTests,
      affectedDependencies,
      evidence
    } = impact;

    const directList = directImpact.map((n) => `- Direct Dependent: [${n.type}] ${n.label} (${n.id})`).join('\n');
    const indirectList = indirectImpact.slice(0, 8).map((n) => `- Indirect Dependent: [${n.type}] ${n.label} (${n.id})`).join('\n');
    const apiList = affectedAPIs.map((n) => `- API Endpoint: ${n.label}`).join('\n');
    const testList = affectedTests.map((n) => `- Test Suite: ${n.label}`).join('\n');
    const evidenceSummary = evidence.slice(0, 10).map((e) => `- Edge Evidence [${e.id}]: ${e.evidence} (${e.classification})`).join('\n');

    const prompt = `You are EngiTrace's Impact Explanation Engine.

Given the following DETERMINISTIC GRAPH IMPACT ASSESSMENT for component "${target.label}" (${target.type}):

CRITICAL RULES:
1. Never invent dependencies not listed below.
2. Never invent affected APIs or tests.
3. Never alter the deterministic score (${impactScore}/100) or Impact Level (${impactLevel}).
4. Never invent historical facts.
5. Use only supplied evidence records.
6. Distinguish FACT, INFERENCE, and UNKNOWN.
7. Preserve uncertainty and explain confidence score (${Math.round(confidence.score * 100)}%).
8. Reference evidence IDs for important claims.

DETERMINISTIC ANALYSIS RESULTS:
- Target Node: ${target.label} (${target.type}, ID: ${target.id})
- Operation: ${operation}
- Impact Level: ${impactLevel} (Score: ${impactScore}/100)
- Confidence: ${confidence.rating} (${Math.round(confidence.score * 100)}%)

DIRECT DEPENDENTS (${directImpact.length}):
${directList || 'None'}

INDIRECT DEPENDENTS (${indirectImpact.length}):
${indirectList || 'None'}

AFFECTED APIS (${affectedAPIs.length}):
${apiList || 'None'}

AFFECTED TESTS (${affectedTests.length}):
${testList || 'None'}

AFFECTED DEPENDENCIES (${affectedDependencies.length}):
${affectedDependencies.map((d) => `- Dependency: ${d.label}`).join('\n') || 'None'}

GRAPH EVIDENCE RECORDS:
${evidenceSummary || 'None'}

Generate a JSON object matching this schema:
{
  "summary": "Clear executive summary of impact if ${target.label} is ${operation === 'REMOVE' ? 'removed' : 'changed'}.",
  "directImpactExplanation": "Detailed explanation of direct consumer components.",
  "indirectImpactExplanation": "Explanation of cascading downstream consequences.",
  "riskAssessment": "Architectural risk assessment grounded in graph evidence.",
  "recommendedMitigations": [
    "Actionable step 1 to mitigate removal risk...",
    "Actionable step 2..."
  ],
  "groundedClaims": [
    {
      "claim": "Statement directly supported by evidence...",
      "classification": "FACT",
      "evidenceIds": ["ev-imp-..."]
    }
  ]
}`;

    try {
      const aiRaw = await ProviderService.queryGemini(prompt, `Explain impact of removing ${target.label}`);
      let parsed: any = null;

      if (aiRaw && typeof aiRaw === 'object') {
        parsed = aiRaw;
      } else if (typeof aiRaw === 'string') {
        try {
          const jsonMatch = aiRaw.match(/```json\s*([\s\S]*?)\s*```/i) || aiRaw.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[1]);
          } else {
            parsed = JSON.parse(aiRaw);
          }
        } catch {
          // ignore string parse failure
        }
      }

      if (parsed) {
        return {
          nodeId: target.id,
          nodeLabel: target.label,
          operation,
          impactLevel,
          impactScore,
          confidence,
          summary: parsed.summary || impact.summary,
          directImpactExplanation: parsed.directImpactExplanation || `${directImpact.length} direct components depend directly on ${target.label}.`,
          indirectImpactExplanation: parsed.indirectImpactExplanation || `${indirectImpact.length} downstream components rely transitively on ${target.label}.`,
          riskAssessment: parsed.riskAssessment || `Impact rating is ${impactLevel} based on observable graph dependency density.`,
          recommendedMitigations: Array.isArray(parsed.recommendedMitigations) && parsed.recommendedMitigations.length > 0
            ? parsed.recommendedMitigations
            : [
                `Decouple direct consumers (${directImpact.slice(0, 3).map((n) => n.label).join(', ')}) before removal.`,
                'Run complete integration test suite prior to deprecation.'
              ],
          groundedClaims: Array.isArray(parsed.groundedClaims) ? parsed.groundedClaims : [],
          generatedAt: new Date().toISOString(),
          isAiFallback: false
        };
      }
    } catch (err) {
      console.warn(`[ImpactAiService] Gemini API call unavailable or failed, using grounded fallback explanation.`, err);
    }

    return this.generateGroundedFallback(impact);
  }

  /**
   * Grounded Fallback Explanation Generator
   */
  private static generateGroundedFallback(impact: ImpactResult): ImpactAiExplanationResponse {
    const { target, operation, impactLevel, impactScore, confidence, directImpact, indirectImpact, affectedAPIs, affectedTests, evidence } = impact;

    const groundedClaims = evidence.slice(0, 5).map((e) => ({
      claim: `${e.evidence}`,
      classification: e.classification,
      evidenceIds: [e.id]
    }));

    const mitigations: string[] = [];
    if (directImpact.length > 0) {
      mitigations.push(`Review and refactor ${directImpact.length} direct dependents (${directImpact.slice(0, 3).map((d) => d.label).join(', ')}) before removal.`);
    }
    if (affectedAPIs.length > 0) {
      mitigations.push(`Verify API contract compatibility for ${affectedAPIs.map((a) => a.label).join(', ')}.`);
    }
    if (affectedTests.length > 0) {
      mitigations.push(`Execute associated test suites (${affectedTests.map((t) => t.label).join(', ')}) after removing node.`);
    }
    if (mitigations.length === 0) {
      mitigations.push(`No downstream in-repository graph dependencies detected for ${target.label} (impact score: ${impactScore} ${impactLevel}). Note that external build, CI, or tooling dependencies outside the modeled repository graph are not evaluated by graph traversal.`);
    }

    return {
      nodeId: target.id,
      nodeLabel: target.label,
      operation,
      impactLevel,
      impactScore,
      confidence,
      summary: impact.summary,
      directImpactExplanation: directImpact.length > 0
        ? `Removing ${target.label} directly impacts ${directImpact.length} component(s): ${directImpact.map((d) => d.label).join(', ')}.`
        : `No direct component dependencies detected for ${target.label}.`,
      indirectImpactExplanation: indirectImpact.length > 0
        ? `Indirectly affects ${indirectImpact.length} downstream component(s) through consumer dependency chains.`
        : `No downstream indirect dependencies detected.`,
      riskAssessment: `Impact Level is classified as ${impactLevel} (Score: ${impactScore}/100). Confidence in this assessment is ${confidence.rating} (${Math.round(confidence.score * 100)}%).`,
      recommendedMitigations: mitigations,
      groundedClaims,
      generatedAt: new Date().toISOString(),
      isAiFallback: true
    };
  }
}
