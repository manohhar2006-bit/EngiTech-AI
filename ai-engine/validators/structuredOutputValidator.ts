/**
 * EngiTrace Phase 4 - Structured Output Validator & Hallucination Defense
 * Ensures model outputs strictly conform to schema and cite valid evidence IDs from context.
 */

import { AIContext, AIClaim } from '../types/aiContext';
import { ExplainableConfidence, FactItem, InferenceItem, UnknownItem } from '../../backend/src/types/why';
import { NormalizedEvidence } from '../../backend/src/types/evidence';

export interface ValidationResult {
  isValid: boolean;
  summary: string;
  claims: AIClaim[];
  facts: FactItem[];
  inferences: InferenceItem[];
  unknowns: UnknownItem[];
  reasoningSteps: string[];
  confidence: ExplainableConfidence;
  evidenceReferences: string[];
  validationLog: string[];
}

export class StructuredOutputValidator {
  private static normalizeRepoSlug(id: string): string {
    try {
      return decodeURIComponent(id).trim().replace(/^repo-/, '').replace(/\//g, '-').toLowerCase();
    } catch {
      return id.trim().replace(/^repo-/, '').replace(/\//g, '-').toLowerCase();
    }
  }

  /**
   * Verify that an evidence record belongs to the repository of the supplied AIContext.
   */
  private static isEvidenceForContextRepository(ev: NormalizedEvidence, context: AIContext): boolean {
    const expectedRepoId = context?.metadata?.repositoryId;
    if (!expectedRepoId || !ev?.repositoryId) {
      return true;
    }

    const evRepoId = ev.repositoryId;
    if (evRepoId === expectedRepoId) {
      return true;
    }

    if (this.normalizeRepoSlug(evRepoId) === this.normalizeRepoSlug(expectedRepoId)) {
      return true;
    }

    // WhyExplorerService assigns targetNode.id to evidence.repositoryId; allow only if it does not encode another repo
    if (context?.target?.id && evRepoId === context.target.id) {
      const targetParts = context.target.id.split(':');
      if (targetParts.length >= 2 && ['file', 'pull_request', 'issue', 'repository'].includes(targetParts[0])) {
        return this.normalizeRepoSlug(targetParts[1]) === this.normalizeRepoSlug(expectedRepoId);
      }
      return true;
    }

    if (evRepoId.includes(':')) {
      const parts = evRepoId.split(':');
      if (parts.length >= 2 && ['file', 'pull_request', 'issue', 'repository'].includes(parts[0])) {
        return this.normalizeRepoSlug(parts[1]) === this.normalizeRepoSlug(expectedRepoId);
      }
    }

    return false;
  }

  /**
   * Validate and sanitize raw AI provider response against supplied AIContext
   */
  static validate(rawResponse: any, context: AIContext): ValidationResult {
    const validationLog: string[] = [];
    const validEvidenceIds = new Set<string>();
    const factEvidenceIds = new Set<string>();
    const inferenceEvidenceIds = new Set<string>();
    const rejectedEvidenceIds = new Set<string>();

    const contextEvidence = Array.isArray(context?.evidence) ? context.evidence : [];
    const contextFacts = Array.isArray(context?.facts) ? context.facts : [];
    const contextInferences = Array.isArray(context?.inferences) ? context.inferences : [];
    const contextUnknowns = Array.isArray(context?.unknowns) ? context.unknowns : [];

    contextEvidence.forEach((ev) => {
      if (!ev || typeof ev.id !== 'string' || !ev.id.trim()) return;
      if (this.isEvidenceForContextRepository(ev, context)) {
        const idTrimmed = ev.id.trim();
        validEvidenceIds.add(idTrimmed);
        const classification = String(ev.classification || '').toUpperCase();
        if (classification === 'INFERENCE') {
          inferenceEvidenceIds.add(idTrimmed);
        } else {
          factEvidenceIds.add(idTrimmed);
        }
      } else {
        rejectedEvidenceIds.add(ev.id.trim());
        validationLog.push(
          `Repository Isolation: Rejected evidence "${ev.id}" belonging to "${ev.repositoryId}" (expected "${context?.metadata?.repositoryId}").`
        );
      }
    });

    // Include facts and inferences evidence IDs from this same context as valid
    contextFacts.forEach((f) => {
      if (!Array.isArray(f?.evidenceIds)) return;
      f.evidenceIds.forEach((id) => {
        if (typeof id === 'string' && id.trim() && !rejectedEvidenceIds.has(id.trim())) {
          const idTrimmed = id.trim();
          validEvidenceIds.add(idTrimmed);
          factEvidenceIds.add(idTrimmed);
        }
      });
    });
    contextInferences.forEach((i) => {
      if (!Array.isArray(i?.evidenceIds)) return;
      i.evidenceIds.forEach((id) => {
        if (typeof id === 'string' && id.trim() && !rejectedEvidenceIds.has(id.trim())) {
          const idTrimmed = id.trim();
          validEvidenceIds.add(idTrimmed);
          inferenceEvidenceIds.add(idTrimmed);
        }
      });
    });

    // 1. Basic Schema Extraction
    let summary = typeof rawResponse?.summary === 'string' && rawResponse.summary.trim()
      ? rawResponse.summary.trim()
      : typeof rawResponse?.answer === 'string' && rawResponse.answer.trim()
        ? rawResponse.answer.trim()
        : '';
    const rawClaims = Array.isArray(rawResponse?.claims) ? rawResponse.claims : [];
    const rawReasoning = Array.isArray(rawResponse?.reasoningSteps) ? rawResponse.reasoningSteps : [];
    const rawUnknowns = Array.isArray(rawResponse?.unknownAreas) ? rawResponse.unknownAreas : [];

    if (!summary) {
      const targetLabel = context?.target?.label || 'target node';
      const chainLen = Array.isArray(context?.historicalChain) ? context.historicalChain.length : 0;
      summary = `EngiTrace analyzed ${targetLabel} across ${chainLen} historical events in repository memory.`;
      validationLog.push('Notice: Model output missing summary field; populated default summary.');
    }

    // 2. Validate & Sanitize Claims (Hallucination Defense)
    const sanitizedClaims: AIClaim[] = [];
    const facts: FactItem[] = [];
    const inferences: InferenceItem[] = [];
    const unknowns: UnknownItem[] = [];
    const referencedEvidenceSet = new Set<string>();

    let factCounter = 1;
    let infCounter = 1;
    let unkCounter = 1;

    rawClaims.forEach((claim: any, idx: number) => {
      if (!claim || typeof claim !== 'object') return;
      const rawText = typeof claim.text === 'string' ? claim.text : typeof claim.claim === 'string' ? claim.claim : '';
      const claimText = rawText.trim();
      if (!claimText) return;

      const rawClassification = typeof claim.classification === 'string' ? claim.classification.trim().toUpperCase() : '';
      let classification: 'FACT' | 'INFERENCE' | 'UNKNOWN';
      if (rawClassification === 'FACT' || rawClassification === 'INFERENCE' || rawClassification === 'UNKNOWN') {
        classification = rawClassification;
      } else {
        classification = 'UNKNOWN';
        validationLog.push(
          `Classification Defense: Claim "${claimText.slice(0, 30)}..." had missing or unsupported classification "${String(claim.classification ?? '')}". Defaulting to UNKNOWN.`
        );
      }

      // Normalize and deduplicate claimed evidence IDs
      let uniqueClaimedIds: string[] = [];
      if (Array.isArray(claim.evidenceIds)) {
        const seen = new Set<string>();
        claim.evidenceIds.forEach((rawId: unknown) => {
          if (typeof rawId === 'string') {
            const trimmedId = rawId.trim();
            if (trimmedId && !seen.has(trimmedId)) {
              seen.add(trimmedId);
              uniqueClaimedIds.push(trimmedId);
            }
          }
        });
      } else if (claim.evidenceIds !== undefined && claim.evidenceIds !== null) {
        validationLog.push(`Schema Defense: Claim "${claimText.slice(0, 30)}..." had non-array evidenceIds; ignoring invalid field.`);
      }

      const verifiedEvidenceIds = uniqueClaimedIds.filter((id) => validEvidenceIds.has(id));
      const invalidEvidenceIds = uniqueClaimedIds.filter((id) => !validEvidenceIds.has(id));

      if (invalidEvidenceIds.length > 0 && verifiedEvidenceIds.length > 0) {
        validationLog.push(
          `Evidence Filtering: Removed ${invalidEvidenceIds.length} invalid or out-of-scope evidence ID(s) [${invalidEvidenceIds.join(', ')}] from claim "${claimText.slice(0, 30)}...".`
        );
      }

      let wasDowngraded = false;
      if (uniqueClaimedIds.length > 0 && verifiedEvidenceIds.length === 0) {
        wasDowngraded = classification !== 'UNKNOWN';
        validationLog.push(
          `Hallucination Defense: Claim "${claimText.slice(0, 30)}..." referenced invalid evidence IDs [${uniqueClaimedIds.join(', ')}]. Downgrading classification to UNKNOWN.`
        );
        classification = 'UNKNOWN';
      } else if (classification === 'FACT' && verifiedEvidenceIds.length === 0) {
        wasDowngraded = true;
        validationLog.push(
          `Hallucination Defense: FACT claim "${claimText.slice(0, 30)}..." provided no supporting evidence IDs. Downgrading classification to UNKNOWN.`
        );
        classification = 'UNKNOWN';
      } else if (classification === 'FACT') {
        // Epistemological Defense: A FACT claim cannot be backed exclusively by INFERENCE evidence
        const hasFactEvidence = verifiedEvidenceIds.some((id) => factEvidenceIds.has(id));
        const onlyInference = verifiedEvidenceIds.every((id) => inferenceEvidenceIds.has(id));
        if (!hasFactEvidence && onlyInference) {
          wasDowngraded = true;
          classification = 'INFERENCE';
          validationLog.push(
            `Epistemological Defense: Claim "${claimText.slice(0, 30)}..." asserted FACT but cited only INFERENCE evidence [${verifiedEvidenceIds.join(', ')}]. Downgrading classification to INFERENCE.`
          );
        }
      }

      verifiedEvidenceIds.forEach((id) => referencedEvidenceSet.add(id));

      const sourceUrls: string[] = Array.isArray(claim.sourceUrls)
        ? claim.sourceUrls.filter((u: any) => typeof u === 'string' && u.trim().length > 0)
        : [];
      const reasoning = typeof claim.reasoning === 'string' && claim.reasoning.trim().length > 0
        ? claim.reasoning.trim()
        : undefined;

      const hasFiniteConfidence = typeof claim.confidence === 'number' && Number.isFinite(claim.confidence);
      const claimConfidence = wasDowngraded
        ? 0.1
        : hasFiniteConfidence
          ? Math.max(0.1, Math.min(1.0, claim.confidence))
          : classification === 'FACT'
            ? 0.95
            : classification === 'INFERENCE'
              ? 0.75
              : 0.1;

      const sanitizedClaim: AIClaim = {
        id: `ai-claim-${idx + 1}`,
        text: claimText,
        classification,
        confidence: claimConfidence,
        evidenceIds: verifiedEvidenceIds,
        sourceUrls,
        reasoning
      };

      sanitizedClaims.push(sanitizedClaim);

      // Map sanitized claim to structured Fact/Inference/Unknown lists
      if (classification === 'FACT') {
        facts.push({
          id: `ai-fact-${factCounter++}`,
          statement: claimText,
          evidenceIds: verifiedEvidenceIds,
          sourceUrl: sourceUrls[0]
        });
      } else if (classification === 'INFERENCE') {
        inferences.push({
          id: `ai-inf-${infCounter++}`,
          statement: claimText,
          reasoning: reasoning || 'Inferred connection based on repository evidence and historical commit proximity.',
          evidenceIds: verifiedEvidenceIds,
          sourceUrl: sourceUrls[0]
        });
      } else {
        unknowns.push({
          id: `ai-unk-${unkCounter++}`,
          area: 'Historical Rationale',
          reason: claimText
        });
      }
    });

    // Merge context unknowns if raw output missed them
    contextUnknowns.forEach((u) => {
      if (!unknowns.some((existing) => existing.area === u.area)) {
        unknowns.push({
          id: `ai-unk-${unkCounter++}`,
          area: u.area,
          reason: u.reason
        });
      }
    });

    // Merge rawUnknowns
    rawUnknowns.forEach((u: any) => {
      if (u && typeof u.area === 'string' && typeof u.reason === 'string') {
        if (!unknowns.some((existing) => existing.area === u.area)) {
          unknowns.push({
            id: `ai-unk-${unkCounter++}`,
            area: u.area,
            reason: u.reason
          });
        }
      }
    });

    // 3. Compute Explainable Grounding Confidence Score
    let confidenceScore = 0.5;
    const confidenceReasons: string[] = [];

    if (facts.length > 0) {
      confidenceScore += Math.min(0.35, facts.length * 0.12);
      confidenceReasons.push(`✓ ${facts.length} AI claims grounded in verified direct evidence facts`);
    }

    if (inferences.length > 0) {
      confidenceScore += Math.min(0.15, inferences.length * 0.05);
      confidenceReasons.push(`✓ ${inferences.length} plausible historical inference claims synthesized`);
    }

    if (referencedEvidenceSet.size > 0) {
      confidenceReasons.push(`✓ Referenced ${referencedEvidenceSet.size} unique graph evidence records`);
    } else {
      confidenceScore -= 0.15;
      confidenceReasons.push('! Zero evidence records explicitly cited in AI reasoning output');
    }

    if (unknowns.length > 0) {
      confidenceReasons.push(`! ${unknowns.length} undocumented historical rationale areas identified`);
    }

    const finalScore = Math.max(0.1, Math.min(0.98, parseFloat(confidenceScore.toFixed(2))));
    const level = finalScore >= 0.85 ? 'HIGH' : finalScore >= 0.65 ? 'MEDIUM' : 'LOW';

    return {
      isValid: true,
      summary,
      claims: sanitizedClaims,
      facts,
      inferences,
      unknowns,
      reasoningSteps: rawReasoning.filter((r: any) => typeof r === 'string'),
      confidence: {
        score: finalScore,
        level,
        reasons: confidenceReasons
      },
      evidenceReferences: Array.from(referencedEvidenceSet),
      validationLog
    };
  }
}
