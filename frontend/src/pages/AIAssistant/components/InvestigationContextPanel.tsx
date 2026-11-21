import React from 'react';
import {
  Layers,
  GitBranch,
  FileCode,
  HelpCircle,
  SlidersHorizontal,
  Box,
  GitCommit,
  Sparkles,
  AlertOctagon,
  GitPullRequest,
  AlertCircle,
  Code2,
  Network
} from 'lucide-react';
import { InvestigationContext } from '../../../types/aiAssistant';

interface InvestigationContextPanelProps {
  context: InvestigationContext;
  onChangeContext: () => void;
  onBackToGraph?: () => void;
}

export const InvestigationContextPanel: React.FC<InvestigationContextPanelProps> = ({
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

  const getModeLabel = () => {
    switch (context.mode) {
      case 'WHY':
        return 'WHY — Historical Rationale';
      case 'WHAT_IF':
        return 'WHAT IF — Impact Analysis';
      case 'GENERAL':
      default:
        return 'GENERAL — Repository Intelligence';
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-[#0A0E1A]/95 border border-slate-800 shadow-xl space-y-3 font-mono text-xs select-none">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <h3 className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>Investigation Context</span>
        </h3>
        <button
          onClick={onChangeContext}
          className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer transition-colors"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>Change</span>
        </button>
      </div>

      <div className="space-y-2.5">
        {/* Repository */}
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
            Repository
          </span>
          <div className="flex items-center gap-2 mt-0.5 text-slate-200">
            <GitBranch className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="font-semibold truncate">
              {context.repositoryName || context.repositoryId || 'None'}
            </span>
          </div>
        </div>

        {/* Target Entity */}
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
            Target Entity
          </span>
          <div className="flex items-center gap-2 mt-0.5 text-slate-200">
            {getTargetIcon()}
            <span className="font-semibold truncate" title={context.targetLabel}>
              {context.targetLabel || 'Repository-wide investigation'}
            </span>
          </div>
        </div>

        {/* Investigation Topic */}
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
            Investigation Topic
          </span>
          <div className="flex items-center gap-2 mt-0.5 text-slate-300 font-sans text-xs">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="line-clamp-2" title={context.topic}>
              {context.topic || 'Awaiting initial question...'}
            </span>
          </div>
        </div>

        {/* Active Mode */}
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
            Active Mode
          </span>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            context.mode === 'WHY'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : context.mode === 'WHAT_IF'
              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
          }`}>
            {getModeLabel()}
          </span>
        </div>

        {onBackToGraph && (
          <div className="pt-2 border-t border-slate-800/80">
            <button
              onClick={onBackToGraph}
              className="w-full py-2 px-3 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/40 text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Network className="w-3.5 h-3.5 text-purple-400" />
              <span>View Selected Node in Graph</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

