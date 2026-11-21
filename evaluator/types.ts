/**
 * EngiTrace EEID Evaluation Runner — Comprehensive Type Definitions
 *
 * Implements Task 4 architecture specifications:
 * - Gold dataset record schema & governance structures
 * - Assistant adapter request/response contracts
 * - Layer 1 Deterministic evaluation results (8 evaluation dimensions)
 * - Layer 2 Semantic evaluation results & LLM judge metadata
 * - Metric definitions & aggregations (handling NOT_AVAILABLE)
 * - Run manifest, failure analysis, and reporting structures
 */

import {
  EEIDRecordV2 as BaseEEIDRecordV2,
  EEIDClaimV2,
  SourceAnchor,
  WhatIfGroundTruthV2,
  EEIDCategory,
  ClaimClassification,
  ConfidenceTier,
  InteractionMode,
  Difficulty,
  AnnotationStatus,
  AnnotatorType,
  ProposalStatus,
  TemporalEvidenceRole
} from '../eeid/task3-remediation-proposal-v4.2.5/validator_v2/types';

export {
  BaseEEIDRecordV2,
  EEIDClaimV2,
  SourceAnchor,
  WhatIfGroundTruthV2,
  EEIDCategory,
  ClaimClassification,
  ConfidenceTier,
  InteractionMode,
  Difficulty,
  AnnotationStatus,
  AnnotatorType,
  ProposalStatus,
  TemporalEvidenceRole
};

// ============================================================================
// 1. Governance & Approval Types
// ============================================================================

export interface HumanReviewerSignoff {
  reviewerId: string;
  name: string;
  title: string;
  organization: string;
  decision: 'ACCEPT' | 'APPROVED' | 'REJECT' | 'CHANGES_REQUESTED';
  signedAt: string; // RFC3339 timestamp
  signatureEvidence: string; // Verifiable cryptographic signature hash or token
  tier6SemanticSignoff: boolean; // Explicit sign-off on Tier 6 semantic entailment
}

export interface DualHumanApprovalProvenance {
  approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  reviewers: HumanReviewerSignoff[]; // Exactly two independent human reviewers
  adjudicationNotes?: string;
  governanceVersion?: string;
  isTestFixture?: boolean;
  isSyntheticPrototype?: boolean;
}

export interface ApprovalVerifierOptions {
  allowTestFixtures?: boolean;
}

export interface EEIDRecordV2 extends BaseEEIDRecordV2 {
  approvalProvenance?: DualHumanApprovalProvenance;
  isTestFixture?: boolean;
}

export interface ApprovalVerificationResult {
  isApproved: boolean;
  status: AnnotationStatus;
  proposalStatus?: ProposalStatus;
  annotatorType: AnnotatorType;
  verifiedAt?: string;
  rejectionReason?: string;
  approvalProvenance?: DualHumanApprovalProvenance;
}

export interface DatasetLoadingResult {
  datasetPath: string;
  datasetSha256: string;
  totalRecordsInFile: number;
  approvedRecords: EEIDRecordV2[];
  rejectedRecords: Array<{
    recordId: string;
    lineNumber: number;
    reason: string;
    rawRecord?: unknown;
  }>;
}

// ============================================================================
// 2. Assistant Adapter Communication Types
// ============================================================================

export interface AssistantRequestPayload {
  nodeId: string;
  analysisType: 'WHY' | 'WHAT_IF';
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  nodeMetadata?: {
    name?: string;
    type?: string;
    filePath?: string;
    [key: string]: unknown;
  };
}

export interface AssistantClaim {
  text: string;
  classification: ClaimClassification;
  evidenceIds?: string[];
  reasoning?: string;
  sourceUrls?: string[];
}

export interface AssistantRawResponse {
  answer: string;
  claims: AssistantClaim[];
  suggestedFollowUps?: string[];
  provider?: string;
  model?: string;
  isFallback?: boolean;
  error?: string;
}

export interface QuestionExecutionResult {
  recordId: string;
  repositoryId: string;
  endpointUrl: string;
  requestPayload: AssistantRequestPayload;
  rawResponse?: AssistantRawResponse;
  httpStatus: number;
  latencyMs: number;
  attempts: number;
  executedAt: string;
  success: boolean;
  httpSuccess: boolean;
  providerStatus:
  | 'GENUINE_AI_RESPONSE'
  | 'PROVIDER_CONFIGURATION_REQUIRED'
  | 'LOCAL_FALLBACK'
  | 'PROVIDER_ERROR';
  genuineAiResponse: boolean;
  providerConfigured: boolean;
  providerError?: string;
  errorMessage?: string;
}

// ============================================================================
// 3. Evaluation Dimensions & Results
// ============================================================================

export interface EvidenceGroundingEvaluation {
  totalAssistantEvidenceIds: number;
  validEvidenceIds: string[];
  invalidEvidenceIds: string[];
  precision: number | 'NOT_AVAILABLE';
  totalExpectedEvidenceIds: number;
  expectedEvidenceIdsFound: string[];
  expectedEvidenceIdsMissing: string[];
  recall: number | 'NOT_AVAILABLE';
}

