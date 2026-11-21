import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { HistoricalChainStep } from '../../types/why';
import {
  FileCode,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  Package,
  User,
  ShieldCheck,
  Zap,
  HelpCircle,
  ArrowRight,
  ExternalLink,
  Search,
  CheckCircle2
} from 'lucide-react';

interface HistoricalChainVisualizerProps {
  chain: HistoricalChainStep[];
  activeStepNumber?: number;
  onSelectStep?: (step: HistoricalChainStep) => void;
  onInspectEvidence?: (evidenceItem: any) => void;
}

export const HistoricalChainVisualizer: React.FC<HistoricalChainVisualizerProps> = ({
  chain,
  activeStepNumber,
  onSelectStep,
  onInspectEvidence
}) => {
  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'FILE':
        return <FileCode className="w-4 h-4 text-emerald-400" />;
      case 'COMMIT':
        return <GitCommit className="w-4 h-4 text-blue-400" />;
      case 'PULL_REQUEST':
        return <GitPullRequest className="w-4 h-4 text-purple-400" />;
      case 'ISSUE':
        return <AlertCircle className="w-4 h-4 text-amber-400" />;
      case 'DEPENDENCY':
        return <Package className="w-4 h-4 text-pink-400" />;
      case 'AUTHOR':
        return <User className="w-4 h-4 text-sky-400" />;
      default:
        return <FileCode className="w-4 h-4 text-indigo-400" />;
    }
  };

  const getClassificationBadge = (cls: string) => {
    switch (cls) {
      case 'FACT':
        return (
          <Badge variant="emerald" className="text-[10px] px-2 py-0.5 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> FACT
          </Badge>
        );
      case 'INFERENCE':
        return (
          <Badge variant="amber" className="text-[10px] px-2 py-0.5 flex items-center gap-1">
            <Zap className="w-3 h-3" /> INFERENCE
          </Badge>
        );
      case 'UNKNOWN':
      default:
        return (
          <Badge variant="slate" className="text-[10px] px-2 py-0.5 flex items-center gap-1">
            <HelpCircle className="w-3 h-3" /> UNKNOWN
          </Badge>
        );
    }
  };

  return (
    <GlassCard variant="glow" padding="md" className="border-indigo-500/20">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-400" /> Reconstructed Historical Chain
          </h3>
          <p className="text-xs text-slate-400">
            Deterministic backward path traced through Engineering Memory Graph
          </p>
        </div>
        <span className="text-xs font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full">
          {chain.length} Sequence Steps
        </span>
      </div>

      <div className="space-y-3">
        {chain.map((step, index) => {
          const isLast = index === chain.length - 1;
          const isActive = activeStepNumber === step.stepNumber;

          return (
            <div key={`${step.node.id}-${index}`} className="relative">
              {/* Step Card */}
              <div
                onClick={() => onSelectStep && onSelectStep(step)}
                className={`group relative flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-950/60 border-indigo-500/60 shadow-lg shadow-indigo-950/50'
                    : 'bg-slate-900/60 border-slate-800 hover:border-indigo-500/30 hover:bg-slate-900/90'
                }`}
              >
                {/* Step Number Circle */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border shadow-md ${
                    step.relationship === 'TARGET'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  }`}
                >
                  {step.stepNumber}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 truncate">
                      {getNodeIcon(step.node.type)}
                      <span className="text-xs font-bold text-slate-200 truncate">
                        {step.node.label}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
                        {step.node.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {getClassificationBadge(step.classification)}
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 mb-2 leading-relaxed font-mono">
                    {step.event}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
                    <span className="truncate">Relationship: <strong className="text-indigo-300">{step.relationship}</strong></span>
                    {step.timestamp && (
                      <span className="font-mono text-slate-400">{new Date(step.timestamp).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                {/* Inspect Action */}
                <div className="flex flex-col gap-1.5 shrink-0 self-center">
                  {step.sourceUrl && (
                    <a
                      href={step.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors"
                      title="Open GitHub Source"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {onInspectEvidence && step.evidence && step.evidence.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectEvidence(step);
                      }}
                      className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition-colors"
                      title="Inspect Traceable Evidence"
                    >
                      <Search className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Connecting Connector Line */}
              {!isLast && (
                <div className="flex justify-center py-1">
                  <div className="w-0.5 h-4 bg-gradient-to-b from-indigo-500/50 to-slate-800" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};
