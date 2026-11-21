/**
 * EngiTrace Centralized Secret Redaction & Safe Logging / Error Utilities
 * Masks credentials, API keys, tokens, cookies, and auth headers across logs and safe errors.
 */

const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Query parameter secrets (e.g., ?key=..., &token=..., &api_key=...)
  {
    pattern: /([?&](?:key|api_key|apikey|token|access_token|refresh_token|secret|password|session)=)([^&#\s"']+)/gi,
    replacement: '$1[REDACTED]'
  },
  // GitHub classic & fine-grained PATs / app tokens
  {
    pattern: /\b(gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{16,})\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]'
  },
  // Google / Gemini API keys
  {
    pattern: /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
    replacement: '[REDACTED_API_KEY]'
  },
  // HTTP Authorization headers
  {
    pattern: /((?:authorization|proxy-authorization)\s*[:=]\s*(?:bearer|token|basic)\s+)[^\s,;'"}\]]+/gi,
    replacement: '$1[REDACTED]'
  },
  // Standalone Bearer / token prefixes
  {
    pattern: /(\bBearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: '$1[REDACTED]'
  },
  // x-goog-api-key and x-csrf-token headers
  {
    pattern: /((?:x-goog-api-key|x-csrf-token|x-api-key)\s*[:=]\s*)[^\s,;'"}\]]+/gi,
    replacement: '$1[REDACTED]'
  },
  // Cookie / Set-Cookie headers
  {
    pattern: /((?:cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi,
    replacement: '$1[REDACTED_COOKIE]'
  },
  // Password / secret key-value patterns in logs or JSON strings
  {
    pattern: /(["']?(?:password|passwordHash|secret|sessionSecret|apiKey|api_key|githubToken|geminiApiKey)["']?\s*[:=]\s*["']?)[^"',\s}\]]+/gi,
    replacement: '$1[REDACTED]'
  }
];

const SENSITIVE_OBJECT_KEYS = new Set([
  'password',
  'passwordhash',
  'secret',
  'sessionsecret',
  'apikey',
  'api_key',
  'geminiapikey',
  'githubtoken',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-goog-api-key',
  'x-csrf-token',
  'csrftoken',
  'sessionid',
  'sid'
]);

const RUNTIME_ENV_SECRET_KEYS = [
  'GEMINI_API_KEY',
  'GITHUB_TOKEN',
  'ENGITRACE_SESSION_SECRET',
  'ENGITRACE_OPERATOR_PASSWORD_HASH',
  'ENGITRACE_BOOTSTRAP_PASSWORD'
] as const;

/**
 * Redacts known secret patterns and active environment secret values from arbitrary strings.
 */
export function redactSecrets(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let output = input;

  for (const envKey of RUNTIME_ENV_SECRET_KEYS) {
    const val = process.env[envKey];
    if (val && val.trim().length >= 8 && !val.includes('your_')) {
      output = output.split(val).join(`[REDACTED_${envKey}]`);
    }
  }

  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

/**
 * Deeply redacts sensitive keys and secret string values from structured objects for safe logging.
 */
export function redactStructuredData(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[MAX_DEPTH]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return redactSecrets(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecrets(value.message || '')
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactStructuredData(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_OBJECT_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactStructuredData(v, depth + 1);
      }
    }
    return out;
  }
  return '[UNSERIALIZABLE]';
}

/**
 * Produces a redacted single-line summary string from an unknown error for server logs.
 */
export function formatSafeErrorLog(err: unknown): string {
  if (!err) return 'Unknown error';
  if (err instanceof Error) {
    return redactSecrets(`${err.name}: ${err.message}`);
  }
  if (typeof err === 'string') {
    return redactSecrets(err);
  }
  try {
    return redactSecrets(JSON.stringify(redactStructuredData(err)));
  } catch {
    return 'Unserializable error';
  }
}

export const SafeLogger = {
  info(scope: string, message: string, meta?: Record<string, unknown>): void {
    const safeMsg = redactSecrets(message);
    if (meta) {
      console.log(`[${scope}] ${safeMsg}`, JSON.stringify(redactStructuredData(meta)));
    } else {
      console.log(`[${scope}] ${safeMsg}`);
    }
  },
  warn(scope: string, message: string, meta?: Record<string, unknown>): void {
    const safeMsg = redactSecrets(message);
    if (meta) {
      console.warn(`[${scope}] ${safeMsg}`, JSON.stringify(redactStructuredData(meta)));
    } else {
      console.warn(`[${scope}] ${safeMsg}`);
    }
  },
  error(scope: string, message: string, err?: unknown, meta?: Record<string, unknown>): void {
    const safeMsg = redactSecrets(message);
    const errSummary = err ? formatSafeErrorLog(err) : undefined;
    const payload = redactStructuredData({ ...(meta || {}), ...(errSummary ? { error: errSummary } : {}) });
    console.error(`[${scope}] ${safeMsg}`, JSON.stringify(payload));
  }
};

