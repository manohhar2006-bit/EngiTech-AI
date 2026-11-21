/**
 * EngiTrace Phase 4 - AI-Assisted Evidence Reasoning Context & Claim Types
 */

import { GraphNode } from '../../graph-engine/src';
import { NormalizedEvidence, EvidenceClassification } from '../../backend/src/types/evidence';
import { HistoricalChainStep, FactItem, InferenceItem, UnknownItem, ExplainableConfidence, SourceLink } from '../../backend/src/types/why';

export interface AIContext {
  target: GraphNode;
  question: string;
  historicalChain: HistoricalChainStep[];
  evidence: NormalizedEvidence[];
  facts: FactItem[];
  inferences: InferenceItem[];
  unknowns: UnknownItem[];
  relationships: { source: string; target: string; type: string }[];
  metadata: {
    repositoryId: string;
    totalEvidenceCount: number;
    contextBuiltAt: string;
  };
  sourceLinks: SourceLink[];
}

export interface AIClaim {
  id?: string;
  text: string;
  classification: EvidenceClassification; // FACT | INFERENCE | UNKNOWN
  confidence: number;
  evidenceIds: string[];
  sourceUrls: string[];
  reasoning?: string;
}

export interface AIReasoningResponse {
  target: GraphNode;
  question: string;
  summary: string;
  claims: AIClaim[];
  facts: FactItem[];
  inferences: InferenceItem[];
  unknowns: UnknownItem[];
  reasoning: string[];
  confidence: ExplainableConfidence;
  evidenceReferences: string[];
  sourceLinks: SourceLink[];
  generatedAt: string;
  modelMetadata: {
    provider: string;
    model: string;
    promptVersion: string;
    cached: boolean;
    fallbackUsed?: boolean;
  };
}
