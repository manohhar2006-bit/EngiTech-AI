import React from 'react';
import { Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const SessionControl: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { session, openLogin, signOut } = useAuth();

  if (session.loading) {
    return null;
  }

  if (session.authenticated && session.operator) {
    return (
      <div className={`flex items-center justify-between gap-2 ${compact ? 'w-full' : ''}`}>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-300 truncate">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{session.operator.username}</span>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
          title="Sign out"
        >
          <LogOut className="w-3 h-3" />
          <span>Sign out</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={openLogin}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors cursor-pointer ${
        compact ? 'w-full' : ''
      }`}
    >
      <Lock className="w-3.5 h-3.5" />
      <span>Sign In</span>
    </button>
  );
};

