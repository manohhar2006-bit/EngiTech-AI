import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function getLimiterKey(req: Request): string {
  if (req.auth?.username && req.auth?.workspaceId) {
    return `op:${req.auth.workspaceId}:${req.auth.username}`;
  }
  return ipKeyGenerator(req.ip || '127.0.0.1');
}

function createLimiter(envMaxName: string, defaultMax: number, windowMs: number, message: string) {
  return rateLimit({
    windowMs,
    max: () => readPositiveIntEnv(envMaxName, defaultMax),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: getLimiterKey,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: message,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
  });
}

/**
 * Process-local rate limiters (express-rate-limit default MemoryStore).
 * PRODUCTION NOTE: Process-local rate limiting does not coordinate counts across
 * horizontally scaled instances; configure a distributed store (e.g., Redis) for multi-instance production.
 */
export function createEngiTraceRateLimiters() {
  const fifteenMinMs = readPositiveIntEnv('ENGITRACE_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);

  return {
    loginRateLimiter: createLimiter(
      'ENGITRACE_RATE_LIMIT_MAX_LOGIN',
      10,
      fifteenMinMs,
      'Too many login attempts. Please wait before trying again.'
    ),
    analyzeRateLimiter: createLimiter(
      'ENGITRACE_RATE_LIMIT_MAX_ANALYZE',
      10,
      fifteenMinMs,
      'Repository analysis rate limit exceeded. Please wait before ingesting another repository.'
    ),
    chatRateLimiter: createLimiter(
      'ENGITRACE_RATE_LIMIT_MAX_CHAT',
      30,
      fifteenMinMs,
      'AI chat rate limit exceeded. Please wait before sending more questions.'
    ),
    aiReasoningRateLimiter: createLimiter(
      'ENGITRACE_RATE_LIMIT_MAX_AI_REASONING',
      25,
      fifteenMinMs,
      'AI explanation rate limit exceeded. Please wait before requesting another analysis.'
    ),
    generalApiRateLimiter: createLimiter(
      'ENGITRACE_RATE_LIMIT_MAX_GENERAL',
      240,
      fifteenMinMs,
      'Too many API requests. Please slow down.'
    )
  };
}

