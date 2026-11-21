/**
 * EngiTrace EEID Evaluation Runner — Layer 2 Semantic Evaluator
 *
 * Implements configurable semantic evaluation:
 * - Compares assistant response against gold expected claims
 * - Evaluates claim correctness, coverage, contradictions, and uncertainty
 * - Supports auxiliary LLM judge (Gemini) with versioned prompt
 * - Supports deterministic heuristic fallback (n-gram/token overlap & contradiction detection)
 * - Clearly labels model-assisted evaluations; never equates LLM judge with human truth
 * - Records judge model, prompt version, temperature, and rationale
 */

import {
  EEIDRecordV2,
  QuestionExecutionResult,
  SemanticEvaluationResult,
  SemanticClaimEvaluation,
  EvaluationConfig
} from '../types';
import { ProviderService } from '../../ai-engine/services/providerService';

export const SEMANTIC_JUDGE_PROMPT_VERSION = 'eeid-semantic-judge-v1.0';

export interface SemanticEvaluatorOptions {
  config: EvaluationConfig;
  customJudgeFn?: (
    record: EEIDRecordV2,
    assistantAnswer: string
  ) => Promise<{
    claims: SemanticClaimEvaluation[];
    coverage: number;
    contradictionRate: number;
    score: number;
    rawOutput?: string;
  }>;
}

export class SemanticEvaluator {
  private config: EvaluationConfig;
  private customJudgeFn?: SemanticEvaluatorOptions['customJudgeFn'];

  constructor(options: SemanticEvaluatorOptions) {
    this.config = options.config;
    this.customJudgeFn = options.customJudgeFn;
  }

  /**
   * Evaluates assistant response semantically against expected gold claims.
   */
  async evaluate(
    record: EEIDRecordV2,
    execution: QuestionExecutionResult
  ): Promise<SemanticEvaluationResult> {
    const raw = execution.rawResponse;
    const answer = raw?.answer || '';

    // If provider credentials need to be configured, exclude from scoring
    if (execution.providerStatus === 'PROVIDER_CONFIGURATION_REQUIRED') {
      return {
        recordId: record.recordId,
        enabled: this.config.semanticJudge.enabled,
        method: 'SKIPPED',
        claimCoverage: 'NOT_AVAILABLE',
        contradictionRate: 'NOT_AVAILABLE',
        overallSemanticScore: 'NOT_AVAILABLE',
        claimEvaluations: record.expectedClaims.map((c) => ({
          goldClaimId: c.claimId,
          goldClaimText: c.text,
          expectedClassification: c.classification,
          status: 'OMITTED',
          similarityScore: 0,
          rationale: 'Semantic evaluation skipped: provider configuration required (GEMINI_API_KEY unconfigured or invalid).'
        }))
      };
    }

    // If execution failed or answer is empty
    if (!execution.success || !answer.trim()) {
      return {
        recordId: record.recordId,
        enabled: this.config.semanticJudge.enabled,
        method: 'SKIPPED',
        claimCoverage: 0.0,
        contradictionRate: 0.0,
        overallSemanticScore: 0.0,
        claimEvaluations: record.expectedClaims.map((c) => ({
          goldClaimId: c.claimId,
          goldClaimText: c.text,
          expectedClassification: c.classification,
          status: 'OMITTED',
          similarityScore: 0,
          rationale: 'Assistant execution failed or produced empty answer.'
        }))
      };
    }

    // If semantic evaluation is disabled in config
    if (!this.config.semanticJudge.enabled || this.config.evaluationMode === 'deterministic') {
      return {
        recordId: record.recordId,
        enabled: false,
        method: 'SKIPPED',
        claimCoverage: 'NOT_AVAILABLE',
        contradictionRate: 'NOT_AVAILABLE',
        overallSemanticScore: 'NOT_AVAILABLE',
        claimEvaluations: []
      };
    }

    // 1. If custom judge function supplied (e.g. in test suite)
    if (this.customJudgeFn) {
      const customRes = await this.customJudgeFn(record, answer);
      return {
        recordId: record.recordId,
        enabled: true,
        method: 'LLM_JUDGE',
        claimCoverage: customRes.coverage,
        contradictionRate: customRes.contradictionRate,
        overallSemanticScore: customRes.score,
        claimEvaluations: customRes.claims,
        judgeMetadata: {
          evaluatorModel: this.config.semanticJudge.model,
          evaluatorProvider: this.config.semanticJudge.provider,
          promptVersion: SEMANTIC_JUDGE_PROMPT_VERSION,
          rawJudgeOutput: customRes.rawOutput,
          temperature: this.config.semanticJudge.temperature
        }
      };
    }

    // 2. Check if live Gemini API is configured for LLM judge
    const hasGeminiKey = Boolean(
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY.trim() !== '' &&
      !process.env.GEMINI_API_KEY.includes('your_gemini')
    );

    if (hasGeminiKey && this.config.semanticJudge.provider === 'GEMINI') {
      try {
        return await this.evaluateWithLlmJudge(record, answer);
      } catch (err) {
        console.warn(`[SemanticEvaluator] LLM Judge invocation failed for ${record.recordId}, falling back to heuristic:`, err);
      }
    }

    // 3. Deterministic Heuristic Semantic Evaluation
    return this.evaluateWithHeuristic(record, answer);
  }

