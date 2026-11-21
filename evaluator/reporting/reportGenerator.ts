/**
 * EngiTrace EEID Evaluation Runner — Report Generator
 *
 * Persists all 9 mandatory evaluation run artifacts to disk:
 * 1. run_manifest.json
 * 2. per_record_results.jsonl
 * 3. raw_assistant_responses.jsonl
 * 4. deterministic_metrics.json
 * 5. semantic_evaluation.jsonl
 * 6. aggregate_metrics.json
 * 7. failure_analysis.json
 * 8. EEID_EVALUATION_REPORT.md
 * 9. SHA256SUMS.txt
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  RunManifest,
  AggregateMetrics,
  RecordEvaluationResult,
  FailureAnalysisReport,
  FailureAnalysisEntry
} from '../types';
import { MarkdownReportBuilder } from './markdownReportBuilder';

export interface ReportGeneratorOptions {
  outputBaseDir: string;
  reportFileName?: string;
}

export class ReportGenerator {
  private outputBaseDir: string;
  private reportFileName: string;

  constructor(options: ReportGeneratorOptions) {
    this.outputBaseDir = options.outputBaseDir;
    this.reportFileName = options.reportFileName || 'EEID_EVALUATION_REPORT.md';
  }

  /**
   * Writes all 9 evaluation artifacts and computes SHA256SUMS.txt
   */
  generateReports(
    manifest: RunManifest,
    aggregate: AggregateMetrics,
    results: RecordEvaluationResult[]
  ): { runDirectory: string; generatedFiles: string[] } {
    const runDirectory = path.resolve(this.outputBaseDir, manifest.runId);
    if (!fs.existsSync(runDirectory)) {
      fs.mkdirSync(runDirectory, { recursive: true });
    }

    const generatedFiles: string[] = [];

    // 1. Build failure analysis
    const failureReport = this.buildFailureReport(manifest.runId, results, manifest);

    // 2. per_record_results.jsonl
    const perRecordPath = path.join(runDirectory, 'per_record_results.jsonl');
    const perRecordContent = results
      .map((r) =>
        JSON.stringify({
          recordId: r.recordId,
          category: r.category,
          repositoryId: r.repositoryId,
          pinnedCommitSha: r.pinnedCommitSha,
          status: r.status,
          providerStatus: r.execution.providerStatus,
          overallScore: r.overallScore,
          passedOverall: r.passedOverall,
          executionSuccess: r.execution.success,
          latencyMs: r.execution.latencyMs,
          deterministicScore: r.deterministic.deterministicScore,
          semanticScore: r.semantic.overallSemanticScore,
          claimCoverage: r.semantic.claimCoverage,
          evidencePrecision: r.deterministic.evidenceGrounding.precision,
          evidenceRecall: r.deterministic.evidenceGrounding.recall,
          unsupportedAssertionRate: r.deterministic.uncertaintyHandling.unsupportedAssertionRate
        })
      )
      .join('\n');
    fs.writeFileSync(perRecordPath, perRecordContent + (perRecordContent ? '\n' : ''), 'utf8');
    generatedFiles.push('per_record_results.jsonl');

    // 3. raw_assistant_responses.jsonl
    const rawResponsesPath = path.join(runDirectory, 'raw_assistant_responses.jsonl');
    const rawResponsesContent = results
      .map((r) =>
        JSON.stringify({
          recordId: r.recordId,
          repositoryId: r.repositoryId,
          execution: r.execution
        })
      )
      .join('\n');
    fs.writeFileSync(rawResponsesPath, rawResponsesContent + (rawResponsesContent ? '\n' : ''), 'utf8');
    generatedFiles.push('raw_assistant_responses.jsonl');

    // 4. deterministic_metrics.json
    const deterministicPath = path.join(runDirectory, 'deterministic_metrics.json');
    const deterministicContent = JSON.stringify(
      {
        runId: manifest.runId,
        overall: {
          executionSuccessRate: aggregate.overall.executionSuccessRate,
          evidencePrecision: aggregate.overall.evidencePrecision,
          evidenceRecall: aggregate.overall.evidenceRecall,
          citationResolutionRate: aggregate.overall.citationResolutionRate,
          historicalReasoningScore: aggregate.overall.historicalReasoningScore,
          dependencyReasoningScore: aggregate.overall.dependencyReasoningScore,
          impactAnalysisScore: aggregate.overall.impactAnalysisScore,
          unsupportedAssertionRate: aggregate.overall.unsupportedAssertionRate
        },
        byCategory: Object.fromEntries(
          Object.entries(aggregate.byCategory).map(([cat, m]) => [
            cat,
            {
              totalRecords: m.totalRecords,
              executionSuccessRate: m.executionSuccessRate,
              evidencePrecision: m.evidencePrecision,
              evidenceRecall: m.evidenceRecall,
              unsupportedAssertionRate: m.unsupportedAssertionRate
            }
          ])
        ),
        perRecordCheckSummaries: results.map((r) => ({
          recordId: r.recordId,
          category: r.category,
          deterministicChecksPassed: r.deterministic.deterministicChecksPassed,
          checkDetails: r.deterministic.checkDetails,
          score: r.deterministic.deterministicScore
        }))
      },
      null,
      2
    );
    fs.writeFileSync(deterministicPath, deterministicContent, 'utf8');
    generatedFiles.push('deterministic_metrics.json');

    // 5. semantic_evaluation.jsonl
    const semanticPath = path.join(runDirectory, 'semantic_evaluation.jsonl');
    const semanticContent = results
      .map((r) =>
        JSON.stringify({
          recordId: r.recordId,
          category: r.category,
          semantic: r.semantic
        })
      )
      .join('\n');
    fs.writeFileSync(semanticPath, semanticContent + (semanticContent ? '\n' : ''), 'utf8');
    generatedFiles.push('semantic_evaluation.jsonl');

    // 6. aggregate_metrics.json
    const aggregatePath = path.join(runDirectory, 'aggregate_metrics.json');
    fs.writeFileSync(aggregatePath, JSON.stringify(aggregate, null, 2), 'utf8');
    generatedFiles.push('aggregate_metrics.json');

    // 7. failure_analysis.json
    const failurePath = path.join(runDirectory, 'failure_analysis.json');
    fs.writeFileSync(failurePath, JSON.stringify(failureReport, null, 2), 'utf8');
    generatedFiles.push('failure_analysis.json');

    // 8. Markdown report (EEID_BASELINE_EVALUATION_REPORT.md or EEID_EVALUATION_REPORT.md)
    const markdownReport = MarkdownReportBuilder.buildReport(
      manifest,
      aggregate,
      results,
      failureReport
    );
    const reportPath = path.join(runDirectory, this.reportFileName);
    fs.writeFileSync(reportPath, markdownReport, 'utf8');
    generatedFiles.push(this.reportFileName);

    // 1. run_manifest.json (written after manifest is finalized)
    const manifestPath = path.join(runDirectory, 'run_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    generatedFiles.unshift('run_manifest.json');

    // 9. SHA256SUMS.txt of all files in runDirectory except SHA256SUMS.txt
    const checksums: string[] = [];
    for (const fileName of generatedFiles) {
      const fullPath = path.join(runDirectory, fileName);
      const fileBuf = fs.readFileSync(fullPath);
      const hash = crypto.createHash('sha256').update(fileBuf).digest('hex');
      checksums.push(`${hash}  ${fileName}`);
    }

    const shaPath = path.join(runDirectory, 'SHA256SUMS.txt');
    fs.writeFileSync(shaPath, checksums.join('\n') + '\n', 'utf8');
    generatedFiles.push('SHA256SUMS.txt');

    return { runDirectory, generatedFiles };
  }

  private buildFailureReport(
    runId: string,
    results: RecordEvaluationResult[],
    manifest?: RunManifest
  ): FailureAnalysisReport {
    const entries: FailureAnalysisEntry[] = [];
    const failuresByType: Record<string, number> = {};

    if (manifest && manifest.goldDataset.approvedRecords === 0 && manifest.goldDataset.rejectedRecords > 0) {
      failuresByType['DATASET_GOVERNANCE_UNAPPROVED'] = manifest.goldDataset.rejectedRecords;
      entries.push({
        recordId: 'BLOCKER-DATASET-GOVERNANCE',
        category: 'GOVERNANCE_APPROVAL_VERIFICATION',
        repositoryId: 'ALL_REPOSITORIES',
        question: 'Dataset Human Expert Sign-off Verification',
        failureType: 'OTHER',
        errorDetails: `Zero approved records available for evaluation. All ${manifest.goldDataset.rejectedRecords} candidate records in "${manifest.goldDataset.path}" were rejected due to DRAFT / PENDING_HUMAN_REVIEW status or missing dual human expert sign-off.`
      });
    }

    results.forEach((r) => {
      if (!r.execution.success) {
        let failureType: FailureAnalysisEntry['failureType'] = 'EXECUTION_HTTP_ERROR';
        if (r.execution.errorMessage?.includes('timed out')) {
          failureType = 'EXECUTION_TIMEOUT';
        } else if (r.execution.errorMessage?.includes('fetch failed')) {
          failureType = 'EXECUTION_NETWORK_ERROR';
        }

        failuresByType[failureType] = (failuresByType[failureType] || 0) + 1;
        entries.push({
          recordId: r.recordId,
          category: r.category,
          repositoryId: r.repositoryId,
          question: r.question,
          failureType,
          errorDetails: r.execution.errorMessage || 'Execution failed'
        });
        return;
      }

      // If provider configuration is required, skip answer-quality failure checks
      if (r.execution.providerStatus === 'PROVIDER_CONFIGURATION_REQUIRED') {
        return;
      }

      // Check temporal violations
      if (!r.deterministic.historicalReasoning.respectsCutoff) {
        const failureType = 'HISTORICAL_CUTOFF_VIOLATION';
        failuresByType[failureType] = (failuresByType[failureType] || 0) + 1;
        entries.push({
          recordId: r.recordId,
          category: r.category,
          repositoryId: r.repositoryId,
          question: r.question,
          failureType,
          errorDetails: r.deterministic.historicalReasoning.postSnapshotViolations.join('; '),
          rawResponsePreview: r.execution.rawResponse?.answer.substring(0, 200)
        });
      }

      // Check unsupported assertions
      if (r.deterministic.uncertaintyHandling.unsupportedAssertionRate > 0.20) {
        const failureType = 'UNSUPPORTED_ASSERTIONS';
        failuresByType[failureType] = (failuresByType[failureType] || 0) + 1;
        entries.push({
          recordId: r.recordId,
          category: r.category,
          repositoryId: r.repositoryId,
          question: r.question,
          failureType,
          errorDetails: `${(r.deterministic.uncertaintyHandling.unsupportedAssertionRate * 100).toFixed(1)}% unsupported FACT assertions without evidence IDs.`,
          rawResponsePreview: r.execution.rawResponse?.answer.substring(0, 200)
        });
      }

      // Check contradictions
      if (
        typeof r.semantic.contradictionRate === 'number' &&
        r.semantic.contradictionRate > 0.10
      ) {
        const failureType = 'CLAIM_CONTRADICTION';
        failuresByType[failureType] = (failuresByType[failureType] || 0) + 1;
        const contradicted = r.semantic.claimEvaluations
          .filter((c) => c.status === 'CONTRADICTED')
          .map((c) => c.goldClaimText)
          .join('; ');
        entries.push({
          recordId: r.recordId,
          category: r.category,
          repositoryId: r.repositoryId,
          question: r.question,
          failureType,
          errorDetails: `Assistant answer contradicted gold claims: ${contradicted}`,
          rawResponsePreview: r.execution.rawResponse?.answer.substring(0, 200)
        });
      }
    });

    return {
      runId,
      totalFailures: entries.length,
      failuresByType,
      entries
    };
  }
}
