import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { HistoricalChainStep } from '../../types/why';
import { GraphNode } from '../../types/graph';
import {
  Calendar,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  FileCode,
  ExternalLink,
  Clock,
  RefreshCw,
  Package,
  User,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

export interface HistoricalTimelineEvent {
  stepNumber?: number;
  id: string;
  title?: string;
  type?: string;
  event: string;
  classification?: string;
  timestamp?: string;
  sourceUrl?: string;
  evidence?: Array<string | any>;
  node?: GraphNode;
}

export interface HistoricalTimelineProps {
  chain?: HistoricalChainStep[];
  events?: HistoricalTimelineEvent[];
  targetNode?: GraphNode | null;
  loading?: boolean;
  emptyMessage?: string;
  onSelectEvent?: (item: HistoricalChainStep | HistoricalTimelineEvent) => void;
  compact?: boolean;
}

export const HistoricalTimeline: React.FC<HistoricalTimelineProps> = ({
  chain,
  events,
  targetNode,
  loading = false,
  emptyMessage,
  onSelectEvent,
  compact = false
}) => {
  // Normalize items from either chain or events prop
  const rawItems: HistoricalTimelineEvent[] = React.useMemo(() => {
    if (events && events.length > 0) {
      return events;
    }
    if (chain && chain.length > 0) {
      return chain.map((step) => ({
        stepNumber: step.stepNumber,
        id: step.node.id,
        title: step.node.label,
        type: step.node.type,
        event: step.event,
        classification: step.classification,
        timestamp: step.timestamp,
        sourceUrl: step.sourceUrl,
        evidence: Array.isArray(step.evidence)
          ? step.evidence.map((e) => (typeof e === 'string' ? e : e?.id || String(e)))
          : undefined,
        node: step.node
      }));
    }
    return [];
  }, [chain, events]);

  // Determine if items represent a legitimate change history vs an empty/unknown state
  const isNoHistoryState = React.useMemo(() => {
    if (rawItems.length === 0) return true;
    if (rawItems.length === 1) {
      const single = rawItems[0];
      const evLower = single.event.toLowerCase();
      if (
        evLower.includes('no historical evidence') ||
        evLower.includes('no recorded historical') ||
        evLower.includes('not found') ||
        evLower.includes('insufficient') ||
        (single.classification === 'UNKNOWN' && evLower.includes('target selected'))
      ) {
        return true;
      }
    }
    return false;
  }, [rawItems]);

  // Sort events chronologically (oldest to newest) when timestamps exist
  const sortedSteps = React.useMemo(() => {
    return [...rawItems].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeA - timeB;
    });
  }, [rawItems]);

  const getEventIcon = (type?: string) => {
    switch (type?.toUpperCase()) {
      case 'COMMIT':
        return <GitCommit className="w-3.5 h-3.5 text-blue-400" />;
      case 'PULL_REQUEST':
        return <GitPullRequest className="w-3.5 h-3.5 text-purple-400" />;
      case 'ISSUE':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
      case 'DEPENDENCY':
        return <Package className="w-3.5 h-3.5 text-pink-400" />;
      case 'AUTHOR':
        return <User className="w-3.5 h-3.5 text-sky-400" />;
      default:
        return <FileCode className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  const getCommitIdentifier = (item: HistoricalTimelineEvent) => {
    if (item.node?.metadata?.hash) {
      return String(item.node.metadata.hash).slice(0, 8);
    }
    if (item.id.startsWith('commit-') || item.id.startsWith('c-')) {
      return item.id.replace('commit-', '').replace('c-', '').slice(0, 8);
    }
    const match = item.title?.match(/#?([0-9a-f]{7,40})/i);
    if (match) return match[1].slice(0, 8);
    return null;
  };

  const content = (
    <div>
      {!compact && (
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" /> Evidence Timeline
            </h3>
            <p className="text-xs text-slate-400">
              Chronological progression of historical events recorded in engineering memory
            </p>
          </div>
          {targetNode && (
            <Badge variant="cyan" className="font-mono text-[10px]">
              {targetNode.label}
            </Badge>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center text-center">
          <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin mb-2" />
          <p className="text-xs font-mono text-slate-400">Loading chronological history...</p>
        </div>
      )}

      {/* Honest Empty State: No historical changes recorded */}
      {!loading && isNoHistoryState && (
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center">
          <Clock className="w-5 h-5 text-slate-500 mx-auto mb-2 opacity-50" />
          <p className="text-xs font-semibold text-slate-300">
            {emptyMessage || 'No Historical Events Recorded'}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
            {targetNode
              ? `No historical commits, pull requests, or chronological change events are linked to "${targetNode.label}" in the repository memory graph.`
              : 'No chronological change events recorded for this entity in the repository memory graph.'}
          </p>
        </div>
      )}

      {/* Chronological Event Progression */}
      {!loading && !isNoHistoryState && (
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {sortedSteps.map((step, idx) => {
            const commitHash = getCommitIdentifier(step);
            const isClickable = Boolean(onSelectEvent && (step.node || step.id));

            return (
              <div
                key={`${step.id}-${idx}`}
                className={`relative group ${isClickable ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (onSelectEvent) {
                    if (chain && chain[idx]) onSelectEvent(chain[idx]);
                    else onSelectEvent(step);
                  }
                }}
              >
                {/* Timeline Dot */}
                <div className="absolute -left-[23px] top-1 w-5 h-5 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center group-hover:border-cyan-500 group-hover:bg-cyan-950 transition-colors">
                  {getEventIcon(step.type)}
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-200">
                        {step.title || step.node?.label || step.id}
                      </span>
                      {step.type && (
                        <Badge variant="indigo" className="text-[10px] py-0 px-1.5">
                          {step.type}
                        </Badge>
                      )}
                      {commitHash && (
                        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1 rounded">
                          #{commitHash}
                        </span>
                      )}
                    </div>
                    {step.timestamp && (
                      <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 shrink-0">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {new Date(step.timestamp).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 font-mono mb-2 leading-relaxed">{step.event}</p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60 flex-wrap gap-2">
                    {step.classification && (
                      <span className="flex items-center gap-1">
                        <span>Classification:</span>
                        <strong className={
                          step.classification === 'FACT' ? 'text-emerald-400' :
                            step.classification === 'INFERENCE' ? 'text-purple-400' : 'text-slate-400'
                        }>
                          {step.classification}
                        </strong>
                      </span>
                    )}
                    {step.sourceUrl && (
                      <a
                        href={step.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 ml-auto"
                      >
                        <span>View Source</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (compact) {
    return content;
  }

  return (
    <GlassCard variant="glow" padding="md" className="border-indigo-500/20">
      {content}
    </GlassCard>
  );
};

export default HistoricalTimeline;
