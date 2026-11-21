/**
 * EngiTrace Phase 5 - Decision Debt & Engineering Risk Intelligence Types
 */

import { NormalizedEvidence } from './evidence';

export type DecisionDebtSignalType =
  | 'MISSING_RATIONALE'
  | 'HISTORICAL_FRAGMENTATION'
  | 'STALE_REASONING'
  | 'REPEATED_MODIFICATIONS'
  | 'DEPENDENCY_EVOLUTION'
  | 'EVIDENCE_WEAKNESS';

export type DecisionDebtLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INSUFFICIENT';

export type ReviewPriority =
  | 'REVIEW_FIRST'
  | 'INVESTIGATE_EVIDENCE'
  | 'REVIEW_CONVENIENT'
  | 'MONITOR'
  | 'INSUFFICIENT_DATA';

export interface DecisionDebtSignal {
  id: string;
  type: DecisionDebtSignalType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  description: string;
  evidenceIds: string[];
  confidence: number;
  metadata?: Record<string, any>;
}

export interface EvidenceChecklist {
  commitEvidence: boolean;
  pullRequestEvidence: boolean;
  issueEvidence: boolean;
  explicitRationale: boolean;
  incidentEvidence: boolean;
  recentValidation: boolean;
}

export interface DecisionDebt {
  id: string;
  repositoryId: string;
  targetNodeId: string;
  targetNodeLabel: string;
  targetNodeType: string;
  level: DecisionDebtLevel;
  score: number; // 0 - 100
  confidence: number; // 0.0 - 1.0
  signals: DecisionDebtSignal[];
  evidence: NormalizedEvidence[];
  evidenceChecklist: EvidenceChecklist;
  explanation: string;
  reviewPriority: ReviewPriority;
  lastRationaleDate?: string;
  reasoningAgeYears?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryDecisionDebtSummary {
  repositoryId: string;
  repositoryName: string;
  overallScore: number;
  overallLevel: DecisionDebtLevel;
  evidenceCoverage: number; // 0.0 - 1.0 (or percentage)
  historicalCoverage: number; // 0.0 - 1.0 (or percentage)
  totalComponents: number;
  breakdown: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
    INSUFFICIENT: number;
  };
  topDebtComponents: DecisionDebt[];
  unresolvedWhyCount: number;
  weakContextComponentCount: number;
  analyzedAt: string;
}

export interface DecisionDebtAiExplanationResponse {
  nodeId: string;
  nodeLabel: string;
  level: DecisionDebtLevel;
  score: number;
  confidence: number;
  summary: string;
  signalExplanations: Array<{
    signalType: DecisionDebtSignalType;
    explanation: string;
    evidenceIds: string[];
  }>;
  groundedClaims: Array<{
    claim: string;
    classification: 'FACT' | 'INFERENCE' | 'UNKNOWN';
    evidenceIds: string[];
  }>;
  recommendedActions: string[];
  generatedAt: string;
  isAiFallback: boolean;
}
