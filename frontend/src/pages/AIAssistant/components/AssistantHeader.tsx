import React from 'react';
import {
  Sparkles,
  Plus,
  Search,
  Command,
  PanelRight,
  ShieldCheck,
  Zap,
  Cpu,
  ArrowLeft,
  History
} from 'lucide-react';

interface AssistantHeaderProps {
  onBackToGraph: () => void;
  onNewInvestigation: () => void;
  onOpenCommandPalette: () => void;
  onToggleContextPanel: () => void;
  isContextPanelOpen: boolean;
  activeModel?: string;
  isFallback?: boolean;
  onOpenRecentInvestigations?: () => void;
  savedSessionsCount?: number;
}

export const AssistantHeader: React.FC<AssistantHeaderProps> = ({
  onBackToGraph,
  onNewInvestigation,
  onOpenCommandPalette,
  onToggleContextPanel,
  isContextPanelOpen,
  activeModel = 'gemini-3.6-flash',
  isFallback = false,
  onOpenRecentInvestigations,
  savedSessionsCount = 0
}) => {

  return (
    <header className="h-16 px-6 border-b border-slate-800/80 bg-[#070A12]/95 backdrop-blur-md flex items-center justify-between shrink-0 select-none z-20">
      {/* Left: Back to Graph + Branding & Subtitle */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBackToGraph}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-xs font-mono text-slate-300 hover:text-white transition-colors cursor-pointer mr-1"
          title="Return to Engineering Graph view"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Back to Graph</span>
        </button>

        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500/20 via-purple-500/20 to-cyan-500/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/10">
          <Sparkles className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-base text-white tracking-wide">
              EngiTrace AI Assistant
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-cyan-400" />
              {isFallback ? 'GROUNDED FALLBACK' : activeModel.toUpperCase()}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-sans hidden sm:block">
            Your contextual engineering intelligence assistant for repositories, code, changes, and decisions.
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {/* Command Palette Button */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          title="Open Command Palette (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <span>Search</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400">
            Ctrl+K
          </kbd>
        </button>

        {/* Recent Investigations Button */}
        {onOpenRecentInvestigations && (
          <button
            onClick={onOpenRecentInvestigations}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-xs font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="View saved investigation sessions"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Recent</span>
            {savedSessionsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {savedSessionsCount}
              </span>
            )}
          </button>
        )}

        {/* Toggle Right Evidence Panel (Mobile/Tablet and Desktop toggle) */}
        <button
          onClick={onToggleContextPanel}
          className={`p-2 rounded-xl border text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer ${
            isContextPanelOpen
              ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
          title="Toggle Context & Evidence Panel"
        >
          <PanelRight className="w-4 h-4" />
          <span className="hidden xl:inline text-[11px]">Context</span>
        </button>

        {/* New Investigation Button */}
        <button
          onClick={onNewInvestigation}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer hover:shadow-cyan-500/30 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>New Investigation</span>
        </button>
      </div>
    </header>
  );
};

