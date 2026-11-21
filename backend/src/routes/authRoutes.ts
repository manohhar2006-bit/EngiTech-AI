import { Router, Request, Response } from 'express';
import {
  AuthService,
  SESSION_COOKIE_NAME,
  parseCookieHeader,
  shouldUseSecureCookie
} from '../security/authService';
import {
  csrfProtection,
  isAllowedOriginHeader,
  requireAuth,
  validateBody
} from '../security/authMiddleware';
import { loginBodySchema } from '../security/validation';
import { SafeLogger, sendSafeError } from '../security/secretRedactor';

export function createAuthRouter(loginRateLimiter: any): Router {
  const router = Router();

  /**
   * GET /api/v1/auth/session
   * Returns current authenticated session metadata and CSRF token when authenticated.
   */
  router.get('/session', (req: Request, res: Response) => {
    const configStatus = AuthService.getConfigStatus();
    if (!req.auth) {
      res.json({
        authenticated: false,
        authMode: configStatus.authMode,
        authConfigured: configStatus.authConfigured,
        sessionStoreType: configStatus.sessionStoreType
      });
      return;
    }

    res.json({
      authenticated: true,
      authMode: configStatus.authMode,
      authConfigured: configStatus.authConfigured,
      sessionStoreType: configStatus.sessionStoreType,
      operator: {
        username: req.auth.username,
        workspaceId: req.auth.workspaceId
      },
      csrfToken: req.auth.csrfToken,
      expiresAt: new Date(req.auth.session.expiresAt).toISOString()
    });
  });

  /**
   * GET /api/v1/auth/csrf
   * Returns session-bound CSRF token for authenticated callers.
   */
  router.get('/csrf', requireAuth, (req: Request, res: Response) => {
    res.json({ csrfToken: req.auth!.csrfToken });
  });

  /**
   * POST /api/v1/auth/login
   * Authenticates single-workspace operator credentials, rotates session ID (anti-fixation),
   * and sets an HttpOnly, SameSite=Lax (Secure in HTTPS/production) cookie.
   */
  router.post(
    '/login',
    loginRateLimiter,
    validateBody(loginBodySchema),
    async (req: Request, res: Response) => {
      if (!isAllowedOriginHeader(req)) {
        sendSafeError(res, 403, 'CSRF_ORIGIN_DENIED', 'Login request origin is not permitted.');
        return;
      }

      const configStatus = AuthService.getConfigStatus();
      if (!configStatus.authConfigured) {
        sendSafeError(
          res,
          503,
          'AUTH_NOT_CONFIGURED',
          'Authentication is not configured on the server. Set ENGITRACE_OPERATOR_PASSWORD_HASH (and ENGITRACE_SESSION_SECRET in production).'
        );
        return;
      }

      const { username, password } = req.body as { username: string; password: string };
      const cookies = parseCookieHeader(req.headers.cookie);
      const previousCookie = cookies[SESSION_COOKIE_NAME];

      const authResult = await AuthService.authenticateOperator(username, password, previousCookie);
      if (!authResult) {
        SafeLogger.warn('AuthRoutes', 'Failed operator login attempt', { username });
        sendSafeError(res, 401, 'INVALID_CREDENTIALS', 'Invalid operator username or password.');
        return;
      }

      const secure = shouldUseSecureCookie(req.secure);
      const maxAgeSec = Math.max(60, Math.floor((authResult.session.expiresAt - Date.now()) / 1000));
      res.cookie(SESSION_COOKIE_NAME, authResult.cookieToken, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: maxAgeSec * 1000
      });

      SafeLogger.info('AuthRoutes', 'Operator signed in cleanly', {
        username: authResult.session.username,
        workspaceId: authResult.session.workspaceId
      });

      res.json({
        authenticated: true,
        authMode: configStatus.authMode,
        operator: {
          username: authResult.session.username,
          workspaceId: authResult.session.workspaceId
        },
        csrfToken: authResult.session.csrfToken,
        expiresAt: new Date(authResult.session.expiresAt).toISOString()
      });
    }
  );

  /**
   * POST /api/v1/auth/logout
   * Invalidates the server-side session and clears the session cookie.
   */
  router.post('/logout', (req: Request, res: Response, next) => {
    if (req.auth) {
      csrfProtection(req, res, next);
      return;
    }
    next();
  }, (req: Request, res: Response) => {
    const cookies = parseCookieHeader(req.headers.cookie);
    AuthService.revokeSessionByCookie(cookies[SESSION_COOKIE_NAME]);

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: shouldUseSecureCookie(req.secure),
      sameSite: 'lax',
      path: '/'
    });

    res.json({ authenticated: false, ok: true });
  });

  return router;
}

