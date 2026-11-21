import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MetricCalculator } from '../metrics/metricCalculator';
import { MetricAggregator } from '../metrics/metricAggregator';
import { DEFAULT_EVALUATION_CONFIG } from '../config/defaultEvaluationConfig';
import { MarkdownReportBuilder } from '../reporting/markdownReportBuilder';
import { RunManifest, AggregateMetrics, RecordEvaluationResult, FailureAnalysisReport } from '../types';

describe('Zero-Denominator Metrics & Readiness Semantics', () => {
  it('MetricCalculator returns NOT_AVAILABLE for all metrics when results array is empty', () => {
    const summary = MetricCalculator.calculateSummary([]);

    assert.equal(summary.executionSuccessRate, 'NOT_AVAILABLE');
    assert.equal(summary.unsupportedAssertionRate, 'NOT_AVAILABLE');
    assert.equal(summary.answerCorrectness, 'NOT_AVAILABLE');
    assert.equal(summary.claimCoverage, 'NOT_AVAILABLE');
    assert.equal(summary.claimContradictionRate, 'NOT_AVAILABLE');
    assert.equal(summary.evidencePrecision, 'NOT_AVAILABLE');
    assert.equal(summary.evidenceRecall, 'NOT_AVAILABLE');
    assert.equal(summary.citationResolutionRate, 'NOT_AVAILABLE');
    assert.equal(summary.citationRelevance, 'NOT_AVAILABLE');
    assert.equal(summary.sourceAnchorValidity, 'NOT_AVAILABLE');
    assert.equal(summary.historicalReasoningScore, 'NOT_AVAILABLE');
    assert.equal(summary.dependencyReasoningScore, 'NOT_AVAILABLE');
    assert.equal(summary.impactAnalysisScore, 'NOT_AVAILABLE');
    assert.equal(summary.uncertaintyClassificationScore, 'NOT_AVAILABLE');
    assert.equal(summary.overallBenchmarkScore, 'NOT_AVAILABLE');
    assert.equal(summary.genuineAiResponseRate, 'NOT_AVAILABLE');
    assert.equal(summary.providerConfigurationRequiredCount, 0);
  });

  it('MetricAggregator sets thresholdResults.passed to NOT_EVALUATED and fails zero thresholds on empty results', () => {
    const aggregate = MetricAggregator.aggregate('test-run-empty', [], DEFAULT_EVALUATION_CONFIG);

    assert.equal(aggregate.totalQuestions, 0);
    assert.equal(aggregate.successfulQuestions, 0);
    assert.equal(aggregate.failedQuestions, 0);
    assert.equal(aggregate.thresholdResults.passed, 'NOT_EVALUATED');
    assert.equal(aggregate.thresholdResults.failingThresholds.length, 0);
    assert.equal(aggregate.overall.executionSuccessRate, 'NOT_AVAILABLE');
    assert.equal(aggregate.overall.unsupportedAssertionRate, 'NOT_AVAILABLE');
  });

  it('MarkdownReportBuilder formats zero-execution runs as BLOCKED / NOT_EVALUATED', () => {
    const manifest: RunManifest = {
      runId: 'eval-zero-exec-audit',
      startedAt: '2026-11-21T12:00:00Z',
      completedAt: '2026-11-21T12:00:01Z',
      durationMs: 1000,
      goldDataset: {
        path: './eeid/task3-remediation-proposal-v4.2.5/RECORD_PATCHES_V4_2_5.jsonl',
        sha256: 'abc123def456',
        version: 'v4.2.5',
        totalRecords: 5,
        approvedRecords: 0,
        rejectedRecords: 5
      },
      repositoriesEvaluated: [],
      engitraceApp: {
        backendUrl: 'http://localhost:4000',
        gitRepositoryAvailable: false,
        sourceTreeSha256: '1234567890abcdef',
        backendStatus: 'ONLINE',
        backendVersion: '0.6.0'
      },
      runnerEnvironment: {
        nodeVersion: 'v20.19.4',
        platform: 'win32 x64',
        runnerVersion: '1.0.0'
      },
      evaluationMethod: {
        mode: 'deterministic',
        deterministicRulesVersion: 'v4.2.5'
      },
      providerStatus: 'CONFIGURED',
      genuineAiQuestions: 0,
      providerConfigurationRequiredQuestions: 0,
      totalQuestions: 0,
      successfulQuestions: 0,
      failedQuestions: 0,
      passedThresholds: 'NOT_EVALUATED',
      overallRunStatus: 'BLOCKED / NOT_EVALUATED'
    };

    const aggregate: AggregateMetrics = MetricAggregator.aggregate('eval-zero-exec-audit', [], DEFAULT_EVALUATION_CONFIG);
    const failureReport: FailureAnalysisReport = {
      runId: 'eval-zero-exec-audit',
      totalFailures: 0,
      failuresByType: {},
      entries: []
    };

    const markdown = MarkdownReportBuilder.buildReport(manifest, aggregate, [], failureReport);

    // Verify status line
    assert.match(markdown, /\*\*Status:\*\* BLOCKED \/ NOT_EVALUATED/);
    assert.match(markdown, /Pre-Evaluation Readiness Blocker/);

    // Verify table does not report NaN% or 0.0% for empty metrics
    assert.match(markdown, /\| \*\*Execution Success Rate\*\* \| NOT_AVAILABLE \| >= 95\.0% \| NOT_EVALUATED \|/);
    assert.match(markdown, /\| \*\*Unsupported Assertion Rate\*\* \| NOT_AVAILABLE \| <= 15\.0% \| NOT_EVALUATED \|/);
    assert.match(markdown, /\| \*\*Evidence Precision\*\* \| NOT_AVAILABLE \| >= 70\.0% \| NOT_EVALUATED \|/);
    assert.match(markdown, /\| \*\*Overall Composite Benchmark Score\*\* \| NOT_AVAILABLE \| >= 70\.0% \| NOT_EVALUATED \|/);

    // Verify source tree sha256 is present
    assert.match(markdown, /1234567890abcdef/);
  });
});
