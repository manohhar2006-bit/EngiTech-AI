import React from 'react';
import {
  Sparkles,
  GitBranch,
  FileCode,
  Layers,
  HelpCircle,
  Zap,
  ArrowRight,
  ShieldCheck,
  Bot
} from 'lucide-react';
import { InvestigationContext, InvestigationMode } from '../../../types/aiAssistant';

interface NewInvestigationStateProps {
  context: InvestigationContext;
  onSelectPrompt: (prompt: string) => void;
  suggestedQuestions: string[];
}

export const NewInvestigationState: React.FC<NewInvestigationStateProps> = ({
  context,
  onSelectPrompt,
  suggestedQuestions
}) => {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4 text-center select-none">
      {/* Central Sparkle & Badge */}
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-purple-500/20 to-teal-500/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-xl shadow-cyan-500/10">
        <Sparkles className="w-8 h-8 animate-pulse" />
      </div>

      <h2 className="text-xl sm:text-2xl font-display font-bold text-white mb-2">
        EngiTrace Engineering Intelligence
      </h2>
      <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto mb-8 font-sans">
        Investigate architecture, historical rationale, commit evidence, and downstream impact grounded in your repository graph.
      </p>

      {/* Active Context Card */}
      <div className="p-4 rounded-2xl bg-[#0A0E1A]/90 border border-slate-800 shadow-xl text-left mb-8 max-w-xl mx-auto space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            Active Context
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            {context.mode} Analysis
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-slate-500 block">Repository</span>
              <span className="font-semibold text-slate-200 truncate block">
                {context.repositoryName || context.repositoryId}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-slate-500 block">Target Entity</span>
              <span className="font-semibold text-slate-200 truncate block">
                {context.targetLabel || 'Repository-wide'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Starter Prompts Grid */}
      <div className="text-left max-w-2xl mx-auto space-y-3">
        <div className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>Recommended Investigation Prompts</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {suggestedQuestions.slice(0, 4).map((q, idx) => (
            <button
              key={idx}
              onClick={() => onSelectPrompt(q)}
              className="p-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/40 text-left text-xs font-mono text-slate-300 hover:text-white transition-all group flex items-start justify-between gap-2 shadow-md cursor-pointer"
            >
              <span className="line-clamp-2 leading-relaxed">{q}</span>
              <ArrowRight className="w-3.5 h-3.5 text-cyan-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

