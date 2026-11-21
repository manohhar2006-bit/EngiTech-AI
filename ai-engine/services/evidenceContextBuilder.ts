/**
 * EngiTrace Phase 4 - Evidence Context Builder Service
 * Deterministically retrieves, ranks, deduplicates, and bounds historical evidence context for AI reasoning.
 */

import { WhyResult } from '../../backend/src/types/why';
import { NormalizedEvidence } from '../../backend/src/types/evidence';
import { AIContext } from '../types/aiContext';

export class EvidenceContextBuilder {
  /**
   * Main entry point: Build a compact, prioritized AIContext from a WhyResult
   */
  static buildContext(whyResult: WhyResult, maxEvidenceItems = 15): AIContext {
    const { target, question, historicalChain, evidence, facts, inferences, unknowns, sourceLinks } = whyResult;

    // 1. Deduplicate Evidence
    const uniqueEvidenceMap = new Map<string, NormalizedEvidence>();
    evidence.forEach((ev) => uniqueEvidenceMap.set(ev.id, ev));

    // Also include evidence items embedded in historical chain steps
    historicalChain.forEach((step) => {
      if (Array.isArray(step.evidence)) {
        step.evidence.forEach((ev) => {
          if (typeof ev !== 'string' && ev && ev.id) {
            uniqueEvidenceMap.set(ev.id, ev);
          }
        });
      }
    });

    const allEvidence = Array.from(uniqueEvidenceMap.values());

    // 2. Rank Evidence by Priority
    const rankedEvidence = this.rankEvidence(allEvidence, target.id);

    // 3. Bound Context (trim to top N items)
    const boundedEvidence = rankedEvidence.slice(0, maxEvidenceItems);

    // 4. Extract compact relationships
    const relationships = boundedEvidence.map((ev) => ({
      source: ev.source,
      target: ev.target,
      type: ev.relationshipType
    }));

    return {
      target,
      question,
      historicalChain,
      evidence: boundedEvidence,
      facts,
      inferences,
      unknowns,
      relationships,
      metadata: {
        repositoryId: target.id.split(':')[1] || target.id,
        totalEvidenceCount: allEvidence.length,
        contextBuiltAt: new Date().toISOString()
      },
      sourceLinks
    };
  }

  /**
   * Deterministic Evidence Priority Ranking Algorithm:
   * 1. Highest Priority: Direct commit/file, PR/commit, explicit issue/PR references, direct source metadata
   * 2. Medium Priority: Related commits/files, temporal relationships, multi-signal correlations
   * 3. Lower Priority: Indirect associations
   */
  private static rankEvidence(evidenceList: NormalizedEvidence[], targetNodeId: string): NormalizedEvidence[] {
    return [...evidenceList].sort((a, b) => {
      const scoreA = this.calculatePriorityScore(a, targetNodeId);
      const scoreB = this.calculatePriorityScore(b, targetNodeId);
      return scoreB - scoreA;
    });
  }

  private static calculatePriorityScore(ev: NormalizedEvidence, targetNodeId: string): number {
    let score = 0;

    // Direct relationship to target node
    if (ev.source === targetNodeId || ev.target === targetNodeId) {
      score += 50;
    }

    // Direct explicit references (Commits, PRs, Issues)
    const rel = ev.relationshipType.toUpperCase();
    if (rel.includes('MODIFIED') || rel.includes('CONTAINS')) score += 30;
    if (rel.includes('PR') || rel.includes('MERGED')) score += 25;
    if (rel.includes('ISSUE') || rel.includes('RESOLV')) score += 25;
    if (rel.includes('DEPENDS')) score += 20;

    // FACT vs INFERENCE classification weight
    if (ev.classification === 'FACT') score += 15;
    else if (ev.classification === 'INFERENCE') score += 10;

    // Source URL presence boost
    if (ev.sourceUrl && ev.sourceUrl.startsWith('http')) score += 10;

    // Confidence boost
    score += (ev.confidence || 0.5) * 10;

    return score;
  }

  /**
   * Serialize context to compact JSON string suitable for LLM prompt payload
   */
  static serializeContext(context: AIContext): string {
    return JSON.stringify(
      {
        target: {
          id: context.target.id,
          type: context.target.type,
          label: context.target.label,
          sublabel: context.target.sublabel
        },
        relationships: context.evidence.map((ev) => ({
          sourceNode: ev.source,
          relationshipType: ev.relationshipType,
          targetNode: ev.target,
          classification: ev.classification,
          evidenceDescription: ev.description,
          sourceUrl: ev.sourceUrl
        })),
        historicalChain: context.historicalChain.map((step) => ({
          step: step.stepNumber,
          event: step.event,
          node: `${step.node.type}: ${step.node.label}`,
          classification: step.classification,
          confidence: step.confidence,
          timestamp: step.timestamp,
          sourceUrl: step.sourceUrl
        })),
        evidenceRecords: context.evidence.map((ev) => ({
          id: ev.id,
          title: ev.title,
          relationshipType: ev.relationshipType,
          classification: ev.classification,
          confidence: ev.confidence,
          description: ev.description,
          sourceUrl: ev.sourceUrl,
          timestamp: ev.timestamp
        })),
        establishedFacts: context.facts.map((f) => ({ id: f.id, statement: f.statement, evidenceIds: f.evidenceIds })),
        establishedInferences: context.inferences.map((i) => ({ id: i.id, statement: i.statement, reasoning: i.reasoning, evidenceIds: i.evidenceIds })),
        knownUnknowns: context.unknowns.map((u) => ({ id: u.id, area: u.area, reason: u.reason }))
      },
      null,
      2
    );
  }
}
