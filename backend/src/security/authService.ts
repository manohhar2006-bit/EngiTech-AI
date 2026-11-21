import crypto from 'crypto';
import { verifyPassword, isValidScryptHashFormat } from './passwordHash';
import { SafeLogger } from './secretRedactor';

export const SESSION_COOKIE_NAME = 'engitrace_sid';

export interface OperatorSession {
  sessionIdHash: string;
  username: string;
  workspaceId: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface AuthConfigurationStatus {
  authMode: 'SINGLE_WORKSPACE_OPERATOR';
  authConfigured: boolean;
  sessionSecretConfigured: boolean;
  username: string;
  workspaceId: string;
  sessionStoreType: 'IN_MEMORY_SINGLE_INSTANCE';
}

const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const DEFAULT_SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ACTIVE_SESSIONS = 500;

/**
 * Process-local session store for single-workspace operator authentication.
 * PRODUCTION NOTE: Process-local Memory storage is limited to single-instance deployments;
 * replace with a shared persistent store (e.g., Redis) for multi-instance production clusters.
 */
const sessionStore = new Map<string, OperatorSession>();
let ephemeralDevSessionSecret: string | null = null;
let loggedEphemeralWarning = false;

function getSessionSecret(): string | null {
  const configured = process.env.ENGITRACE_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32 && !configured.includes('change_me')) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  if (!ephemeralDevSessionSecret) {
    ephemeralDevSessionSecret = crypto.randomBytes(32).toString('hex');
    if (!loggedEphemeralWarning) {
      loggedEphemeralWarning = true;
      SafeLogger.warn(
        'AuthService',
        'ENGITRACE_SESSION_SECRET is missing or <32 chars; using ephemeral process-only development secret (sessions invalidate on restart).'
      );
    }
  }
  return ephemeralDevSessionSecret;
}

function getSessionTtlMs(): number {
  const raw = Number(process.env.ENGITRACE_SESSION_TTL_MS);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_SESSION_TTL_MS;
}

function getSessionIdleMs(): number {
  const raw = Number(process.env.ENGITRACE_SESSION_IDLE_MS);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_SESSION_IDLE_MS;
}

function hashSessionId(sessionId: string): string {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

function signCookieToken(rawSessionId: string, secret: string): string {
  const sig = crypto.createHmac('sha256', secret).update(rawSessionId).digest('base64url');
  return `${rawSessionId}.${sig}`;
}

function verifySignedCookieToken(cookieValue: string, secret: string): string | null {
  const dotIdx = cookieValue.indexOf('.');
  if (dotIdx <= 16) return null;
  const rawId = cookieValue.slice(0, dotIdx);
  const providedSig = cookieValue.slice(dotIdx + 1);
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(rawId) || !/^[A-Za-z0-9_-]{32,128}$/.test(providedSig)) {
    return null;
  }
  const expectedSig = crypto.createHmac('sha256', secret).update(rawId).digest('base64url');
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  return rawId;
}

function pruneExpiredSessions(now: number): void {
  const idleMs = getSessionIdleMs();
  for (const [key, sess] of sessionStore.entries()) {
    if (now >= sess.expiresAt || now - sess.lastSeenAt >= idleMs) {
      sessionStore.delete(key);
    }
  }
}

export class AuthService {
  static getConfiguredUsername(): string {
    return process.env.ENGITRACE_OPERATOR_USERNAME?.trim() || 'operator';
  }

  static getConfiguredWorkspaceId(): string {
    return process.env.ENGITRACE_WORKSPACE_ID?.trim() || 'workspace-default';
  }

  static getConfigStatus(): AuthConfigurationStatus {
    const hashValid = isValidScryptHashFormat(process.env.ENGITRACE_OPERATOR_PASSWORD_HASH);
    const envSecret = process.env.ENGITRACE_SESSION_SECRET?.trim();
    const sessionSecretConfigured = Boolean(envSecret && envSecret.length >= 32 && !envSecret.includes('change_me'));
    const secretUsable = Boolean(getSessionSecret());

    return {
      authMode: 'SINGLE_WORKSPACE_OPERATOR',
      authConfigured: hashValid && secretUsable,
      sessionSecretConfigured,
      username: this.getConfiguredUsername(),
      workspaceId: this.getConfiguredWorkspaceId(),
      sessionStoreType: 'IN_MEMORY_SINGLE_INSTANCE'
    };
  }

