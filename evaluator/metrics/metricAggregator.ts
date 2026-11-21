/**
 * EngiTrace EEID Evaluation Runner — Metric Aggregator
 *
 * Aggregates results overall, by category, and by repository.
 * Compares actual results against configurable pass thresholds.
 */

import {
  RecordEvaluationResult,
  AggregateMetrics,
  EvaluationConfig,
  EEIDCategory,
  CategoryMetricSummary,
  RepositoryMetricSummary
} from '../types';
import { MetricCalculator } from './metricCalculator';

export class MetricAggregator {
  /**
   * Builds complete AggregateMetrics breakdown from results.
   */
  static aggregate(
    runId: string,
    results: RecordEvaluationResult[],
    config: EvaluationConfig
  ): AggregateMetrics {
    const totalQuestions = results.length;
    const successfulQuestions = results.filter((r) => r.execution.success).length;
    const failedQuestions = totalQuestions - successfulQuestions;

    const genuineAiQuestions = results.filter((r) => r.execution.genuineAiResponse).length;
    const providerConfigurationRequiredQuestions = results.filter(
      (r) => r.execution.providerStatus === 'PROVIDER_CONFIGURATION_REQUIRED'
    ).length;

    let providerStatus: AggregateMetrics['providerStatus'] = 'CONFIGURED';
    if (providerConfigurationRequiredQuestions === totalQuestions && totalQuestions > 0) {
      providerStatus = 'PROVIDER_CONFIGURATION_REQUIRED';
    } else if (providerConfigurationRequiredQuestions > 0) {
      providerStatus = 'PARTIAL';
    }

    // 1. Overall Summary
    const overall = MetricCalculator.calculateSummary(results);

    // 2. Breakdown By Category
    const categories: EEIDCategory[] = [
      'NODE_UNDERSTANDING',
      'HISTORICAL_REASONING',
      'DEPENDENCY_INTELLIGENCE',
      'IMPACT_ANALYSIS',
      'REPOSITORY_CONVERSATION',
      'EVIDENCE_AND_UNCERTAINTY'
    ];

    const byCategory: Record<EEIDCategory, CategoryMetricSummary> = {} as any;
    categories.forEach((cat) => {
      const catResults = results.filter((r) => r.category === cat);
      const catSummary = MetricCalculator.calculateSummary(catResults);
      byCategory[cat] = {
        ...catSummary,
        category: cat,
        totalRecords: catResults.length,
        successfulRecords: catResults.filter((r) => r.execution.success).length
      };
    });

    // 3. Breakdown By Repository
    const byRepository: Record<string, RepositoryMetricSummary> = {};
    const repoGroups = new Map<string, RecordEvaluationResult[]>();

    results.forEach((r) => {
      const repoId = r.repositoryId;
      if (!repoGroups.has(repoId)) {
        repoGroups.set(repoId, []);
      }
      repoGroups.get(repoId)!.push(r);
    });

    repoGroups.forEach((repoResults, repoId) => {
      const repoSummary = MetricCalculator.calculateSummary(repoResults);
      byRepository[repoId] = {
        ...repoSummary,
        repositoryId: repoId,
        repositoryName: repoId,
        totalRecords: repoResults.length,
        successfulRecords: repoResults.filter((r) => r.execution.success).length
      };
    });

    // 4. Threshold Assessment
    if (totalQuestions === 0) {
      return {
        runId,
        totalQuestions: 0,
        successfulQuestions: 0,
        failedQuestions: 0,
        providerStatus,
        genuineAiQuestions: 0,
        providerConfigurationRequiredQuestions: 0,
        overall,
        byCategory,
        byRepository,
        thresholdResults: {
          passed: 'NOT_EVALUATED',
          providerConfigurationRequired: false,
          failingThresholds: []
        }
      };
    }

    const failingThresholds: AggregateMetrics['thresholdResults']['failingThresholds'] = [];
    const th = config.thresholds;

    if (typeof overall.executionSuccessRate === 'number' && overall.executionSuccessRate < th.minExecutionSuccessRate) {
      failingThresholds.push({
        metric: 'executionSuccessRate',
        expected: th.minExecutionSuccessRate,
        actual: overall.executionSuccessRate
      });
    }

    // Answer-quality thresholds are evaluated ONLY when genuine AI responses are generated.
    // Provider authentication failures are excluded from answer-quality scoring.
    if (providerStatus !== 'PROVIDER_CONFIGURATION_REQUIRED') {
      if (typeof overall.evidencePrecision === 'number' && overall.evidencePrecision < th.minEvidencePrecision) {
        failingThresholds.push({
          metric: 'evidencePrecision',
          expected: th.minEvidencePrecision,
          actual: overall.evidencePrecision
        });
      }

      if (typeof overall.evidenceRecall === 'number' && overall.evidenceRecall < th.minEvidenceRecall) {
        failingThresholds.push({
          metric: 'evidenceRecall',
          expected: th.minEvidenceRecall,
          actual: overall.evidenceRecall
        });
      }

      if (typeof overall.claimContradictionRate === 'number' && overall.claimContradictionRate > th.maxContradictionRate) {
        failingThresholds.push({
          metric: 'claimContradictionRate',
          expected: th.maxContradictionRate,
          actual: overall.claimContradictionRate
        });
      }

      if (typeof overall.unsupportedAssertionRate === 'number' && overall.unsupportedAssertionRate > th.maxUnsupportedAssertionRate) {
        failingThresholds.push({
          metric: 'unsupportedAssertionRate',
          expected: th.maxUnsupportedAssertionRate,
          actual: overall.unsupportedAssertionRate
        });
      }

      if (typeof overall.overallBenchmarkScore === 'number' && overall.overallBenchmarkScore < th.minOverallBenchmarkScore) {
        failingThresholds.push({
          metric: 'overallBenchmarkScore',
          expected: th.minOverallBenchmarkScore,
          actual: overall.overallBenchmarkScore
        });
      }
    }

    return {
      runId,
      totalQuestions,
      successfulQuestions,
      failedQuestions,
      providerStatus,
      genuineAiQuestions,
      providerConfigurationRequiredQuestions,
      overall,
      byCategory,
      byRepository,
      thresholdResults: {
        passed: failingThresholds.length === 0,
        providerConfigurationRequired: providerStatus === 'PROVIDER_CONFIGURATION_REQUIRED',
        failingThresholds
      }
    };
  }
}