export interface CitationQualityEvaluation {
  totalCitations: number;
  resolvedCitations: number;
  unresolvedCitations: string[];
  resolutionRate: number | 'NOT_AVAILABLE';
  sourceAnchorValidity: number | 'NOT_AVAILABLE';
  relevanceScore: number | 'NOT_AVAILABLE';
}

export interface HistoricalReasoningEvaluation {
  respectsCutoff: boolean;
  postSnapshotViolations: string[];
  commitPrAttributionScore: number | 'NOT_AVAILABLE';
}

export interface DependencyIntelligenceEvaluation {
  directedCallEdgeAccuracy: number | 'NOT_AVAILABLE';
  ecosystemAccuracy: number | 'NOT_AVAILABLE';
  notes?: string;
}

export interface ImpactAnalysisEvaluation {
  directCallersExpectedCount: number;
  directCallersFoundCount: number;
  transitiveCallersExpectedCount: number;
  transitiveCallersFoundCount: number;
  directCallerRecall: number | 'NOT_AVAILABLE';
  transitiveCallerRecall: number | 'NOT_AVAILABLE';
  blastRadiusAlignment: 'EXACT' | 'CONSISTENT' | 'DIVERGENT' | 'NOT_APPLICABLE';
}

export interface UncertaintyHandlingEvaluation {
  expectedFactCount: number;
  expectedInferenceCount: number;
  expectedUnknownCount: number;
  observedFactCount: number;
  observedInferenceCount: number;
  observedUnknownCount: number;
  unsupportedFactsCount: number; // Facts with zero or invalid evidence IDs
  unsupportedAssertionRate: number;
  honestyScore: number | 'NOT_AVAILABLE';
}

export interface DeterministicEvaluationResult {
  recordId: string;
  category: EEIDCategory;
  repositoryId: string;
  executionSuccess: boolean;
  evidenceGrounding: EvidenceGroundingEvaluation;
  citationQuality: CitationQualityEvaluation;
  historicalReasoning: HistoricalReasoningEvaluation;
  dependencyIntelligence: DependencyIntelligenceEvaluation;
  impactAnalysis: ImpactAnalysisEvaluation;
  uncertaintyHandling: UncertaintyHandlingEvaluation;
  deterministicScore: number | 'NOT_AVAILABLE'; // 0 to 1 or NOT_AVAILABLE
  deterministicChecksPassed: boolean;
  checkDetails: Record<string, boolean>;
}

export interface SemanticClaimEvaluation {
  goldClaimId: string;
  goldClaimText: string;
  expectedClassification: ClaimClassification;
  status: 'SUPPORTED' | 'CONTRADICTED' | 'OMITTED' | 'PARTIALLY_SUPPORTED';
  similarityScore: number;
  rationale: string;
}

export interface SemanticEvaluationResult {
  recordId: string;
  enabled: boolean;
  method: 'LLM_JUDGE' | 'HEURISTIC' | 'SKIPPED';
  claimCoverage: number | 'NOT_AVAILABLE';
  contradictionRate: number | 'NOT_AVAILABLE';
  overallSemanticScore: number | 'NOT_AVAILABLE';
  claimEvaluations: SemanticClaimEvaluation[];
  judgeMetadata?: {
    evaluatorModel: string;
    evaluatorProvider: string;
    promptVersion: string;
    rawJudgeOutput?: string;
    temperature?: number;
  };
}

export interface RecordEvaluationResult {
  recordId: string;
  category: EEIDCategory;
  repositoryId: string;
  pinnedCommitSha: string;
  question: string;
  status: 'EVALUATED' | 'PROVIDER_CONFIGURATION_REQUIRED' | 'EXECUTION_FAILED';
  execution: QuestionExecutionResult;
  deterministic: DeterministicEvaluationResult;
  semantic: SemanticEvaluationResult;
  overallScore: number | 'NOT_AVAILABLE';
  passedOverall: boolean;
}

// ============================================================================
// 4. Metrics & Aggregations
// ============================================================================

export interface MetricSummary {
  executionSuccessRate: number | 'NOT_AVAILABLE';
  genuineAiResponseRate: number | 'NOT_AVAILABLE';
  providerConfigurationRequiredCount: number;
  answerCorrectness: number | 'NOT_AVAILABLE';
  claimCoverage: number | 'NOT_AVAILABLE';
  claimContradictionRate: number | 'NOT_AVAILABLE';
  evidencePrecision: number | 'NOT_AVAILABLE';
  evidenceRecall: number | 'NOT_AVAILABLE';
  citationResolutionRate: number | 'NOT_AVAILABLE';
  citationRelevance: number | 'NOT_AVAILABLE';
  sourceAnchorValidity: number | 'NOT_AVAILABLE';
  historicalReasoningScore: number | 'NOT_AVAILABLE';
  dependencyReasoningScore: number | 'NOT_AVAILABLE';
  impactAnalysisScore: number | 'NOT_AVAILABLE';
  uncertaintyClassificationScore: number | 'NOT_AVAILABLE';
  unsupportedAssertionRate: number | 'NOT_AVAILABLE';
  overallBenchmarkScore: number | 'NOT_AVAILABLE';
}

