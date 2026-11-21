import React, { useState, useEffect } from 'react';
import {
  DecisionDebt,
  DecisionDebtAiExplanationResponse
} from '../../types/decisionDebt';
import { FrontendDecisionDebtService } from '../../services/decisionDebtService';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import {
  X,
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  ArrowUpRight,
  HelpCircle,
  Sparkles,
  CheckCircle2,
  XCircle,
  Network,
  Brain,
  FileCode,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  Package,
  Layers,
  Clock
} from 'lucide-react';

interface DecisionDebtDetailModalProps {
  debt: DecisionDebt | null;
  onClose: () => void;
  onNavigate: (route: string) => void;
}

export const DecisionDebtDetailModal: React.FC<DecisionDebtDetailModalProps> = ({
  debt,
  onClose,
  onNavigate
}) => {
  const [aiExplanation, setAiExplanation] = useState<DecisionDebtAiExplanationResponse | null>(null);
  const [loadingAi, setLoadingAi] = useState<boolean>(false);

  useEffect(() => {
    if (!debt) {
      setAiExplanation(null);
      return;
    }

    const loadAi = async () => {
      setLoadingAi(true);
      try {
        const res = await FrontendDecisionDebtService.fetchAiExplanation(debt.repositoryId, debt.targetNodeId);
        setAiExplanation(res);
      } catch (err) {
        console.error('Failed to load AI Decision Debt explanation:', err);
      } finally {
        setLoadingAi(false);
      }
    };

    loadAi();
  }, [debt]);

  if (!debt) return null;

  const levelColor =
    debt.level === 'CRITICAL' || debt.level === 'HIGH'
      ? 'rose'
      : debt.level === 'MEDIUM'
      ? 'amber'
      : debt.level === 'LOW'
      ? 'cyan'
      : 'slate';

  const levelBadgeVariant =
    debt.level === 'CRITICAL' || debt.level === 'HIGH'
      ? 'rose'
      : debt.level === 'MEDIUM'
      ? 'amber'
      : debt.level === 'LOW'
      ? 'cyan'
      : 'slate';

  const handleExploreWhy = () => {
    onClose();
    onNavigate(`/whygraph?nodeId=${encodeURIComponent(debt.targetNodeId)}&action=why`);
  };

  const handleViewGraph = () => {
    onClose();
    onNavigate(`/whygraph?nodeId=${encodeURIComponent(debt.targetNodeId)}&action=graph`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-[#070A12] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 bg-[#0A0E1A]/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-cyan-400">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold font-display text-white">{debt.targetNodeLabel}</h2>
                <Badge variant={levelBadgeVariant}>{debt.level} DEBT</Badge>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                Target Node: {debt.targetNodeId} • Type: {debt.targetNodeType}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-200 text-sm font-sans flex-1">
          
          {/* Top Score Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Score Card */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono uppercase text-slate-400 block">DEBT SCORE</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-extrabold font-mono text-white">{debt.score}</span>
                  <span className="text-xs text-slate-500 font-mono">/ 100</span>
                </div>
              </div>
              <div className={`p-3 rounded-xl bg-${levelColor}-500/10 border border-${levelColor}-500/20 text-${levelColor}-400`}>
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>

            {/* Confidence Meter */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono uppercase text-slate-400 block">ASSESSMENT CONFIDENCE</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-extrabold font-mono text-cyan-400">
                    {Math.round(debt.confidence * 100)}%
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            {/* Priority Card */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono uppercase text-slate-400 block">REVIEW PRIORITY</span>
                <div className="mt-1">
                  <Badge variant={debt.reviewPriority === 'REVIEW_FIRST' ? 'rose' : 'amber'}>
                    {debt.reviewPriority.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>

          </div>

          {/* Deterministic Explanation */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-2">
            <span className="text-xs font-mono text-cyan-400 font-semibold block uppercase tracking-wider">
              ENGINEERING REASONING ASSESSMENT
            </span>
            <p className="text-xs text-slate-300 leading-relaxed font-mono">
              {debt.explanation}
            </p>
          </div>

          {/* Detected Signals Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Detected Decision Debt Signals ({debt.signals.length})
            </h3>

            {debt.signals.length === 0 ? (
              <p className="text-xs text-slate-500 font-mono italic">No debt signals detected. Rationale trace is intact.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {debt.signals.map((sig) => (
                  <div
                    key={sig.id}
                    className="p-3.5 rounded-xl bg-[#090D1A] border border-slate-800/90 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-mono">{sig.title}</span>
                        <Badge variant={sig.severity === 'HIGH' ? 'rose' : 'amber'}>{sig.severity}</Badge>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        Confidence: {Math.round(sig.confidence * 100)}%
                      </span>
                    </div>

                    <p className="text-xs text-slate-300">{sig.description}</p>

                    {sig.evidenceIds && sig.evidenceIds.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10px] font-mono text-slate-500">Linked Evidence:</span>
                        {sig.evidenceIds.map((evId) => (
                          <span
                            key={evId}
                            className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 font-mono text-[10px] text-cyan-300"
                          >
                            {evId}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evidence Checklist */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Decision Evidence Checklist
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              
              <ChecklistItem
                label="Commit Evidence"
                checked={debt.evidenceChecklist.commitEvidence}
                icon={<GitCommit className="w-3.5 h-3.5" />}
              />
              <ChecklistItem
                label="Pull Request"
                checked={debt.evidenceChecklist.pullRequestEvidence}
                icon={<GitPullRequest className="w-3.5 h-3.5" />}
              />
              <ChecklistItem
                label="Issue Tracking"
                checked={debt.evidenceChecklist.issueEvidence}
                icon={<AlertCircle className="w-3.5 h-3.5" />}
              />
              <ChecklistItem
                label="Explicit Rationale"
                checked={debt.evidenceChecklist.explicitRationale}
                icon={<FileCode className="w-3.5 h-3.5" />}
              />
              <ChecklistItem
                label="Incident / Fix Record"
                checked={debt.evidenceChecklist.incidentEvidence}
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
              />
              <ChecklistItem
                label="Recent Validation"
                checked={debt.evidenceChecklist.recentValidation}
                icon={<Clock className="w-3.5 h-3.5" />}
              />

            </div>
          </div>

          {/* AI Grounded Explanation Section */}
          <div className="p-4 rounded-xl bg-gradient-to-b from-cyan-950/20 to-slate-900/60 border border-cyan-500/20 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-400">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider">
                  AI DECISION GROUNDING (GEMINI 2.5)
                </span>
              </div>
              {aiExplanation?.isAiFallback && (
                <span className="text-[10px] font-mono text-slate-500">Local Grounded Engine</span>
              )}
            </div>

            {loadingAi ? (
              <div className="flex items-center gap-3 py-4 text-xs font-mono text-slate-400">
                <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                Reasoning over evidence signals...
              </div>
            ) : aiExplanation ? (
              <div className="space-y-3 text-xs">
                <p className="text-slate-200 leading-relaxed font-sans">{aiExplanation.summary}</p>

                {aiExplanation.groundedClaims && aiExplanation.groundedClaims.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
                      GROUNDED CLAIMS
                    </span>
                    {aiExplanation.groundedClaims.map((claim, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-2 rounded bg-slate-900/90 border border-slate-800">
                        <Badge variant={claim.classification === 'FACT' ? 'cyan' : 'amber'}>
                          {claim.classification}
                        </Badge>
                        <span className="text-[11px] text-slate-300 leading-snug">{claim.claim}</span>
                      </div>
                    ))}
                  </div>
                )}

                {aiExplanation.recommendedActions && aiExplanation.recommendedActions.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[10px] font-mono uppercase text-cyan-400 block font-bold">
                      RECOMMENDED REVIEW ACTIONS
                    </span>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300 font-mono">
                      {aiExplanation.recommendedActions.map((action, idx) => (
                        <li key={idx}>{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800/80 bg-[#0A0E1A]/90 flex items-center justify-between shrink-0">
          <div className="text-xs font-mono text-slate-400">
            Node ID: <span className="text-slate-200 font-bold">{debt.targetNodeId}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleViewGraph}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-mono font-semibold flex items-center gap-2 transition-all"
            >
              <Network className="w-3.5 h-3.5 text-cyan-400" />
              View Graph
            </button>

            <button
              onClick={handleExploreWhy}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
            >
              <Brain className="w-3.5 h-3.5" />
              Explore WHY
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

const ChecklistItem: React.FC<{ label: string; checked: boolean; icon: React.ReactNode }> = ({
  label,
  checked,
  icon
}) => {
  return (
    <div
      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono ${
        checked
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          : 'bg-slate-900/60 border-slate-800/80 text-slate-500'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={checked ? 'text-emerald-400' : 'text-slate-500'}>{icon}</span>
        <span className="text-[11px] font-semibold">{label}</span>
      </div>
      {checked ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-slate-600" />}
    </div>
  );
};
