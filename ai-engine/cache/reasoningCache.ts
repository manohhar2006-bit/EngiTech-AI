/**
 * EngiTrace Phase 4 - AI Reasoning In-Memory Cache
 */

import { AIReasoningResponse } from '../types/aiContext';
import { PROMPT_VERSION } from '../prompts/why.v1';

export class ReasoningCache {
  private static cache = new Map<string, { response: AIReasoningResponse; expiresAt: number }>();
  private static DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutes cache TTL

  static generateCacheKey(repositoryId: string, nodeId: string, evidenceCount: number): string {
    return `${repositoryId}:${nodeId}:${evidenceCount}:${PROMPT_VERSION}`;
  }

  static get(key: string): AIReasoningResponse | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return {
      ...cached.response,
      modelMetadata: {
        ...cached.response.modelMetadata,
        cached: true
      }
    };
  }

  static set(key: string, response: AIReasoningResponse, ttlMs = this.DEFAULT_TTL_MS): void {
    this.cache.set(key, {
      response,
      expiresAt: Date.now() + ttlMs
    });
  }

  static clear(): void {
    this.cache.clear();
  }
}
