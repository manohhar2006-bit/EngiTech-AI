/**
 * EngiTrace EEID Evaluation Runner — Public API & Pipeline Orchestrator
 *
 * Implements the full pipeline:
 * Gold Dataset → Dataset Validation → Question Execution → Response Capture → Evaluation → Metrics → Reports
 */

import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  EEIDRecordV2,
  EvaluationConfig,
  RunManifest,
  AggregateMetrics,
  RecordEvaluationResult,
  DatasetLoadingResult
} from './types';
import { DEFAULT_EVALUATION_CONFIG } from './config/defaultEvaluationConfig';
import { GoldDatasetLoader, GoldDatasetLoaderOptions } from './dataset/goldDatasetLoader';
import { AssistantAdapter, AssistantAdapterOptions } from './adapter/assistantAdapter';
import { EvaluationEngine, EvaluationEngineOptions } from './engine/evaluationEngine';
import { MetricAggregator } from './metrics/metricAggregator';
import { ReportGenerator } from './reporting/reportGenerator';
import { HardenedRepositoryIndexStore } from '../eeid/task3-remediation-proposal-v4.2.5/validator_v2/index_store';

export * from './types';
export * from './config/defaultEvaluationConfig';
export * from './dataset/approvalVerifier';
export * from './dataset/goldDatasetLoader';
export * from './adapter/sessionManager';
export * from './adapter/assistantAdapter';
export * from './engine/deterministicEvaluator';
export * from './engine/semanticEvaluator';
export * from './engine/evaluationEngine';
export * from './metrics/metricCalculator';
export * from './metrics/metricAggregator';
export * from './reporting/markdownReportBuilder';
export * from './reporting/reportGenerator';

export interface EvaluationRunnerOptions {
  datasetPath: string;
  backendUrl?: string;
  outputDir?: string;
  indexDirectory?: string;
  config?: Partial<EvaluationConfig>;
  runId?: string;
  filterRepositoryId?: string;
  filterCategory?: string;
  limit?: number;
  allowTestFixtures?: boolean;
  reportFileName?: string;
  fetchFn?: typeof fetch;
  customJudgeFn?: EvaluationEngineOptions['semanticOptions'] extends { customJudgeFn?: infer F } ? F : never;
  onProgress?: (progress: { current: number; total: number; recordId: string; status: string }) => void;
}

export interface EvaluationRunSummary {
  runId: string;
  runDirectory: string;
  manifest: RunManifest;
  aggregate: AggregateMetrics;
  results: RecordEvaluationResult[];
  loadingResult: DatasetLoadingResult;
  generatedFiles: string[];
}

export class EvaluationRunner {
  private options: EvaluationRunnerOptions;
  private config: EvaluationConfig;

  constructor(options: EvaluationRunnerOptions) {
    this.options = options;
    this.config = {
      ...DEFAULT_EVALUATION_CONFIG,
      ...(options.config || {}),
      backendUrl: options.backendUrl || options.config?.backendUrl || DEFAULT_EVALUATION_CONFIG.backendUrl,
      thresholds: {
        ...DEFAULT_EVALUATION_CONFIG.thresholds,
        ...(options.config?.thresholds || {})
      },
      weights: {
        ...DEFAULT_EVALUATION_CONFIG.weights,
        ...(options.config?.weights || {})
      },
      semanticJudge: {
        ...DEFAULT_EVALUATION_CONFIG.semanticJudge,
        ...(options.config?.semanticJudge || {})
      }
    };
  }

  /**
   * Generates a unique, sortable run ID.
   */
  static generateRunId(): string {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const suffix = crypto.randomBytes(3).toString('hex');
    return `eval-${dateStr}-${suffix}`;
  }

