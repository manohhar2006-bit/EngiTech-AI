/**
 * EngiTrace Phase 5 - AI Decision Debt Explanation Service
 * Uses Google Gemini API (via ai-engine) to explain existing deterministic Decision Debt signals.
 * AI DOES NOT GENERATE OR ALTER THE SCORE.
 */

import { DecisionDebt, DecisionDebtAiExplanationResponse } from '../types/decisionDebt';
import { ProviderService } from '../../../ai-engine/services/providerService';

export class DecisionDebtAiService {
  /**
   * Explain deterministic Decision Debt signals using AI grounding
   */
  static async explainDecisionDebt(debt: DecisionDebt): Promise<DecisionDebtAiExplanationResponse> {
    const { targetNodeLabel, targetNodeType, level, score, confidence, signals, evidence, evidenceChecklist } = debt;

    const signalSummary = signals.map((s) => `- Signal: ${s.title} (${s.severity}) -> ${s.description}`).join('\n');
    const evidenceSummary = evidence.slice(0, 8).map((e) => `- Evidence [${e.id}]: ${e.title} (${e.classification})`).join('\n');

    const prompt = `You are EngiTrace AI Engineering Intelligence Engine.
Analyze the following DETERMINISTIC DECISION DEBT assessment for component "${targetNodeLabel}" (${targetNodeType}).

IMPORTANT RULES:
1. Do NOT invent a new score or change the Decision Debt score. The score is strictly ${score}/100 with Level "${level}".
2. Base your explanation exclusively on the provided engineering signals and evidence records.
3. Highlight why the historical rationale has become lost, stale, or incomplete.

COMPONENT DATA:
- Component: ${targetNodeLabel} (${targetNodeType})
- Decision Debt Level: ${level} (Score: ${score}/100, Confidence: ${Math.round(confidence * 100)}%)
- Signals Detected:
${signalSummary || 'None'}

- Evidence Checklist:
  * Commit Evidence: ${evidenceChecklist.commitEvidence ? 'YES' : 'NO'}
  * Pull Request Evidence: ${evidenceChecklist.pullRequestEvidence ? 'YES' : 'NO'}
  * Issue Evidence: ${evidenceChecklist.issueEvidence ? 'YES' : 'NO'}
  * Explicit Rationale: ${evidenceChecklist.explicitRationale ? 'YES' : 'NO'}
  * Incident Evidence: ${evidenceChecklist.incidentEvidence ? 'YES' : 'NO'}
  * Recent Validation: ${evidenceChecklist.recentValidation ? 'YES' : 'NO'}

- Sample Evidence Records:
${evidenceSummary}

Output JSON format:
{
  "summary": "Concise high-level explanation of why Decision Debt is ${level}.",
  "signalExplanations": [
    {
      "signalType": "MISSING_RATIONALE",
      "explanation": "Detailed explanation of signal...",
      "evidenceIds": ["ev-1"]
    }
  ],
  "groundedClaims": [
    {
      "claim": "Claim grounded in evidence...",
      "classification": "FACT",
      "evidenceIds": ["ev-1"]
    }
  ],
  "recommendedActions": [
    "Action 1 to reduce debt..."
  ]
}`;

    try {
      const aiRaw = await ProviderService.queryGemini(prompt, `Why is Decision Debt ${level} for ${targetNodeLabel}?`);
      if (aiRaw && typeof aiRaw === 'object' && aiRaw.answer && aiRaw.provider !== 'GEMINI_ERROR') {
        const text = typeof aiRaw.answer === 'string' ? aiRaw.answer : JSON.stringify(aiRaw.answer);
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
        let parsed: any = null;
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[1]); } catch {}
        }
        return {
          nodeId: debt.targetNodeId,
          nodeLabel: debt.targetNodeLabel,
          level: debt.level,
          score: debt.score,
          confidence: debt.confidence,
          summary: parsed?.summary || text || debt.explanation,
          signalExplanations: parsed?.signalExplanations || [],
          groundedClaims: parsed?.groundedClaims || aiRaw.claims || [],
          recommendedActions: parsed?.recommendedActions || ['Review historical context in WHY Explorer', 'Document explicit architectural rationale'],
          generatedAt: new Date().toISOString(),
          isAiFallback: false
        };
      }
    } catch (err) {
      console.warn(`[DecisionDebtAiService] Gemini API call failed or unavailable, using grounded fallback generator.`, err);
    }

    // Fallback grounded synthesis
    return this.generateGroundedFallback(debt);
  }

  /**
   * Local grounded fallback explanation
   */
  private static generateGroundedFallback(debt: DecisionDebt): DecisionDebtAiExplanationResponse {
    const { targetNodeId, targetNodeLabel, targetNodeType, level, score, confidence, signals, evidence, evidenceChecklist } = debt;

    const signalExplanations = signals.map((sig) => ({
      signalType: sig.type,
      explanation: `${sig.title}: ${sig.description}`,
      evidenceIds: sig.evidenceIds
    }));

    const groundedClaims = evidence.slice(0, 4).map((e, idx) => ({
      claim: `${e.title} (${e.description})`,
      classification: e.classification,
      evidenceIds: [e.id]
    }));

    const recommendedActions: string[] = [];
    if (!evidenceChecklist.explicitRationale) {
      recommendedActions.push(`Add explicit ADR (Architectural Decision Record) or rationale documentation for ${targetNodeLabel}.`);
    }
    if (!evidenceChecklist.issueEvidence) {
      recommendedActions.push(`Link future modifications to tracked issue tickets or pull request design specs.`);
    }
    if (debt.reasoningAgeYears && debt.reasoningAgeYears >= 1.5) {
      recommendedActions.push(`Re-validate architectural assumptions; last rationale record is ${debt.reasoningAgeYears} years old.`);
    }
    if (recommendedActions.length === 0) {
      recommendedActions.push(`Perform routine architectural review in WHY Explorer.`);
    }

    return {
      nodeId: targetNodeId,
      nodeLabel: targetNodeLabel,
      level,
      score,
      confidence,
      summary: `EngiTrace analyzed ${evidence.length} historical records for ${targetNodeType} "${targetNodeLabel}". Decision Debt is ${level} (Score: ${score}/100) due to ${
        signals.length > 0 ? signals.map((s) => s.title).join(' and ') : 'historical evidence distribution'
      }.`,
      signalExplanations,
      groundedClaims,
      recommendedActions,
      generatedAt: new Date().toISOString(),
      isAiFallback: true
    };
  }
}