  /**
   * Model-assisted auxiliary evaluation using Gemini
   */
  private async evaluateWithLlmJudge(
    record: EEIDRecordV2,
    assistantAnswer: string
  ): Promise<SemanticEvaluationResult> {
    const claimsSpec = record.expectedClaims.map((c) => ({
      claimId: c.claimId,
      text: c.text,
      classification: c.classification
    }));

    const judgePrompt = `You are an auxiliary evaluator for the EngiTrace EEID benchmark.
Evaluate whether the Assistant Answer correctly covers each Expected Gold Claim.

Repository: ${record.repository.name}
Snapshot: ${record.repository.commitSha}
Question: "${record.question}"

Expected Gold Answer Summary:
${record.expectedAnswer}

Expected Gold Claims to evaluate:
${JSON.stringify(claimsSpec, null, 2)}

Actual Assistant Answer to evaluate:
"""
${assistantAnswer}
"""

Instructions:
1. For each expected claim, determine its status in the assistant answer:
   - "SUPPORTED": Claim is factually and semantically conveyed accurately.
   - "PARTIALLY_SUPPORTED": Partial or incomplete coverage.
   - "CONTRADICTED": Assistant asserts a statement that contradicts the gold claim.
   - "OMITTED": Claim is completely missing from the answer.
2. Return ONLY valid JSON adhering strictly to this schema:
{
  "evaluations": [
    {
      "goldClaimId": "string",
      "status": "SUPPORTED" | "PARTIALLY_SUPPORTED" | "CONTRADICTED" | "OMITTED",
      "similarityScore": number between 0.0 and 1.0,
      "rationale": "one sentence explanation"
    }
  ],
  "overallSummary": "brief explanation"
}`;

    const rawResponse = await ProviderService.queryGeminiChat(
      judgePrompt,
      [{ role: 'user', content: 'Perform claim evaluation.' }],
      'WHY',
      'eeid-judge'
    );

    let parsedJudge: any = null;
    if (rawResponse?.answer) {
      try {
        const jsonMatch = rawResponse.answer.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedJudge = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Fall back to heuristic below if parse fails
      }
    }

    if (parsedJudge && Array.isArray(parsedJudge.evaluations)) {
      const claimEvals: SemanticClaimEvaluation[] = record.expectedClaims.map((gc) => {
        const found = parsedJudge.evaluations.find((e: any) => e.goldClaimId === gc.claimId);
        return {
          goldClaimId: gc.claimId,
          goldClaimText: gc.text,
          expectedClassification: gc.classification,
          status: found?.status || 'PARTIALLY_SUPPORTED',
          similarityScore: typeof found?.similarityScore === 'number' ? found.similarityScore : 0.7,
          rationale: found?.rationale || 'Evaluated by model-assisted judge.'
        };
      });

      const supportedCount = claimEvals.filter((e) => e.status === 'SUPPORTED').length;
      const partiallySupportedCount = claimEvals.filter((e) => e.status === 'PARTIALLY_SUPPORTED').length;
      const contradictedCount = claimEvals.filter((e) => e.status === 'CONTRADICTED').length;

      const claimCoverage = Number(
        ((supportedCount + partiallySupportedCount * 0.5) / claimEvals.length).toFixed(4)
      );
      const contradictionRate = Number((contradictedCount / claimEvals.length).toFixed(4));
      const overallSemanticScore = Math.max(0, Number((claimCoverage - contradictionRate).toFixed(4)));

      return {
        recordId: record.recordId,
        enabled: true,
        method: 'LLM_JUDGE',
        claimCoverage,
        contradictionRate,
        overallSemanticScore,
        claimEvaluations: claimEvals,
        judgeMetadata: {
          evaluatorModel: rawResponse.model || this.config.semanticJudge.model,
          evaluatorProvider: 'GEMINI',
          promptVersion: SEMANTIC_JUDGE_PROMPT_VERSION,
          rawJudgeOutput: rawResponse.answer,
          temperature: this.config.semanticJudge.temperature
        }
      };
    }

    return this.evaluateWithHeuristic(record, assistantAnswer);
  }

