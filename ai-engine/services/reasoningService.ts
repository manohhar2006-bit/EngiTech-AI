/**
 * EngiTrace Phase 4 - Main AI Evidence Reasoning Orchestrator Service
 */

import { WhyResult } from '../../backend/src/types/why';
import { AIReasoningResponse, AIClaim } from '../types/aiContext';
import { EvidenceContextBuilder } from './evidenceContextBuilder';
import { ProviderService } from './providerService';
import { StructuredOutputValidator } from '../validators/structuredOutputValidator';
import { ReasoningCache } from '../cache/reasoningCache';
import { PROMPT_VERSION } from '../prompts/why.v1';

export class ReasoningService {
  /**
   * Main entry point: Reason over WhyResult using AI context builder & Gemini provider (or fallback engine)
   */
  static async reasonOverEvidence(whyResult: WhyResult): Promise<AIReasoningResponse> {
    const { target, question, historicalChain, evidence, facts, inferences, unknowns, sourceLinks } = whyResult;
    const repositoryId = target.id.split(':')[1] || target.id;

    // 1. Check Cache
    const cacheKey = ReasoningCache.generateCacheKey(repositoryId, target.id, evidence.length);
    const cachedResponse = ReasoningCache.get(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    // 2. Build Bounded Evidence Context
    const context = EvidenceContextBuilder.buildContext(whyResult);
    const serializedContext = EvidenceContextBuilder.serializeContext(context);

    // 3. Query Provider (Gemini API)
    const rawAiOutput = await ProviderService.queryGemini(serializedContext, question || context.question);

    let finalResponse: AIReasoningResponse;

    if (rawAiOutput && rawAiOutput.provider === 'GEMINI' && !rawAiOutput.error && rawAiOutput.answer) {
      // 4. Validate Provider Structured Output against Grounded Context
      const validation = StructuredOutputValidator.validate(rawAiOutput, context);

      finalResponse = {
        target,
        question: context.question,
        summary: validation.summary,
        claims: validation.claims,
        facts: validation.facts.length > 0 ? validation.facts : facts,
        inferences: validation.inferences.length > 0 ? validation.inferences : inferences,
        unknowns: validation.unknowns.length > 0 ? validation.unknowns : unknowns,
        reasoning: validation.reasoningSteps.length > 0 ? validation.reasoningSteps : historicalChain.map((s) => s.event),
        confidence: validation.confidence,
        evidenceReferences: validation.evidenceReferences,
        sourceLinks,
        generatedAt: new Date().toISOString(),
        modelMetadata: {
          provider: 'Google Gemini 3.6 Flash',
          model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
          promptVersion: PROMPT_VERSION,
          cached: false,
          fallbackUsed: false
        }
      };
    } else {
      // 5. Fallback: Deterministic Evidence-Backed Reasoning Engine
      finalResponse = this.generateFallbackReasoning(whyResult, context);
    }

    // 6. Cache and return
    ReasoningCache.set(cacheKey, finalResponse);

    return finalResponse;
  }

  /**
   * Deterministic local fallback synthesis when Gemini API is unconfigured or unavailable
   */
  private static generateFallbackReasoning(whyResult: WhyResult, context: ReturnType<typeof EvidenceContextBuilder.buildContext>): AIReasoningResponse {
    const { target, question, historicalChain, facts, inferences, unknowns, sourceLinks, confidence } = whyResult;

    const claims: AIClaim[] = [];
    const reasoningSteps: string[] = [];

    // Synthesize Facts into AI Claims
    facts.forEach((fact, idx) => {
      claims.push({
        id: `ai-claim-fact-${idx + 1}`,
        text: fact.statement,
        classification: 'FACT',
        confidence: 0.98,
        evidenceIds: fact.evidenceIds,
        sourceUrls: fact.sourceUrl ? [fact.sourceUrl] : []
      });
      reasoningSteps.push(`Verified Direct Fact: ${fact.statement}`);
    });

    // Synthesize Inferences into AI Claims
    inferences.forEach((inf, idx) => {
      claims.push({
        id: `ai-claim-inf-${idx + 1}`,
        text: inf.statement,
        classification: 'INFERENCE',
        confidence: 0.85,
        evidenceIds: inf.evidenceIds,
        sourceUrls: inf.sourceUrl ? [inf.sourceUrl] : [],
        reasoning: inf.reasoning
      });
      reasoningSteps.push(`Historical Inference: ${inf.statement} (${inf.reasoning})`);
    });

    // Synthesize Unknowns into AI Claims
    unknowns.forEach((unk, idx) => {
      claims.push({
        id: `ai-claim-unk-${idx + 1}`,
        text: `Undocumented ${unk.area}: ${unk.reason}`,
        classification: 'UNKNOWN',
        confidence: 0.1,
        evidenceIds: [],
        sourceUrls: []
      });
      reasoningSteps.push(`Undocumented Rationale (${unk.area}): ${unk.reason}`);
    });

    const fallbackSummary = `${target.type} "${target.label}" exists based on ${historicalChain.length} historical events reconstructed from repository commits, PRs, and issue linkages.`;

    return {
      target,
      question: question || `Why does ${target.label} exist?`,
      summary: fallbackSummary,
      claims,
      facts,
      inferences,
      unknowns,
      reasoning: reasoningSteps,
      confidence,
      evidenceReferences: context.evidence.map((e) => e.id),
      sourceLinks,
      generatedAt: new Date().toISOString(),
      modelMetadata: {
        provider: 'EngiTrace Grounded Evidence Synthesis (Local Fallback)',
        model: 'engitrace-deterministic-reasoner-v1',
        promptVersion: PROMPT_VERSION,
        cached: false,
        fallbackUsed: true
      }
    };
  }
}