  /**
   * Retrieves Git revision of host application if in a git repo.
   */
  static getAppGitRevision(): string | undefined {
    try {
      return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 })
        .toString()
        .trim();
    } catch {
      return undefined;
    }
  }

  /**
   * Computes a deterministic SHA-256 hash across the codebase source-tree
   * to guarantee baseline reproducibility when Git repository is unavailable.
   */
  static computeSourceTreeSha256(rootDir: string = process.cwd()): string {
    const hash = crypto.createHash('sha256');
    const relativePathsToInclude = [
      'package.json',
      'backend/package.json',
      'analyzer/package.json',
      'graph-engine/package.json',
      'ai-engine/package.json',
      'evaluator/package.json'
    ];

    for (const rel of relativePathsToInclude) {
      const full = path.join(rootDir, rel);
      if (fs.existsSync(full)) {
        hash.update(rel + '\0' + fs.readFileSync(full, 'utf8') + '\0');
      }
    }

    const sourceDirs = ['backend/src', 'evaluator', 'ai-engine', 'graph-engine', 'analyzer'];
    const collectedFiles: string[] = [];

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
            walk(fullPath);
          }
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.json') || entry.name.endsWith('.js'))) {
          collectedFiles.push(fullPath);
        }
      }
    };

    for (const srcDir of sourceDirs) {
      walk(path.join(rootDir, srcDir));
    }

    collectedFiles.sort();
    for (const file of collectedFiles) {
      const rel = path.relative(rootDir, file).replace(/\\/g, '/');
      try {
        const content = fs.readFileSync(file);
        hash.update(rel + '\0');
        hash.update(content);
        hash.update('\0');
      } catch {
        // Skip unreadable files
      }
    }

    return hash.digest('hex');
  }

  /**
   * Executes the full evaluation pipeline.
   */
  async run(): Promise<EvaluationRunSummary> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const runId = this.options.runId || EvaluationRunner.generateRunId();
    const outputDir = this.options.outputDir || './evaluation_runs';

    // Step 1: Health check against EngiTrace backend
    const adapter = new AssistantAdapter({
      backendUrl: this.config.backendUrl,
      timeoutMs: this.config.requestTimeoutMs,
      maxRetries: this.config.maxRetries,
      retryDelayMs: this.config.retryDelayMs,
      fetchFn: this.options.fetchFn
    });

    const health = await adapter.checkBackendHealth();

    // Step 2: Load Gold Dataset & Enforce Governance
    const loadingResult = GoldDatasetLoader.loadDataset({
      datasetPath: this.options.datasetPath,
      indexDirectory: this.options.indexDirectory,
      filterRepositoryId: this.options.filterRepositoryId,
      filterCategory: this.options.filterCategory,
      limit: this.options.limit,
      allowTestFixtures: this.options.allowTestFixtures ?? false
    });

    // Step 3: Setup Index Store & Evaluation Engine
    let indexStore: HardenedRepositoryIndexStore | undefined;
    if (this.options.indexDirectory) {
      indexStore = new HardenedRepositoryIndexStore(this.options.indexDirectory);
    }

    const engine = new EvaluationEngine({
      config: this.config,
      deterministicOptions: { indexStore },
      semanticOptions: { customJudgeFn: this.options.customJudgeFn }
    });

    // Step 4: Execute Questions Independently & Evaluate
    const results: RecordEvaluationResult[] = [];
    const totalRecords = loadingResult.approvedRecords.length;

    for (let i = 0; i < totalRecords; i++) {
      const record = loadingResult.approvedRecords[i];
      if (this.options.onProgress) {
        this.options.onProgress({
          current: i + 1,
          total: totalRecords,
          recordId: record.recordId,
          status: 'EXECUTING'
        });
      }

      // Execute question against real assistant adapter
      const execution = await adapter.executeQuestion(record);

      if (this.options.onProgress) {
        this.options.onProgress({
          current: i + 1,
          total: totalRecords,
          recordId: record.recordId,
          status: execution.success ? 'EVALUATING' : 'EXECUTION_FAILED'
        });
      }

      // Evaluate response
      const evalResult = await engine.evaluateRecord(record, execution);
      results.push(evalResult);
    }

    // Step 5: Aggregate Metrics
    const aggregate = MetricAggregator.aggregate(runId, results, this.config);

    // Step 6: Assemble Run Manifest
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const repositoryMap = new Map<string, { id: string; name: string; commitSha: string; snapshotTimestamp: string }>();
    loadingResult.approvedRecords.forEach((r) => {
      if (!repositoryMap.has(r.repository.id)) {
        repositoryMap.set(r.repository.id, {
          repositoryId: r.repository.id,
          name: r.repository.name,
          commitSha: r.repository.commitSha,
          snapshotTimestamp: r.repository.snapshotTimestamp
        });
      }
    });

    const gitRev = EvaluationRunner.getAppGitRevision();
    const sourceTreeSha256 = EvaluationRunner.computeSourceTreeSha256();

    const manifest: RunManifest = {
      runId,
      startedAt,
      completedAt,
      durationMs,
      goldDataset: {
        path: loadingResult.datasetPath,
        sha256: loadingResult.datasetSha256,
        version: 'v4.2.5',
        totalRecords: loadingResult.totalRecordsInFile,
        approvedRecords: loadingResult.approvedRecords.length,
        rejectedRecords: loadingResult.rejectedRecords.length
      },
      repositoriesEvaluated: Array.from(repositoryMap.values()),
      engitraceApp: {
        backendUrl: this.config.backendUrl,
        gitRevision: gitRev,
        gitRepositoryAvailable: Boolean(gitRev),
        sourceTreeSha256,
        buildMetadata: {
          nodeVersion: process.version,
          platform: `${os.platform()} ${os.arch()}`,
          timestamp: new Date().toISOString(),
          appVersion: health.details?.version || '0.6.0'
        },
        backendStatus: health.online ? 'ONLINE' : `OFFLINE (${health.error || 'UNREACHABLE'})`,
        backendVersion: health.details?.version || '0.6.0'
      },
      runnerEnvironment: {
        nodeVersion: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        runnerVersion: '1.0.0'
      },
      evaluationMethod: {
        mode: this.config.evaluationMode,
        deterministicRulesVersion: 'v4.2.5',
        semanticJudgeModel: this.config.semanticJudge.enabled ? this.config.semanticJudge.model : undefined,
        promptVersion: this.config.semanticJudge.enabled ? this.config.semanticJudge.promptVersion : undefined
      },
      providerStatus: aggregate.providerStatus,
      genuineAiQuestions: aggregate.genuineAiQuestions,
      providerConfigurationRequiredQuestions: aggregate.providerConfigurationRequiredQuestions,
      totalQuestions: totalRecords,
      successfulQuestions: aggregate.successfulQuestions,
      failedQuestions: aggregate.failedQuestions,
      passedThresholds: aggregate.thresholdResults.passed,
      overallRunStatus: totalRecords === 0 ? 'BLOCKED / NOT_EVALUATED' : (aggregate.thresholdResults.passed ? 'PASSED' : 'FAILED')
    };

    // Step 7: Generate All 9 Artifacts
    const reporter = new ReportGenerator({
      outputBaseDir: outputDir,
      reportFileName: this.options.reportFileName || 'EEID_BASELINE_EVALUATION_REPORT.md'
    });
    const { runDirectory, generatedFiles } = reporter.generateReports(manifest, aggregate, results);

    return {
      runId,
      runDirectory,
      manifest,
      aggregate,
      results,
      loadingResult,
      generatedFiles
    };
  }
}