export interface CategoryMetricSummary extends MetricSummary {
  category: EEIDCategory;
  totalRecords: number;
  successfulRecords: number;
}

export interface RepositoryMetricSummary extends MetricSummary {
  repositoryId: string;
  repositoryName: string;
  totalRecords: number;
  successfulRecords: number;
}

export interface AggregateMetrics {
  runId: string;
  totalQuestions: number;
  successfulQuestions: number;
  failedQuestions: number;
  providerStatus: 'CONFIGURED' | 'PROVIDER_CONFIGURATION_REQUIRED' | 'PARTIAL';
  genuineAiQuestions: number;
  providerConfigurationRequiredQuestions: number;
  overall: MetricSummary;
  byCategory: Record<EEIDCategory, CategoryMetricSummary>;
  byRepository: Record<string, RepositoryMetricSummary>;
  thresholdResults: {
    passed: boolean | 'NOT_EVALUATED';
    providerConfigurationRequired?: boolean;
    failingThresholds: Array<{
      metric: string;
      expected: number | string;
      actual: number | string;
    }>;
  };
}

// ============================================================================
// 5. Run Configuration & Manifest
// ============================================================================

export interface EvaluationThresholds {
  minExecutionSuccessRate: number; // e.g. 0.95
  minEvidencePrecision: number;    // e.g. 0.80
  minEvidenceRecall: number;       // e.g. 0.70
  maxContradictionRate: number;    // e.g. 0.05
  maxUnsupportedAssertionRate: number; // e.g. 0.10
  minOverallBenchmarkScore: number;// e.g. 0.75
}

export interface EvaluationConfig {
  version: string;
  backendUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  evaluationMode: 'deterministic' | 'semantic' | 'full';
  semanticJudge: {
    enabled: boolean;
    provider: 'GEMINI' | 'LOCAL_HEURISTIC';
    model: string;
    promptVersion: string;
    temperature: number;
  };
  weights: {
    evidencePrecision: number;
    evidenceRecall: number;
    claimCoverage: number;
    uncertaintyHandling: number;
    citationResolution: number;
    correctness: number;
  };
  thresholds: EvaluationThresholds;
}

export interface RunManifest {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  goldDataset: {
    path: string;
    sha256: string;
    version: string;
    totalRecords: number;
    approvedRecords: number;
    rejectedRecords: number;
  };
  repositoriesEvaluated: Array<{
    repositoryId: string;
    name: string;
    commitSha: string;
    snapshotTimestamp: string;
  }>;
  engitraceApp: {
    backendUrl: string;
    gitRevision?: string;
    gitRepositoryAvailable?: boolean;
    sourceTreeSha256?: string;
    buildMetadata?: Record<string, unknown>;
    backendStatus?: string;
    backendVersion?: string;
  };
  runnerEnvironment: {
    nodeVersion: string;
    platform: string;
    runnerVersion: string;
  };
  evaluationMethod: {
    mode: 'deterministic' | 'semantic' | 'full';
    deterministicRulesVersion: string;
    semanticJudgeModel?: string;
    promptVersion?: string;
  };
  providerStatus: 'CONFIGURED' | 'PROVIDER_CONFIGURATION_REQUIRED' | 'PARTIAL';
  genuineAiQuestions: number;
  providerConfigurationRequiredQuestions: number;
  totalQuestions: number;
  successfulQuestions: number;
  failedQuestions: number;
  passedThresholds: boolean | 'NOT_EVALUATED';
  overallRunStatus?: string;
}

export interface FailureAnalysisEntry {
  recordId: string;
  category: EEIDCategory;
  repositoryId: string;
  question: string;
  failureType:
  | 'EXECUTION_HTTP_ERROR'
  | 'EXECUTION_TIMEOUT'
  | 'EXECUTION_NETWORK_ERROR'
  | 'PROVIDER_CONFIGURATION_REQUIRED'
  | 'UNSUPPORTED_ASSERTIONS'
  | 'HISTORICAL_CUTOFF_VIOLATION'
  | 'EVIDENCE_PRECISION_FAILURE'
  | 'EVIDENCE_RECALL_FAILURE'
  | 'CLAIM_CONTRADICTION'
  | 'UNKNOWN_FAILURE';
  errorDetails: string;
  rawResponsePreview?: string;
}

export interface FailureAnalysisReport {
  runId: string;
  totalFailures: number;
  failuresByType: Record<string, number>;
  entries: FailureAnalysisEntry[];
}