  /**
   * Deterministic heuristic semantic evaluation using token overlap & keyword matching
   */
  private evaluateWithHeuristic(
    record: EEIDRecordV2,
    assistantAnswer: string
  ): SemanticEvaluationResult {
    const answerTokens = this.tokenize(assistantAnswer);

    const claimEvaluations: SemanticClaimEvaluation[] = record.expectedClaims.map((goldClaim) => {
      const claimTokens = this.tokenize(goldClaim.text);
      if (claimTokens.size === 0) {
        return {
          goldClaimId: goldClaim.claimId,
          goldClaimText: goldClaim.text,
          expectedClassification: goldClaim.classification,
          status: 'SUPPORTED',
          similarityScore: 1.0,
          rationale: 'Empty gold claim tokens.'
        };
      }

      let matches = 0;
      claimTokens.forEach((token) => {
        if (answerTokens.has(token)) {
          matches++;
        }
      });

      const overlap = matches / claimTokens.size;

      // Check for contradictions (negation cues)
      const hasContradictionCue =
        (assistantAnswer.toLowerCase().includes('not ') || assistantAnswer.toLowerCase().includes('never ')) &&
        overlap > 0.4 &&
        !goldClaim.text.toLowerCase().includes('not ') &&
        !goldClaim.text.toLowerCase().includes('never ');

      let status: SemanticClaimEvaluation['status'] = 'OMITTED';
      if (hasContradictionCue && overlap > 0.6) {
        status = 'CONTRADICTED';
      } else if (overlap >= 0.50) {
        status = 'SUPPORTED';
      } else if (overlap >= 0.25) {
        status = 'PARTIALLY_SUPPORTED';
      }

      return {
        goldClaimId: goldClaim.claimId,
        goldClaimText: goldClaim.text,
        expectedClassification: goldClaim.classification,
        status,
        similarityScore: Number(overlap.toFixed(4)),
        rationale: `Deterministic token overlap: ${(overlap * 100).toFixed(1)}%`
      };
    });

    const supportedCount = claimEvaluations.filter((e) => e.status === 'SUPPORTED').length;
    const partiallyCount = claimEvaluations.filter((e) => e.status === 'PARTIALLY_SUPPORTED').length;
    const contradictedCount = claimEvaluations.filter((e) => e.status === 'CONTRADICTED').length;

    const claimCoverage = Number(
      ((supportedCount + partiallyCount * 0.5) / claimEvaluations.length).toFixed(4)
    );
    const contradictionRate = Number((contradictedCount / claimEvaluations.length).toFixed(4));
    const overallSemanticScore = Math.max(0, Number((claimCoverage - contradictionRate).toFixed(4)));

    return {
      recordId: record.recordId,
      enabled: true,
      method: 'HEURISTIC',
      claimCoverage,
      contradictionRate,
      overallSemanticScore,
      claimEvaluations
    };
  }

  private tokenize(text: string): Set<string> {
    const stopwords = new Set([
      'the', 'is', 'in', 'at', 'of', 'on', 'and', 'a', 'an', 'to', 'for', 'with', 'by',
      'that', 'it', 'this', 'from', 'be', 'are', 'was', 'were', 'as', 'or'
    ]);
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopwords.has(w));
    return new Set(words);
  }
}
