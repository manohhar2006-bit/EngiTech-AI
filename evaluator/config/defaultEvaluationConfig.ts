/**
 * EngiTrace EEID Evaluation Runner — Default Configuration
 */

import { EvaluationConfig } from '../types';

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  version: '1.0.0',
  backendUrl: process.env.ENGITRACE_BACKEND_URL || 'http://localhost:4000/api/v1',
  requestTimeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
  evaluationMode: 'full',
  semanticJudge: {
    enabled: true,
    provider: 'GEMINI',
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    promptVersion: 'eeid-judge-v1',
    temperature: 0.0
  },
  weights: {
    evidencePrecision: 0.20,
    evidenceRecall: 0.20,
    claimCoverage: 0.25,
    uncertaintyHandling: 0.15,
    citationResolution: 0.10,
    correctness: 0.10
  },
  thresholds: {
    minExecutionSuccessRate: 0.95,
    minEvidencePrecision: 0.70,
    minEvidenceRecall: 0.60,
    maxContradictionRate: 0.05,
    maxUnsupportedAssertionRate: 0.15,
    minOverallBenchmarkScore: 0.70
  }
};
