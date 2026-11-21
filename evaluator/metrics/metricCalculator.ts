/**
 * EngiTrace EEID Evaluation Runner — Metric Calculator
 *
 * Implements deterministic formulas for evaluation metrics:
 * - Handles 'NOT_AVAILABLE' gracefully
 * - Computes numerical averages strictly over available datapoints
 */

import { RecordEvaluationResult, MetricSummary } from '../types';

export class MetricCalculator {
  /**
   * Calculates aggregated MetricSummary from an array of record results.
   */
  static calculateSummary(results: RecordEvaluationResult[]): MetricSummary {
    if (results.length === 0) {
      return {
        executionSuccessRate: 'NOT_AVAILABLE',
        genuineAiResponseRate: 'NOT_AVAILABLE',
        providerConfigurationRequiredCount: 0,
        answerCorrectness: 'NOT_AVAILABLE',
        claimCoverage: 'NOT_AVAILABLE',
        claimContradictionRate: 'NOT_AVAILABLE',
        evidencePrecision: 'NOT_AVAILABLE',
        evidenceRecall: 'NOT_AVAILABLE',
        citationResolutionRate: 'NOT_AVAILABLE',
        citationRelevance: 'NOT_AVAILABLE',
        sourceAnchorValidity: 'NOT_AVAILABLE',
        historicalReasoningScore: 'NOT_AVAILABLE',
        dependencyReasoningScore: 'NOT_AVAILABLE',
        impactAnalysisScore: 'NOT_AVAILABLE',
        uncertaintyClassificationScore: 'NOT_AVAILABLE',
        unsupportedAssertionRate: 'NOT_AVAILABLE',
        overallBenchmarkScore: 'NOT_AVAILABLE'
      };
    }

    const total = results.length;
    const successes = results.filter((r) => r.execution.success).length;
    const executionSuccessRate = Number((successes / total).toFixed(4));

    const genuineAiCount = results.filter((r) => r.execution.genuineAiResponse).length;
    const providerConfigReqCount = results.filter((r) => r.execution.providerStatus === 'PROVIDER_CONFIGURATION_REQUIRED').length;
    const genuineAiResponseRate = Number((genuineAiCount / total).toFixed(4));

    // Numerical collectors
    const answerCorrectnessVals = this.extractNumbers(results.map((r) => r.semantic.overallSemanticScore));
    const claimCoverageVals = this.extractNumbers(results.map((r) => r.semantic.claimCoverage));
    const contradictionVals = this.extractNumbers(results.map((r) => r.semantic.contradictionRate));

    const evidencePrecisionVals = this.extractNumbers(results.map((r) => r.deterministic.evidenceGrounding.precision));
    const evidenceRecallVals = this.extractNumbers(results.map((r) => r.deterministic.evidenceGrounding.recall));

    const citationResolutionVals = this.extractNumbers(results.map((r) => r.deterministic.citationQuality.resolutionRate));
    const citationRelevanceVals = this.extractNumbers(results.map((r) => r.deterministic.citationQuality.relevanceScore));
    const sourceAnchorVals = this.extractNumbers(results.map((r) => r.deterministic.citationQuality.sourceAnchorValidity));

    const historicalReasoningVals = this.extractNumbers(results.map((r) => r.deterministic.historicalReasoning.commitPrAttributionScore));
    const dependencyReasoningVals = this.extractNumbers(results.map((r) => r.deterministic.dependencyIntelligence.directedCallEdgeAccuracy));

    const impactAnalysisVals = this.extractNumbers(
      results
        .filter((r) => r.category === 'IMPACT_ANALYSIS')
        .map((r) => r.deterministic.impactAnalysis.directCallerRecall)
    );

    const uncertaintyClassificationVals = this.extractNumbers(results.map((r) => r.deterministic.uncertaintyHandling.honestyScore));
    const unsupportedAssertionVals = this.extractNumbers(results.map((r) => r.deterministic.uncertaintyHandling.unsupportedAssertionRate));

    const overallScoreVals = this.extractNumbers(results.map((r) => r.overallScore));

    return {
      executionSuccessRate,
      genuineAiResponseRate,
      providerConfigurationRequiredCount: providerConfigReqCount,
      answerCorrectness: this.averageOrNotAvailable(answerCorrectnessVals),
      claimCoverage: this.averageOrNotAvailable(claimCoverageVals),
      claimContradictionRate: this.averageOrNotAvailable(contradictionVals),
      evidencePrecision: this.averageOrNotAvailable(evidencePrecisionVals),
      evidenceRecall: this.averageOrNotAvailable(evidenceRecallVals),
      citationResolutionRate: this.averageOrNotAvailable(citationResolutionVals),
      citationRelevance: this.averageOrNotAvailable(citationRelevanceVals),
      sourceAnchorValidity: this.averageOrNotAvailable(sourceAnchorVals),
      historicalReasoningScore: this.averageOrNotAvailable(historicalReasoningVals),
      dependencyReasoningScore: this.averageOrNotAvailable(dependencyReasoningVals),
      impactAnalysisScore: this.averageOrNotAvailable(impactAnalysisVals),
      uncertaintyClassificationScore: this.averageOrNotAvailable(uncertaintyClassificationVals),
      unsupportedAssertionRate: unsupportedAssertionVals.length > 0 ? Number((unsupportedAssertionVals.reduce((a, b) => a + b, 0) / unsupportedAssertionVals.length).toFixed(4)) : 'NOT_AVAILABLE',
      overallBenchmarkScore: this.averageOrNotAvailable(overallScoreVals)
    };
  }

  private static extractNumbers(items: (number | string | undefined | null)[]): number[] {
    return items.filter((x): x is number => typeof x === 'number' && !isNaN(x));
  }

  private static averageOrNotAvailable(values: number[]): number | 'NOT_AVAILABLE' {
    if (values.length === 0) return 'NOT_AVAILABLE';
    const sum = values.reduce((acc, curr) => acc + curr, 0);
    return Number((sum / values.length).toFixed(4));
  }
}
