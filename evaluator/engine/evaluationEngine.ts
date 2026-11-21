/**
 * EngiTrace EEID Evaluation Runner — Evaluation Engine Orchestrator
 *
 * Coordinates Layer 1 (Deterministic) and Layer 2 (Semantic) evaluation.
 * Combines metrics using configurable weights and thresholds without hiding
 * individual scores.
 */

import {
  EEIDRecordV2,
  QuestionExecutionResult,
  RecordEvaluationResult,
  EvaluationConfig
} from '../types';
import { DeterministicEvaluator, DeterministicEvaluatorOptions } from './deterministicEvaluator';
import { SemanticEvaluator, SemanticEvaluatorOptions } from './semanticEvaluator';

export interface EvaluationEngineOptions {
  config: EvaluationConfig;
  deterministicOptions?: DeterministicEvaluatorOptions;
  semanticOptions?: Partial<SemanticEvaluatorOptions>;
}

export class EvaluationEngine {
  private config: EvaluationConfig;
  private deterministicEvaluator: DeterministicEvaluator;
  private semanticEvaluator: SemanticEvaluator;

  constructor(options: EvaluationEngineOptions) {
    this.config = options.config;
    this.deterministicEvaluator = new DeterministicEvaluator(options.deterministicOptions);
    this.semanticEvaluator = new SemanticEvaluator({
      config: this.config,
      customJudgeFn: options.semanticOptions?.customJudgeFn
    });
  }

  /**
   * Evaluates a single record execution result across both deterministic and semantic layers.
   */
  async evaluateRecord(
    record: EEIDRecordV2,
    execution: QuestionExecutionResult
  ): Promise<RecordEvaluationResult> {
    // 1. Layer 1: Deterministic Evaluation
    const deterministic = this.deterministicEvaluator.evaluate(record, execution);

    // 2. Layer 2: Semantic Evaluation
    const semantic = await this.semanticEvaluator.evaluate(record, execution);

    // 3. Compute Weighted Overall Score
    const overallScore = execution.providerStatus === 'PROVIDER_CONFIGURATION_REQUIRED'
      ? 'NOT_AVAILABLE'
      : this.computeOverallScore(deterministic, semantic);

    // 4. Determine Pass/Fail against thresholds
    const passedOverall = this.evaluatePassFail(execution, deterministic, semantic, overallScore);

    // 5. Determine Record Status
    let status: RecordEvaluationResult['status'] = 'EVALUATED';
    if (execution.providerStatus === 'PROVIDER_CONFIGURATION_REQUIRED') {
      status = 'PROVIDER_CONFIGURATION_REQUIRED';
    } else if (!execution.success) {
      status = 'EXECUTION_FAILED';
    }

    return {
      recordId: record.recordId,
      category: record.category,
      repositoryId: record.repository.id,
      pinnedCommitSha: record.repository.commitSha,
      question: record.question,
      status,
      execution,
      deterministic,
      semantic,
      overallScore,
      passedOverall
    };
  }

  /**
   * Computes normalized overall score across available dimensions.
   */
  private computeOverallScore(
    deterministic: RecordEvaluationResult['deterministic'],
    semantic: RecordEvaluationResult['semantic']
  ): number | 'NOT_AVAILABLE' {
    if (!deterministic.executionSuccess) {
      return 0.0;
    }

    if (deterministic.deterministicScore === 'NOT_AVAILABLE' && semantic.overallSemanticScore === 'NOT_AVAILABLE') {
      return 'NOT_AVAILABLE';
    }

    const weights = this.config.weights;
    let weightSum = 0;
    let weightedScoreAcc = 0;

    // Dimension: Evidence Precision
    if (typeof deterministic.evidenceGrounding.precision === 'number') {
      weightedScoreAcc += deterministic.evidenceGrounding.precision * weights.evidencePrecision;
      weightSum += weights.evidencePrecision;
    }

    // Dimension: Evidence Recall
    if (typeof deterministic.evidenceGrounding.recall === 'number') {
      weightedScoreAcc += deterministic.evidenceGrounding.recall * weights.evidenceRecall;
      weightSum += weights.evidenceRecall;
    }

    // Dimension: Uncertainty Handling
    if (typeof deterministic.uncertaintyHandling.unsupportedAssertionRate === 'number') {
      const uncertaintyScore = 1.0 - deterministic.uncertaintyHandling.unsupportedAssertionRate;
      weightedScoreAcc += uncertaintyScore * weights.uncertaintyHandling;
      weightSum += weights.uncertaintyHandling;
    }

    // Dimension: Citation Resolution
    if (typeof deterministic.citationQuality.resolutionRate === 'number') {
      weightedScoreAcc += deterministic.citationQuality.resolutionRate * weights.citationResolution;
      weightSum += weights.citationResolution;
    }

    // Dimension: Semantic Claim Coverage
    if (typeof semantic.claimCoverage === 'number') {
      weightedScoreAcc += semantic.claimCoverage * weights.claimCoverage;
      weightSum += weights.claimCoverage;
    }

    // Dimension: Semantic Overall Score / Correctness
    if (typeof semantic.overallSemanticScore === 'number') {
      weightedScoreAcc += semantic.overallSemanticScore * weights.correctness;
      weightSum += weights.correctness;
    }

    if (weightSum === 0) {
      return 'NOT_AVAILABLE';
    }

    return Number((weightedScoreAcc / weightSum).toFixed(4));
  }

  /**
   * Assesses record pass/fail status against strict thresholds.
   */
  private evaluatePassFail(
    execution: QuestionExecutionResult,
    deterministic: RecordEvaluationResult['deterministic'],
    semantic: RecordEvaluationResult['semantic'],
    overallScore: number | 'NOT_AVAILABLE'
  ): boolean {
    if (execution.providerStatus === 'PROVIDER_CONFIGURATION_REQUIRED') {
      return execution.httpSuccess;
    }

    if (!execution.success) return false;
    if (!deterministic.historicalReasoning.respectsCutoff) return false;

    // Check contradiction rate
    if (
      typeof semantic.contradictionRate === 'number' &&
      semantic.contradictionRate > this.config.thresholds.maxContradictionRate
    ) {
      return false;
    }

    // Check unsupported assertions
    if (
      deterministic.uncertaintyHandling.unsupportedAssertionRate >
      this.config.thresholds.maxUnsupportedAssertionRate
    ) {
      return false;
    }

    // Check overall threshold if score available
    if (
      typeof overallScore === 'number' &&
      overallScore < this.config.thresholds.minOverallBenchmarkScore
    ) {
      return false;
    }

    return true;
  }
}
