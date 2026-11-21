import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthApi, AuthSessionState, subscribeUnauthorized } from '../services/authClient';

interface AuthContextValue {
  session: AuthSessionState;
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
  refreshSession: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const DEFAULT_SESSION: AuthSessionState = {
  loading: true,
  authenticated: false,
  authConfigured: true,
  authMode: 'SINGLE_WORKSPACE_OPERATOR',
  operator: null
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSessionState>(DEFAULT_SESSION);
  const [loginOpen, setLoginOpen] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const next = await AuthApi.fetchSession();
      setSession(next);
    } catch {
      setSession({
        ...DEFAULT_SESSION,
        loading: false,
        authenticated: false
      });
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    return subscribeUnauthorized(() => {
      setSession((prev) => ({
        ...prev,
        loading: false,
        authenticated: false,
        operator: null
      }));
      setLoginOpen(true);
    });
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const next = await AuthApi.login(username, password);
    setSession(next);
    setLoginOpen(false);
  }, []);

  const signOut = useCallback(async () => {
    await AuthApi.logout();
    setSession((prev) => ({
      ...prev,
      authenticated: false,
      operator: null,
      expiresAt: undefined
    }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        loginOpen,
        openLogin: () => setLoginOpen(true),
        closeLogin: () => setLoginOpen(false),
        refreshSession,
        signIn,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return ctx;
}

