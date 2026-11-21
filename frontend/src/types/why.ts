/**
 * EngiTrace Phase 3 & 4 - Frontend WHY Query, Evidence & AI Result Types
 */

import { GraphNode, EvidenceClassification } from './graph';
import { NormalizedEvidence } from './evidence';

export interface WhyQuery {
  repositoryId: string;
  nodeId: string;
  nodeType?: string;
  question?: string;
  options?: {
    depth?: number;
    maxChainLength?: number;
  };
}

export interface HistoricalChainStep {
  stepNumber: number;
  node: GraphNode;
  event: string;
  relationship: string;
  evidence: NormalizedEvidence[] | string[];
  classification: EvidenceClassification;
  confidence: number;
  timestamp?: string;
  sourceUrl?: string;
}

export interface FactItem {
  id: string;
  statement: string;
  evidenceIds: string[];
  sourceUrl?: string;
}

export interface InferenceItem {
  id: string;
  statement: string;
  reasoning: string;
  evidenceIds: string[];
  sourceUrl?: string;
}

export interface UnknownItem {
  id: string;
  area: string;
  reason: string;
}

export interface ExplainableConfidence {
  score: number; // 0.0 - 1.0
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
}

export interface SourceLink {
  label: string;
  url: string;
  type: 'COMMIT' | 'PULL_REQUEST' | 'ISSUE' | 'FILE' | 'DEPENDENCY' | 'DOCUMENTATION';
}

export interface WhyResult {
  target: GraphNode;
  question: string;
  summary: string;
  historicalChain: HistoricalChainStep[];
  evidence: NormalizedEvidence[];
  facts: FactItem[];
  inferences: InferenceItem[];
  unknowns: UnknownItem[];
  confidence: ExplainableConfidence;
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
