import React, { useState } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const AuthModal: React.FC = () => {
  const { loginOpen, closeLogin, signIn, session } = useAuth();
  const [username, setUsername] = useState('operator');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!loginOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await signIn(username.trim(), password);
      setPassword('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-[#0B1120] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Operator Sign In</h2>
              <p className="text-xs text-slate-400">
                Single-workspace authenticated session (HttpOnly cookie)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeLogin}
            aria-label="Close sign in dialog"
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!session.authConfigured && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            Authentication hash is not configured on the backend. Set <code>ENGITRACE_OPERATOR_PASSWORD_HASH</code> in <code>backend/.env</code>.
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="engitrace-username" className="block text-xs font-medium text-slate-300 mb-1.5">
              Operator Username
            </label>
            <input
              id="engitrace-username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="engitrace-password" className="block text-xs font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <input
              id="engitrace-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 transition-colors"
          >
            <Lock className="w-4 h-4" />
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

