import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { ImpactResult, ImpactAiExplanationResponse } from '../../types/impact';
import { GraphNode } from '../../types/graph';
import {
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Bot,
  HelpCircle,
  FileCode,
  Layers,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Zap,
  Clock
} from 'lucide-react';

interface ImpactResultPanelProps {
  impact: ImpactResult;
  aiExplanation?: ImpactAiExplanationResponse | null;
  isAiAnalyzing?: boolean;
  onExecuteAiExplanation?: () => void;
  onSelectNode?: (node: GraphNode) => void;
  onInspectWhy?: (node: GraphNode) => void;
  onInspectEvidence?: (evidenceId: string) => void;
}

export const ImpactResultPanel: React.FC<ImpactResultPanelProps> = ({
  impact,
  aiExplanation,
  isAiAnalyzing = false,
  onExecuteAiExplanation,
  onSelectNode,
  onInspectWhy,
  onInspectEvidence
}) => {
  const [showConfidenceReasons, setShowConfidenceReasons] = useState<boolean>(false);
  const [activeCategoryTab, setActiveCategoryTab] = useState<'ALL' | 'DIRECT' | 'INDIRECT' | 'APIS' | 'TESTS'>('ALL');

  const { target, operation, impactLevel, impactScore, confidence, categoryCounts, summary, warnings, evidence } = impact;

  const getImpactBadgeVariant = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'rose';
      case 'HIGH':
        return 'rose';
      case 'MEDIUM':
        return 'amber';
      case 'LOW':
        return 'emerald';
      default:
        return 'cyan';
    }
  };

  // Filter affected list based on active tab
  const getFilteredNodes = (): GraphNode[] => {
    switch (activeCategoryTab) {
      case 'DIRECT':
        return impact.directImpact;
      case 'INDIRECT':
        return impact.indirectImpact;
      case 'APIS':
        return impact.affectedAPIs;
      case 'TESTS':
        return impact.affectedTests;
      case 'ALL':
      default:
        return [...impact.directImpact, ...impact.indirectImpact];
    }
  };

  const filteredNodes = getFilteredNodes();

  return (
    <div className="space-y-4 font-sans animate-in fade-in duration-200">
      {/* Header Impact Summary Banner */}
      <GlassCard
        variant="glow"
        padding="md"
        className="border-rose-500/30 bg-gradient-to-r from-slate-950/90 via-slate-900/90 to-rose-950/20"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="rose" className="text-[10px] uppercase font-bold tracking-wider">
                WHAT-IF IMPACT ASSESSMENT
              </Badge>
              <span className="text-xs font-mono text-slate-400">Target: {target.label}</span>
            </div>
            <h2 className="text-lg font-bold text-white font-display flex items-center gap-2">
              <span>WHAT IF {target.label.toUpperCase()} IS {operation === 'REMOVE' ? 'REMOVED' : 'CHANGED'}?</span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Impact Level Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Impact:</span>
              <Badge variant={getImpactBadgeVariant(impactLevel)} className="font-mono font-bold text-xs">
                {impactLevel} ({impactScore}/100)
              </Badge>
            </div>

            {/* Confidence Score Dropdown */}
            <button
              onClick={() => setShowConfidenceReasons(!showConfidenceReasons)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold font-mono transition ${
                confidence.rating === 'HIGH'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : confidence.rating === 'MEDIUM'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Conf: {confidence.rating} ({Math.round(confidence.score * 100)}%)</span>
              {showConfidenceReasons ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Explainable Confidence Dropdown Details */}
        {showConfidenceReasons && (
          <div className="mb-3 p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs space-y-1 animate-in fade-in duration-150">
            <div className="font-bold text-slate-200 border-b border-slate-800 pb-1 mb-1 font-display">
              Confidence Scoring Rationale
            </div>
            {confidence.reasons.map((reason, idx) => (
              <div key={idx} className="text-slate-300 font-mono text-[11px] leading-tight">
                • {reason}
              </div>
            ))}
          </div>
        )}

        {/* Synthesis Text Box */}
        <p className="text-xs text-slate-200 leading-relaxed font-sans bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
          {summary}
        </p>

        {/* Warnings Banner if incomplete graph */}
        {warnings.length > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-400">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>⚠ IMPACT MAY BE INCOMPLETE</span>
            </div>
            {warnings.map((warn, i) => (
              <p key={i} className="text-[11px] text-amber-200 leading-tight">
                {warn}
              </p>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Category Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs">
        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-rose-500/30 text-center">
          <div className="text-lg font-bold text-rose-400">{categoryCounts.directCount}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Direct</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-amber-500/30 text-center">
          <div className="text-lg font-bold text-amber-400">{categoryCounts.indirectCount}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Indirect</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-center">
          <div className="text-lg font-bold text-cyan-400">{categoryCounts.apiCount}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">APIs</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-center">
          <div className="text-lg font-bold text-emerald-400">{categoryCounts.testCount}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Tests</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-purple-500/30 text-center col-span-2 sm:col-span-1">
          <div className="text-lg font-bold text-purple-400">{categoryCounts.dependencyCount}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Deps</div>
        </div>
      </div>

      {/* Filterable Affected Components List Header */}
      <GlassCard padding="md" className="border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
          <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>Affected Components ({filteredNodes.length})</span>
          </h3>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <button
              onClick={() => setActiveCategoryTab('ALL')}
              className={`px-2.5 py-1 rounded-lg transition ${
                activeCategoryTab === 'ALL'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              All ({impact.directImpact.length + impact.indirectImpact.length})
            </button>

            <button
              onClick={() => setActiveCategoryTab('DIRECT')}
              className={`px-2.5 py-1 rounded-lg transition ${
                activeCategoryTab === 'DIRECT'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Direct ({impact.directImpact.length})
            </button>

            <button
              onClick={() => setActiveCategoryTab('INDIRECT')}
              className={`px-2.5 py-1 rounded-lg transition ${
                activeCategoryTab === 'INDIRECT'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Indirect ({impact.indirectImpact.length})
            </button>

            {impact.affectedAPIs.length > 0 && (
              <button
                onClick={() => setActiveCategoryTab('APIS')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeCategoryTab === 'APIS'
                    ? 'bg-cyan-600 text-white font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                APIs ({impact.affectedAPIs.length})
              </button>
            )}

            {impact.affectedTests.length > 0 && (
              <button
                onClick={() => setActiveCategoryTab('TESTS')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeCategoryTab === 'TESTS'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Tests ({impact.affectedTests.length})
              </button>
            )}
          </div>
        </div>

        {/* List of Affected Components */}
        {filteredNodes.length > 0 ? (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {filteredNodes.map((node) => {
              const isDirect = impact.directImpact.some((d) => d.id === node.id);
              const relatedEv = evidence.find((e) => e.sourceId === node.id || e.targetId === node.id);

              return (
                <div
                  key={node.id}
                  className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs font-mono transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Badge variant={isDirect ? 'rose' : 'amber'} className="text-[9px] py-0 px-1.5 font-mono shrink-0">
                      {isDirect ? 'DIRECT' : 'INDIRECT'}
                    </Badge>

                    <div className="min-w-0">
                      <div className="font-bold text-slate-100 truncate flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>{node.label}</span>
                      </div>
                      {node.sublabel && (
                        <div className="text-[10px] text-slate-400 truncate">{node.sublabel}</div>
                      )}
                    </div>
                  </div>

                  {/* Interoperability Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {relatedEv && onInspectEvidence && (
                      <button
                        onClick={() => onInspectEvidence(relatedEv.id)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono border border-slate-700 transition flex items-center gap-1"
                      >
                        <Info className="w-3 h-3 text-cyan-400" />
                        <span>Evidence</span>
                      </button>
                    )}

                    {onInspectWhy && (
                      <button
                        onClick={() => onInspectWhy(node)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[11px] font-mono border border-cyan-500/30 transition flex items-center gap-1 font-bold"
                      >
                        <span>WHY THIS IS AFFECTED</span>
                        <ArrowRight className="w-3 h-3 text-cyan-400" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-slate-500 text-xs font-mono">
            No components match the selected filter category.
          </div>
        )}
      </GlassCard>

      {/* Grounded AI Explanation Section */}
      <GlassCard padding="md" className="border-cyan-500/20 bg-slate-950/80 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider">
              AI Grounded Explanation
            </h3>
          </div>

          {onExecuteAiExplanation && (
            <button
              onClick={onExecuteAiExplanation}
              disabled={isAiAnalyzing}
              className="px-3 py-1 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-cyan-600/30 transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
              <span>{isAiAnalyzing ? 'Generating Explanation...' : 'REASON WITH EVIDENCE'}</span>
            </button>
          )}
        </div>

        {isAiAnalyzing ? (
          <div className="py-6 text-center text-xs font-mono text-cyan-300 animate-pulse space-y-2">
            <Zap className="w-6 h-6 mx-auto text-cyan-400 animate-spin" />
            <p>Reasoning over graph evidence and impact boundaries...</p>
          </div>
        ) : aiExplanation ? (
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 leading-relaxed font-sans">
              <strong className="text-cyan-300 font-mono block mb-1">Executive Impact Analysis:</strong>
              {aiExplanation.summary}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-rose-500/20">
                <div className="font-bold text-rose-300 mb-1">Direct Impact Context:</div>
                <div className="text-slate-300 leading-normal">{aiExplanation.directImpactExplanation}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-amber-500/20">
                <div className="font-bold text-amber-300 mb-1">Downstream Risk Assessment:</div>
                <div className="text-slate-300 leading-normal">{aiExplanation.riskAssessment}</div>
              </div>
            </div>

            {/* Actionable Recommended Mitigations */}
            {aiExplanation.recommendedMitigations && aiExplanation.recommendedMitigations.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 font-mono text-xs">
                <div className="font-bold text-cyan-300">Recommended Architectural Mitigations:</div>
                {aiExplanation.recommendedMitigations.map((mit, i) => (
                  <div key={i} className="text-slate-300 flex items-start gap-2 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{mit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-4 text-slate-400 text-xs font-mono">
            Deterministic impact analysis is complete above. Click <strong className="text-cyan-400">REASON WITH EVIDENCE</strong> for an AI-generated architectural explanation.
          </div>
        )}
      </GlassCard>
    </div>
  );
};
