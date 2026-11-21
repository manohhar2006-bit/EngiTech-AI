import { NextFunction, Request, Response } from 'express';
import { ZodType } from 'zod';
import { AuthService, OperatorSession, SESSION_COOKIE_NAME, parseCookieHeader } from './authService';
import { WorkspaceAccess } from './workspaceAccess';
import { validateRepositoryId, safeDecodeURIComponent } from './validation';
import { sendSafeError } from './secretRedactor';

export interface AuthenticatedRequestContext {
  username: string;
  workspaceId: string;
  csrfToken: string;
  session: OperatorSession;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedRequestContext;
    }
  }
}

export function getAllowedOrigins(): Set<string> {
  const configured = process.env.ENGITRACE_ALLOWED_ORIGINS?.trim();
  const defaults = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  if (!configured) {
    return new Set(process.env.NODE_ENV === 'production' ? [] : defaults);
  }
  const origins = configured
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(origins);
}

/**
 * Validates Origin/Referer against allowed origins on state-changing browser requests.
 */
export function isAllowedOriginHeader(req: Request): boolean {
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const allowed = getAllowedOrigins();

  if (typeof originHeader === 'string' && originHeader.length > 0) {
    if (originHeader === 'null') return false;
    return allowed.has(originHeader);
  }

  if (typeof refererHeader === 'string' && refererHeader.length > 0) {
    try {
      const refOrigin = new URL(refererHeader).origin;
      return allowed.has(refOrigin);
    } catch {
      return false;
    }
  }

  // Allow non-browser / direct API callers when no Origin/Referer header is sent
  return true;
}

/**
 * Populates req.auth when a valid session cookie is attached. Never accepts auth credentials from headers or query strings.
 */
export function attachAuthContext(req: Request, _res: Response, next: NextFunction): void {
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawCookie = cookies[SESSION_COOKIE_NAME];
  const session = AuthService.validateSessionCookie(rawCookie);

  if (session) {
    req.auth = {
      username: session.username,
      workspaceId: session.workspaceId,
      csrfToken: session.csrfToken,
      session
    };
  }
  next();
}

/**
 * Rejects unauthenticated requests with HTTP 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    sendSafeError(res, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required. Please sign in to continue.');
    return;
  }
  next();
}

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Enforces Origin/Referer verification + session-bound X-CSRF-Token on all state-changing cookie-authenticated requests.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_HTTP_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  if (!isAllowedOriginHeader(req)) {
    sendSafeError(res, 403, 'CSRF_ORIGIN_DENIED', 'Request origin is not permitted.');
    return;
  }

  if (!req.auth) {
    sendSafeError(res, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required.');
    return;
  }

  const csrfHeader = req.headers['x-csrf-token'];
  const providedToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
  if (!AuthService.verifyCsrfToken(req.auth.session, providedToken)) {
    sendSafeError(res, 403, 'CSRF_TOKEN_INVALID', 'Invalid or missing CSRF token.');
    return;
  }

  next();
}

/**
 * Validates :id and enforces workspace isolation so unknown or cross-workspace repos cannot be accessed or probed.
 */
export function requireRepositoryAccess(req: Request, res: Response, next: NextFunction): void {
  const validId = validateRepositoryId(req.params.id);
  if (!validId) {
    sendSafeError(res, 400, 'INVALID_REPOSITORY_ID', 'Invalid repository identifier format.');
    return;
  }

  const callerWorkspace = req.auth?.workspaceId;
  if (!callerWorkspace) {
    sendSafeError(res, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required.');
    return;
  }

  const access = WorkspaceAccess.checkAccess(validId, callerWorkspace);
  if (access.status === 'NOT_FOUND') {
    sendSafeError(res, 404, 'REPOSITORY_NOT_FOUND', `Repository "${validId}" is not registered or not analyzed yet.`);
    return;
  }

  if (access.status === 'FORBIDDEN') {
    sendSafeError(res, 403, 'REPOSITORY_ACCESS_DENIED', 'You are not authorized to access this repository.');
    return;
  }

  req.params.id = access.canonicalId;
  next();
}

/**
 * Safely decodes URL nodeId/evidenceId/dependencyId route parameters to block malformed percent-encodings or control bytes.
 */
export function validateEncodedParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw = req.params[paramName];
    if (typeof raw !== 'string') {
      sendSafeError(res, 400, 'INVALID_PARAMETER', `Missing required route parameter "${paramName}".`);
      return;
    }
    const decoded = safeDecodeURIComponent(raw);
    if (!decoded) {
      sendSafeError(res, 400, 'INVALID_PARAMETER', `Invalid or malformed "${paramName}" parameter.`);
      return;
    }
    req.params[paramName] = decoded;
    next();
  };
}

/**
 * Validates Express req.body using a Zod schema without leaking schema internals.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const pathHint = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
      sendSafeError(
        res,
        400,
        'VALIDATION_ERROR',
        `Invalid request body: ${pathHint}${issue?.message || 'malformed input.'}`
      );
      return;
    }
    req.body = parsed.data;
    next();
  };
}

/**
 * Validates Express req.query using a Zod schema.
 */
export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      sendSafeError(res, 400, 'VALIDATION_ERROR', 'Invalid query parameters.');
      return;
    }
    (req as any).validatedQuery = parsed.data;
    next();
  };
}

