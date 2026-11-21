import { Response } from 'express';
import { SafeLogger, formatSafeErrorLog, redactSecrets, redactStructuredData } from '../../../ai-engine/security/secretRedactor';

export { SafeLogger, formatSafeErrorLog, redactSecrets, redactStructuredData };

export interface SafeApiErrorBody {
  error: string;
  code: string;
}

/**
 * Logs redacted error details on the server and returns a safe, generic error payload to HTTP clients.
 * Never leaks stack traces, database/provider internals, credentials, or raw error messages.
 */
export function sendSafeError(
  res: Response,
  status: number,
  code: string,
  clientMessage: string,
  err?: unknown,
  logScope = 'EngiTraceAPI'
): void {
  if (err !== undefined) {
    SafeLogger.error(logScope, `${code} (${status}): ${clientMessage}`, err);
  }
  const body: SafeApiErrorBody = {
    error: redactSecrets(clientMessage),
    code
  };
  res.status(status).json(body);
}

