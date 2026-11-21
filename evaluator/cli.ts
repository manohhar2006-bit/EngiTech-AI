#!/usr/bin/env node
/**
 * EngiTrace EEID Evaluation Runner — Command-Line Interface
 *
 * Usage:
 *   npx tsx evaluator/cli.ts --dataset <path> [options]
 *
 * Options:
 *   --dataset <path>       Path to gold dataset JSONL file (Required)
 *   --backend-url <url>    EngiTrace backend API base URL (Default: http://localhost:4000/api/v1)
 *   --output-dir <path>    Directory to store evaluation runs (Default: ./evaluation_runs)
 *   --index-dir <path>     Directory containing repository index files (Optional)
 *   --mode <mode>          Evaluation mode: 'full' | 'deterministic' | 'semantic' (Default: full)
 *   --repo <id>            Filter by repository ID (e.g. EEID-REPO-001)
 *   --category <name>      Filter by category (e.g. IMPACT_ANALYSIS)
 *   --limit <n>            Maximum number of approved records to evaluate
 *   --run-id <id>          Custom run identifier
 *   --help, -h             Show this help message
 */

import path from 'path';
import { EvaluationRunner } from './index';

function parseArgs(): Record<string, string | boolean> {
  const args = process.argv.slice(2);
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options[key] = args[++i];
      } else {
        options[key] = true;
      }
    }
  }

  return options;
}

function printUsage(): void {
  console.log(`
EngiTrace EEID Evaluation Runner (Task 4)
----------------------------------------
Usage:
  npx tsx evaluator/cli.ts --dataset <path> [options]

Required:
  --dataset <path>       Path to gold dataset JSONL file

Options:
  --backend-url <url>    Backend API base URL (default: http://localhost:4000/api/v1)
  --output-dir <path>    Output base directory (default: ./evaluation_runs)
  --index-dir <path>     Path to pilot index directory (default: ./eeid/pilot-output)
  --mode <mode>          Evaluation mode: 'full' | 'deterministic' | 'semantic' (default: full)
  --repo <repoId>        Filter evaluation to a specific repository ID
  --category <category>  Filter evaluation to a specific EEID category
  --limit <n>            Evaluate at most <n> records (useful for development)
  --run-id <id>          Specify a custom run ID
  --help, -h             Show this help message

Examples:
  npx tsx evaluator/cli.ts --dataset eeid/eeid_records.jsonl
  npx tsx evaluator/cli.ts --dataset evaluator/tests/fixtures/synthetic_approved_gold_records.jsonl --limit 2
  npx tsx evaluator/cli.ts --dataset eeid/task3-remediation-proposal-v4.2.5/RECORD_PATCHES_V4_2_5.jsonl
`);
}

async function main(): Promise<void> {
  const opts = parseArgs();

  if (opts.help || Object.keys(opts).length === 0) {
    printUsage();
    process.exit(opts.help ? 0 : 1);
  }

  if (!opts.dataset || typeof opts.dataset !== 'string') {
    console.error('❌ Error: Missing required option --dataset <path>');
    printUsage();
    process.exit(1);
  }

  const datasetPath = path.resolve(process.cwd(), opts.dataset);
  const backendUrl = (opts['backend-url'] as string) || process.env.ENGITRACE_BACKEND_URL || 'http://localhost:4000/api/v1';
  const outputDir = path.resolve(process.cwd(), (opts['output-dir'] as string) || './evaluation_runs');
  const indexDirectory = opts['index-dir'] ? path.resolve(process.cwd(), opts['index-dir'] as string) : undefined;
  const mode = (opts.mode as 'full' | 'deterministic' | 'semantic') || 'full';
  const filterRepo = opts.repo as string | undefined;
  const filterCat = opts.category as string | undefined;
  const limit = opts.limit ? parseInt(opts.limit as string, 10) : undefined;
  const customRunId = opts['run-id'] as string | undefined;

  console.log('\n======================================================');
  console.log('🚀 EngiTrace EEID Evaluation Runner (Task 4)');
  console.log('======================================================');
  console.log(`• Dataset:       ${datasetPath}`);
  console.log(`• Backend URL:   ${backendUrl}`);
  console.log(`• Output Dir:    ${outputDir}`);
  console.log(`• Mode:          ${mode}`);
  if (indexDirectory) console.log(`• Index Dir:     ${indexDirectory}`);
  if (filterRepo) console.log(`• Filter Repo:   ${filterRepo}`);
  if (filterCat) console.log(`• Filter Cat:    ${filterCat}`);
  if (limit) console.log(`• Limit:         ${limit}`);
  console.log('------------------------------------------------------\n');

  try {
    const runner = new EvaluationRunner({
      datasetPath,
      backendUrl,
      outputDir,
      indexDirectory,
      runId: customRunId,
      filterRepositoryId: filterRepo,
      filterCategory: filterCat,
      limit,
      config: {
        evaluationMode: mode
      },
      onProgress: ({ current, total, recordId, status }) => {
        console.log(`[${current}/${total}] ${recordId} -> ${status}`);
      }
    });

    console.log('→ Loading Gold Dataset and checking governance signoff...');
    const summary = await runner.run();

    console.log('\n======================================================');
    console.log('📊 Evaluation Run Completed');
    console.log('======================================================');
    console.log(`• Run ID:           ${summary.runId}`);
    console.log(`• Run Directory:    ${summary.runDirectory}`);
    console.log(`• Total Questions:  ${summary.manifest.totalQuestions}`);
    console.log(`• Executed Success: ${summary.manifest.successfulQuestions}`);
    console.log(`• Executed Failed:  ${summary.manifest.failedQuestions}`);
    console.log(`• Approved Records: ${summary.loadingResult.approvedRecords.length}`);
    console.log(`• Rejected Records: ${summary.loadingResult.rejectedRecords.length}`);
    console.log(`• Overall Score:    ${summary.aggregate.overall.overallBenchmarkScore !== 'NOT_AVAILABLE' ? (Number(summary.aggregate.overall.overallBenchmarkScore) * 100).toFixed(1) + '%' : 'N/A'}`);
    const thresholdDisplay = summary.manifest.passedThresholds === 'NOT_EVALUATED'
      ? 'NOT_EVALUATED ⚠️ (Empty / Blocked Run)'
      : (summary.manifest.passedThresholds ? 'PASSED ✅' : 'FAILED ❌');
    console.log(`• Threshold Result: ${thresholdDisplay}`);
    console.log(`• Generated Files:  ${summary.generatedFiles.join(', ')}`);
    console.log('------------------------------------------------------');
    const reportFile = summary.generatedFiles.find((f) => f.endsWith('.md')) || 'EEID_BASELINE_EVALUATION_REPORT.md';
    console.log(`📄 Open Markdown Report: ${path.join(summary.runDirectory, reportFile)}\n`);

    if (summary.loadingResult.rejectedRecords.length > 0) {
      console.log(`⚠️  Notice: ${summary.loadingResult.rejectedRecords.length} record(s) rejected by Governance/Schema checks:`);
      summary.loadingResult.rejectedRecords.slice(0, 5).forEach((rej) => {
        console.log(`   - [Line ${rej.lineNumber}] ${rej.recordId}: ${rej.reason}`);
      });
      if (summary.loadingResult.rejectedRecords.length > 5) {
        console.log(`   - ... and ${summary.loadingResult.rejectedRecords.length - 5} more`);
      }
      console.log('');
    }
  } catch (err: any) {
    console.error('\n❌ Evaluation Runner Error:', err.message || err);
    process.exit(1);
  }
}

main();
