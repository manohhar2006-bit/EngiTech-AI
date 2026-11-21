import { API_BASE_URL } from '../config';

export interface AuthOperatorInfo {
  username: string;
  workspaceId: string;
}

export interface AuthSessionState {
  loading: boolean;
  authenticated: boolean;
  authConfigured: boolean;
  authMode: 'SINGLE_WORKSPACE_OPERATOR';
  operator: AuthOperatorInfo | null;
  expiresAt?: string;
}

/**
 * In-memory CSRF token only — never written to localStorage or sessionStorage.
 * Authentication itself is backed by an HttpOnly session cookie (engitrace_sid).
 */
let inMemoryCsrfToken: string | null = null;
const unauthorizedListeners = new Set<() => void>();

export function setInMemoryCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

export function getInMemoryCsrfToken(): string | null {
  return inMemoryCsrfToken;
}

export function subscribeUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  inMemoryCsrfToken = null;
  unauthorizedListeners.forEach((cb) => cb());
}

/**
 * Credentialed fetch wrapper that automatically sends HttpOnly session cookies
 * and attaches the in-memory X-CSRF-Token header on state-changing requests.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && inMemoryCsrfToken) {
    if (!headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', inMemoryCsrfToken);
    }
  }

  const response = await fetch(input, {
    ...init,
    credentials: 'include',
    headers
  });

  if (response.status === 401) {
    const reqUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : '';
    if (!reqUrl.includes('/auth/login')) {
      notifyUnauthorized();
    }
  }

  return response;
}

export async function extractSafeErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string | { message?: string }; message?: string };
    if (typeof data?.error === 'string' && data.error.trim()) {
      return data.error;
    }
    if (typeof data?.error === 'object' && typeof data.error?.message === 'string') {
      return data.error.message;
    }
    if (typeof data?.message === 'string' && data.message.trim()) {
      return data.message;
    }
  } catch {
    // ignore JSON parse failure
  }
  return fallback;
}

export const AuthApi = {
  async fetchSession(): Promise<AuthSessionState> {
    const response = await fetch(`${API_BASE_URL}/auth/session`, {
      method: 'GET',
      credentials: 'include'
    });
    if (!response.ok) {
      return {
        loading: false,
        authenticated: false,
        authConfigured: false,
        authMode: 'SINGLE_WORKSPACE_OPERATOR',
        operator: null
      };
    }
    const data = await response.json();
    if (data?.authenticated && typeof data.csrfToken === 'string') {
      setInMemoryCsrfToken(data.csrfToken);
    } else {
      setInMemoryCsrfToken(null);
    }
    return {
      loading: false,
      authenticated: Boolean(data?.authenticated),
      authConfigured: Boolean(data?.authConfigured),
      authMode: 'SINGLE_WORKSPACE_OPERATOR',
      operator: data?.operator || null,
      expiresAt: data?.expiresAt
    };
  },

  async login(username: string, password: string): Promise<AuthSessionState> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const msg = await extractSafeErrorMessage(response, `Sign in failed (HTTP ${response.status}).`);
      throw new Error(msg);
    }

    const data = await response.json();
    if (typeof data?.csrfToken === 'string') {
      setInMemoryCsrfToken(data.csrfToken);
    }
    return {
      loading: false,
      authenticated: Boolean(data?.authenticated),
      authConfigured: true,
      authMode: 'SINGLE_WORKSPACE_OPERATOR',
      operator: data?.operator || null,
      expiresAt: data?.expiresAt
    };
  },

  async logout(): Promise<void> {
    await apiFetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST'
    }).catch(() => undefined);
    setInMemoryCsrfToken(null);
  }
};

