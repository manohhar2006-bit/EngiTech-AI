/**
 * EngiTrace EEID Evaluation Runner — EngiTrace Assistant Adapter
 *
 * Implements communication with the live EngiTrace backend:
 * - Sends benchmark questions to POST /api/v1/repositories/:id/chat
 * - Enforces session isolation via SessionManager
 * - Bounded retries with exponential backoff on transient errors
 * - Timeout handling with AbortController
 * - High-precision latency measurement
 * - Captures claims, citations, follow-ups, and model metadata
 */

import {
  EEIDRecordV2,
  AssistantRequestPayload,
  AssistantRawResponse,
  QuestionExecutionResult
} from '../types';
import { SessionManager } from './sessionManager';

export interface AssistantAdapterOptions {
  backendUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
}

export class AssistantAdapter {
  private backendUrl: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private fetchFn: typeof fetch;

  constructor(options: AssistantAdapterOptions) {
    this.backendUrl = options.backendUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /**
   * Submits a benchmark question to the real EngiTrace assistant endpoint.
   */
  async executeQuestion(record: EEIDRecordV2): Promise<QuestionExecutionResult> {
    const repositoryId = record.repository.id;
    const requestPayload = SessionManager.createIsolatedSession(record);
    const endpointUrl = `${this.backendUrl}/repositories/${encodeURIComponent(repositoryId)}/chat`;

    let attempts = 0;
    let lastError: Error | null = null;
    let lastHttpStatus = 0;

    const startTime = Date.now();

    while (attempts < this.maxRetries) {
      attempts++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchFn(endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-EEID-Benchmark-Record-ID': record.recordId
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        lastHttpStatus = response.status;

        // If HTTP 500, 502, 503, 504 -> Transient retry
        if ([500, 502, 503, 504].includes(response.status)) {
          const errText = await response.text().catch(() => '');
          lastError = new Error(`Server error HTTP ${response.status}: ${errText}`);
          if (attempts < this.maxRetries) {
            const backoff = this.retryDelayMs * Math.pow(2, attempts - 1);
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
        }

        const latencyMs = Date.now() - startTime;

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          return {
            recordId: record.recordId,
            repositoryId,
            endpointUrl,
            requestPayload,
            httpStatus: response.status,
            latencyMs,
            attempts,
            executedAt: new Date().toISOString(),
            success: false,
            httpSuccess: false,
            providerStatus: 'PROVIDER_ERROR',
            genuineAiResponse: false,
            providerConfigured: false,
            errorMessage: `HTTP ${response.status} from assistant endpoint: ${errBody}`
          };
        }

        const data = (await response.json()) as AssistantRawResponse;

        // Validate structure of assistant response
        const answer = typeof data.answer === 'string' ? data.answer : '';
        const claims = Array.isArray(data.claims) ? data.claims : [];

        // Distinguish genuine Gemini response generation from auth/configuration errors
        const isAuthOrConfigError = Boolean(
          data.error === 'GEMINI_AUTH_ERROR' ||
          data.error === 'GEMINI_NOT_CONFIGURED' ||
          data.error === 'PROVIDER_CONFIGURATION_REQUIRED' ||
          data.provider === 'GEMINI_ERROR' ||
          data.provider === 'PROVIDER_CONFIGURATION_REQUIRED' ||
          answer.includes('Gemini Authentication Failed') ||
          answer.includes('Gemini API Key Unconfigured') ||
          answer.includes('API Key Unconfigured')
        );

        let providerStatus: QuestionExecutionResult['providerStatus'];
        let genuineAiResponse = false;
        let providerConfigured = false;

        if (isAuthOrConfigError) {
          providerStatus = 'PROVIDER_CONFIGURATION_REQUIRED';
          genuineAiResponse = false;
          providerConfigured = false;
        } else if (data.provider === 'GEMINI' && !data.error) {
          providerStatus = 'GENUINE_AI_RESPONSE';
          genuineAiResponse = true;
          providerConfigured = true;
        } else {
          providerStatus = 'LOCAL_FALLBACK';
          genuineAiResponse = false;
          providerConfigured = false;
        }

        return {
          recordId: record.recordId,
          repositoryId,
          endpointUrl,
          requestPayload,
          rawResponse: {
            answer,
            claims,
            suggestedFollowUps: Array.isArray(data.suggestedFollowUps) ? data.suggestedFollowUps : [],
            provider: data.provider || 'UNKNOWN',
            model: data.model || 'UNKNOWN',
            isFallback: Boolean(data.isFallback),
            error: data.error
          },
          httpStatus: response.status,
          latencyMs,
          attempts,
          executedAt: new Date().toISOString(),
          success: true,
          httpSuccess: true,
          providerStatus,
          genuineAiResponse,
          providerConfigured,
          providerError: data.error
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        if (err.name === 'AbortError') {
          lastError = new Error(`Request timed out after ${this.timeoutMs}ms (attempt ${attempts}/${this.maxRetries})`);
        }

        if (attempts < this.maxRetries) {
          const backoff = this.retryDelayMs * Math.pow(2, attempts - 1);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    return {
      recordId: record.recordId,
      repositoryId,
      endpointUrl,
      requestPayload,
      httpStatus: lastHttpStatus || 500,
      latencyMs,
      attempts,
      executedAt: new Date().toISOString(),
      success: false,
      httpSuccess: false,
      providerStatus: 'PROVIDER_ERROR',
      genuineAiResponse: false,
      providerConfigured: false,
      errorMessage: lastError ? lastError.message : 'Unknown execution failure'
    };
  }

  /**
   * Health check to confirm backend reachability before evaluation begins.
   */
  async checkBackendHealth(): Promise<{ online: boolean; details?: any; error?: string }> {
    try {
      const healthUrl = `${this.backendUrl.replace(/\/api\/v1$/, '')}/health`;
      const res = await this.fetchFn(healthUrl, { method: 'GET' });
      if (res.ok) {
        const json = await res.json();
        return { online: true, details: json };
      }
      return { online: false, error: `Health check returned HTTP ${res.status}` };
    } catch (err: any) {
      return { online: false, error: err.message || String(err) };
    }
  }
}