  /**
   * Verifies credentials in constant time and creates a fresh session (revoking any previous session
   * token on login to prevent session fixation).
   */
  static async authenticateOperator(
    username: string,
    password: string,
    previousCookieToken?: string
  ): Promise<{ cookieToken: string; session: OperatorSession } | null> {
    const configuredHash = process.env.ENGITRACE_OPERATOR_PASSWORD_HASH?.trim();
    const secret = getSessionSecret();
    if (!isValidScryptHashFormat(configuredHash) || !secret) {
      return null;
    }

    const expectedUsername = this.getConfiguredUsername();
    const userA = Buffer.from(username.trim(), 'utf8');
    const userB = Buffer.from(expectedUsername, 'utf8');
    const maxLen = Math.max(userA.length, userB.length, 1);
    const paddedA = Buffer.alloc(maxLen);
    const paddedB = Buffer.alloc(maxLen);
    userA.copy(paddedA);
    userB.copy(paddedB);
    const usernameMatches = userA.length === userB.length && crypto.timingSafeEqual(paddedA, paddedB);

    const passwordMatches = await verifyPassword(password, configuredHash!);
    if (!usernameMatches || !passwordMatches) {
      return null;
    }

    if (previousCookieToken) {
      this.revokeSessionByCookie(previousCookieToken);
    }

    const now = Date.now();
    pruneExpiredSessions(now);

    if (sessionStore.size >= MAX_ACTIVE_SESSIONS) {
      const oldestKey = sessionStore.keys().next().value;
      if (oldestKey) sessionStore.delete(oldestKey);
    }

    const rawSessionId = crypto.randomBytes(32).toString('base64url');
    const sessionIdHash = hashSessionId(rawSessionId);
    const csrfToken = crypto.randomBytes(32).toString('base64url');
    const session: OperatorSession = {
      sessionIdHash,
      username: expectedUsername,
      workspaceId: this.getConfiguredWorkspaceId(),
      csrfToken,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + getSessionTtlMs()
    };

    sessionStore.set(sessionIdHash, session);
    return {
      cookieToken: signCookieToken(rawSessionId, secret),
      session
    };
  }

  /**
   * Validates the signed session cookie against the server-side session store and enforces idle/max expiry.
   */
  static validateSessionCookie(cookieToken: string | undefined): OperatorSession | null {
    if (!cookieToken || typeof cookieToken !== 'string') {
      return null;
    }
    const secret = getSessionSecret();
    if (!secret) {
      return null;
    }
    const rawSessionId = verifySignedCookieToken(cookieToken, secret);
    if (!rawSessionId) {
      return null;
    }

    const sessionIdHash = hashSessionId(rawSessionId);
    const session = sessionStore.get(sessionIdHash);
    if (!session) {
      return null;
    }

    const now = Date.now();
    if (now >= session.expiresAt || now - session.lastSeenAt >= getSessionIdleMs()) {
      sessionStore.delete(sessionIdHash);
      return null;
    }

    session.lastSeenAt = now;
    return session;
  }

  static revokeSessionByCookie(cookieToken: string | undefined): void {
    if (!cookieToken) return;
    const secret = getSessionSecret();
    if (!secret) return;
    const rawSessionId = verifySignedCookieToken(cookieToken, secret);
    if (!rawSessionId) return;
    sessionStore.delete(hashSessionId(rawSessionId));
  }

  static clearAllSessionsForTest(): void {
    sessionStore.clear();
  }

  static verifyCsrfToken(session: OperatorSession, providedToken: string | undefined): boolean {
    if (!providedToken || typeof providedToken !== 'string') {
      return false;
    }
    const a = Buffer.from(providedToken.trim(), 'utf8');
    const b = Buffer.from(session.csrfToken, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return cookies;
  }
  const pairs = cookieHeader.split(';');
  for (const part of pairs) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const val = part.slice(eqIndex + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

export function shouldUseSecureCookie(reqSecure?: boolean): boolean {
  if (process.env.ENGITRACE_COOKIE_SECURE === 'true') return true;
  if (process.env.ENGITRACE_COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production' || Boolean(reqSecure);
}

