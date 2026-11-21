/**
 * EngiTrace Phase 6 - What-If Impact Analysis Frontend Types
 */

import { GraphNode, GraphEdge, EvidenceClassification } from './graph';

export type ImpactOperation = 'REMOVE' | 'CHANGE';

export type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ExplainableRating = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ImpactQuery {
  repositoryId: string;
  nodeId: string;
  operation: ImpactOperation;
  maxDepth?: number;
}

export interface ImpactEvidenceItem {
  id: string;
  edgeId: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  classification: EvidenceClassification;
  confidence: number;
  evidence: string;
  sourceUrl?: string;
  timestamp?: string;
}

export interface ExplainableConfidence {
  score: number;
  rating: ExplainableRating;
  reasons: string[];
}

export interface AffectedCategoryCounts {
  directCount: number;
  indirectCount: number;
  fileCount: number;
  componentCount: number;
  apiCount: number;
  testCount: number;
  dependencyCount: number;
}

export interface ImpactResult {
  target: GraphNode;
  operation: ImpactOperation;

  directImpact: GraphNode[];
  indirectImpact: GraphNode[];

  affectedFiles: GraphNode[];
  affectedComponents: GraphNode[];
  affectedAPIs: GraphNode[];
  affectedTests: GraphNode[];
  affectedDependencies: GraphNode[];

  relationships: GraphEdge[];
  evidence: ImpactEvidenceItem[];

  impactLevel: ImpactLevel;
  impactScore: number;
  confidence: ExplainableConfidence;

  categoryCounts: AffectedCategoryCounts;
  warnings: string[];
  summary: string;

  aiExplanation?: string;
  analyzedAt: string;
}

export interface ImpactAiExplanationResponse {
  nodeId: string;
  nodeLabel: string;
  operation: ImpactOperation;
  impactLevel: ImpactLevel;
  impactScore: number;
  confidence: ExplainableConfidence;

  summary: string;
  directImpactExplanation: string;
  indirectImpactExplanation: string;
  riskAssessment: string;
  recommendedMitigations: string[];

  groundedClaims: Array<{
    claim: string;
    classification: EvidenceClassification;
    evidenceIds: string[];
  }>;

  generatedAt: string;
  isAiFallback: boolean;
}
