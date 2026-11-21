import React from 'react';
import {
  GitBranch,
  FileCode,
  Layers,
  HelpCircle,
  SlidersHorizontal,
  ChevronDown,
  Box,
  GitCommit,
  AlertOctagon,
  Sparkles,
  GitPullRequest,
  AlertCircle,
  Code2,
  Network
} from 'lucide-react';
import { InvestigationContext } from '../../../types/aiAssistant';

interface InvestigationContextBarProps {
  context: InvestigationContext;
  onChangeContext: () => void;
  onBackToGraph?: () => void;
}

export const InvestigationContextBar: React.FC<InvestigationContextBarProps> = ({
  context,
  onChangeContext,
  onBackToGraph
}) => {
  const getTargetIcon = () => {
    if (!context.targetNode) {
      return <Layers className="w-4 h-4 text-purple-400" />;
    }
    switch (context.targetNode.type) {
      case 'FILE':
        return <FileCode className="w-4 h-4 text-cyan-400" />;
      case 'DEPENDENCY':
        return <Box className="w-4 h-4 text-emerald-400" />;
      case 'COMMIT':
        return <GitCommit className="w-4 h-4 text-amber-400" />;
      case 'PULL_REQUEST':
        return <GitPullRequest className="w-4 h-4 text-purple-400" />;
      case 'ISSUE':
        return <AlertCircle className="w-4 h-4 text-amber-400" />;
      case 'COMPONENT':
        return <Layers className="w-4 h-4 text-blue-400" />;
      case 'FUNCTION':
        return <Code2 className="w-4 h-4 text-teal-400" />;
      case 'DECISION':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'INCIDENT':
        return <AlertOctagon className="w-4 h-4 text-rose-400" />;
      case 'REPOSITORY':
        return <GitBranch className="w-4 h-4 text-cyan-400" />;
      default:
        return <Layers className="w-4 h-4 text-cyan-400" />;
    }
  };

  const getModeBadge = () => {
    switch (context.mode) {
      case 'WHY':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            WHY — Historical Rationale
          </span>
        );
      case 'WHAT_IF':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/30">
            WHAT IF — Impact Analysis
          </span>
        );
      case 'GENERAL':
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            GENERAL — Repo Intelligence
          </span>
        );
    }
  };

  return (
    <div className="bg-[#0A0E1A]/95 border-b border-slate-800/80 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 select-none">
      {/* 3 Horizontal Context Fields */}
      <div className="flex flex-wrap items-center gap-6 text-xs">
        {/* FIELD A: REPOSITORY */}
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
            <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
              Repository
            </span>
            <span className="font-mono font-bold text-slate-200">
              {context.repositoryName || context.repositoryId || 'Not Selected'}
            </span>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-800 hidden sm:block" />

        {/* FIELD B: INVESTIGATION TARGET */}
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
            {getTargetIcon()}
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
              Investigation Target
            </span>
            <span className="font-mono font-semibold text-slate-200 max-w-xs truncate block" title={context.targetLabel}>
              {context.targetLabel || 'Repository-wide investigation'}
            </span>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-800 hidden md:block" />

        {/* FIELD C: INVESTIGATION TOPIC */}
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
              Investigation Topic
            </span>
            <span className="font-sans font-medium text-slate-300 max-w-sm truncate block" title={context.topic}>
              {context.topic || 'Awaiting initial question...'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Active Mode & Change Context Button */}
      <div className="flex items-center gap-3">
        {getModeBadge()}

        {onBackToGraph && (
          <button
            onClick={onBackToGraph}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-xs font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Return to Engineering Graph view"
          >
            <Network className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Graph View</span>
          </button>
        )}

        <button
          onClick={onChangeContext}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/40 text-xs font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
          <span>Change Context</span>
        </button>
      </div>
    </div>
  );
};

