import React, { useState, useEffect } from 'react';
import { GlassCard } from './GlassCard';
import { Badge } from './Badge';
import { Button } from './Button';
import { GraphNode } from '../../types/graph';
import { WhyResult } from '../../types/why';
import { ImpactResult } from '../../types/impact';
import { DecisionDebt } from '../../types/decisionDebt';
import { WhyService } from '../../services/whyService';
import { ImpactService } from '../../services/impactService';
import { FrontendDecisionDebtService } from '../../services/decisionDebtService';
import { ActiveRepositoryService } from '../../services/activeRepositoryService';
import {
  X,
  Network,
  Zap,
  AlertTriangle,
  FileCode,
  GitBranch,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  Layers,
  Info
} from 'lucide-react';

interface NodeInvestigationModalProps {
  node: GraphNode | null;
  repositoryId?: string;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: string) => void;
}

export const NodeInvestigationModal: React.FC<NodeInvestigationModalProps> = ({
  node,
  repositoryId = 'default',
  isOpen,
  onClose,
  onNavigate
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'WHY' | 'WHAT_IF' | 'DECISION_DEBT'>('OVERVIEW');
  const [whyLoading, setWhyLoading] = useState(false);
  const [whyResult, setWhyResult] = useState<WhyResult | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtResult, setDebtResult] = useState<DecisionDebt | null>(null);

  useEffect(() => {
    if (!node || !isOpen) return;

    // Reset tab to overview on new node
    setActiveTab('OVERVIEW');
    setWhyResult(null);
    setImpactResult(null);
    setDebtResult(null);

    const activeRepoId = repositoryId && repositoryId !== 'default' ? repositoryId : (ActiveRepositoryService.getActiveRepoId() || 'demo-repo');

    // Preload node debt assessment if node has debt score or is COMPONENT/FILE
    const loadNodeData = async () => {
      setDebtLoading(true);
      try {
        const debt = await FrontendDecisionDebtService.fetchComponentDebt(activeRepoId, node.id);
        setDebtResult(debt);
      } catch {
        // quiet error handle
      } finally {
        setDebtLoading(false);
      }
    };

    loadNodeData();
  }, [node, isOpen, repositoryId]);

  if (!isOpen || !node) return null;

  const activeRepoId = repositoryId && repositoryId !== 'default' ? repositoryId : (ActiveRepositoryService.getActiveRepoId() || 'demo-repo');

  const handleFetchWhy = async () => {
    setActiveTab('WHY');
    if (whyLoading) return;
    setWhyLoading(true);
    try {
      const res = await WhyService.executeWhyQuery(activeRepoId, node.id);
      setWhyResult(res);
      const aiRes = await WhyService.executeAiReasoning(activeRepoId, node.id);
      if (aiRes) {
        setWhyResult((prev) => prev ? { ...prev, summary: aiRes.summary } : prev);
      }
    } catch (err) {
      console.warn('[NodeInvestigationModal] Error fetching WHY:', err);
    } finally {
      setWhyLoading(false);
    }
  };

  const handleFetchImpact = async () => {
    setActiveTab('WHAT_IF');
    if (impactLoading) return;
    setImpactLoading(true);
    try {
      const res = await ImpactService.executeImpactQuery(activeRepoId, node.id, 'REMOVE');
      setImpactResult(res);
      const aiRes = await ImpactService.executeAiExplanation(activeRepoId, node.id);
      if (aiRes) {
        setImpactResult((prev) => prev ? { ...prev, summary: aiRes.summary } : prev);
      }
    } catch (err) {
      console.warn('[NodeInvestigationModal] Error analyzing impact:', err);
    } finally {
      setImpactLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="w-full max-w-4xl max-h-[90vh] bg-[#070A12] border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="cyan">{node.type}</Badge>
                {node.metadata?.severity && (
                  <Badge variant={node.metadata.severity === 'CRITICAL' ? 'rose' : 'amber'}>
                    {node.metadata.severity} SEVERITY
                  </Badge>
                )}
              </div>
              <h2 className="text-lg font-bold font-display text-white mt-1">{node.label}</h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Interaction Actions Bar */}
        <div className="px-6 py-3 border-b border-slate-800/80 bg-[#05070C] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all ${activeTab === 'OVERVIEW'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              Metadata & Overview
            </button>
            <button
              onClick={handleFetchWhy}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all ${activeTab === 'WHY'
                  ? 'bg-cyan-500/20 text-cyan-400 font-semibold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-cyan-400'
                }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>WHY Explorer</span>
            </button>
            <button
              onClick={handleFetchImpact}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all ${activeTab === 'WHAT_IF'
                  ? 'bg-purple-500/20 text-purple-400 font-semibold border border-purple-500/40'
                  : 'text-slate-400 hover:text-purple-400'
                }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>WHAT IF Impact</span>
            </button>
            <button
              onClick={() => setActiveTab('DECISION_DEBT')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all ${activeTab === 'DECISION_DEBT'
                  ? 'bg-rose-500/20 text-rose-400 font-semibold border border-rose-500/40'
                  : 'text-slate-400 hover:text-rose-400'
                }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Decision Debt</span>
              {debtResult && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/20 text-rose-300">
                  {debtResult.score}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<ExternalLink className="w-3.5 h-3.5" />}
              onClick={() => {
                onClose();
                onNavigate('/whygraph');
              }}
            >
              Full Graph
            </Button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* OVERVIEW TAB */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6 font-mono text-xs">
              <GlassCard glow="cyan" className="p-4 space-y-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Info className="w-4 h-4 text-cyan-400" />
                  <span>Component Details</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300">
                  <div><span className="text-slate-500">ID:</span> {node.id}</div>
                  <div><span className="text-slate-500">Type:</span> {node.type}</div>
                  <div><span className="text-slate-500">Source:</span> {node.sourceReference || 'Ingested Git AST'}</div>
                  <div><span className="text-slate-500">Created:</span> {node.createdAt || 'Initial commit'}</div>
                </div>
              </GlassCard>

              {node.metadata && Object.keys(node.metadata).length > 0 && (
                <GlassCard glow="none" className="p-4 space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase">Node Metadata</h4>
                  <pre className="text-[11px] text-cyan-300 bg-slate-900/80 p-3 rounded-xl overflow-x-auto">
                    {JSON.stringify(node.metadata, null, 2)}
                  </pre>
                </GlassCard>
              )}

              {/* Quick Launch Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <button
                  onClick={handleFetchWhy}
                  className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:border-cyan-400 text-left transition-all group"
                >
                  <Network className="w-5 h-5 text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
                  <h4 className="font-bold text-white text-sm">Why does this exist?</h4>
                  <p className="text-[11px] text-slate-400 mt-1">Reconstruct historical rationale & ground truth chain.</p>
                </button>

                <button
                  onClick={handleFetchImpact}
                  className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 hover:border-purple-400 text-left transition-all group"
                >
                  <Zap className="w-5 h-5 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                  <h4 className="font-bold text-white text-sm">What if removed?</h4>
                  <p className="text-[11px] text-slate-400 mt-1">Calculate direct & indirect downstream impact.</p>
                </button>

                <button
                  onClick={() => setActiveTab('DECISION_DEBT')}
                  className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:border-rose-400 text-left transition-all group"
                >
                  <AlertTriangle className="w-5 h-5 text-rose-400 mb-2 group-hover:scale-110 transition-transform" />
                  <h4 className="font-bold text-white text-sm">Decision Debt Audit</h4>
                  <p className="text-[11px] text-slate-400 mt-1">Check missing context & architectural drift signals.</p>
                </button>
              </div>
            </div>
          )}

          {/* WHY TAB */}
          {activeTab === 'WHY' && (
            <div className="space-y-5 font-mono text-xs">
              {whyLoading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="w-8 h-8 text-cyan-400 mx-auto animate-spin mb-3" />
                  <p className="text-slate-300">Reconstructing historical evidence chain for {node.label}...</p>
                </div>
              ) : whyResult ? (
                <>
                  <GlassCard glow="cyan" className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="cyan">WHY ANALYSIS</Badge>
                      <span className="text-slate-400">Confidence: {whyResult.confidence.score * 100}%</span>
                    </div>
                    <h3 className="text-base font-bold text-white">{whyResult.question}</h3>
                    <p className="text-slate-300 leading-relaxed font-sans text-sm">{whyResult.summary}</p>
                  </GlassCard>

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase text-slate-400">Historical Chain ({whyResult.historicalChain.length} events)</h4>
                    {whyResult.historicalChain.map((step) => (
                      <div key={step.stepNumber} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="font-bold text-cyan-400">Step {step.stepNumber}: {step.event}</span>
                          <span className="text-[10px]">{step.classification}</span>
                        </div>
                        <p className="text-slate-300 text-xs font-sans">{step.relationship}</p>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 text-right">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        onClose();
                        onNavigate('/whygraph');
                      }}
                    >
                      Open Full WHY Explorer →
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-slate-400">
                  <p>Click below to construct historical reasoning for this component.</p>
                  <Button variant="primary" size="sm" className="mt-4" onClick={handleFetchWhy}>
                    Run WHY Analysis
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* WHAT-IF TAB */}
          {activeTab === 'WHAT_IF' && (
            <div className="space-y-5 font-mono text-xs">
              {impactLoading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="w-8 h-8 text-purple-400 mx-auto animate-spin mb-3" />
                  <p className="text-slate-300">Traversing dependency graph & calculating downstream impact...</p>
                </div>
              ) : impactResult ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <GlassCard glow="purple" className="p-4">
                      <div className="text-slate-400 text-[10px]">IMPACT LEVEL</div>
                      <div className="text-xl font-bold text-white mt-1">{impactResult.impactLevel}</div>
                      <div className="text-purple-400 text-[11px] mt-0.5">Score: {impactResult.impactScore}/100</div>
                    </GlassCard>

                    <GlassCard glow="cyan" className="p-4">
                      <div className="text-slate-400 text-[10px]">DIRECT DEPENDENTS</div>
                      <div className="text-xl font-bold text-cyan-400 mt-1">{impactResult.directImpact.length}</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Immediate callers</div>
                    </GlassCard>

                    <GlassCard glow="emerald" className="p-4">
                      <div className="text-slate-400 text-[10px]">INDIRECT DEPENDENTS</div>
                      <div className="text-xl font-bold text-emerald-400 mt-1">{impactResult.indirectImpact.length}</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Cascade impact</div>
                    </GlassCard>
                  </div>

                  <GlassCard glow="purple" className="p-5 space-y-2 font-sans text-sm text-slate-200">
                    <h4 className="font-mono text-xs font-bold text-purple-400 uppercase">Impact Assessment Summary</h4>
                    <p>{impactResult.summary}</p>
                  </GlassCard>

                  <div className="pt-2 text-right">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        onClose();
                        onNavigate('/whygraph?view=dependencies');
                      }}
                    >
                      Open Impact Lineage →
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-slate-400">
                  <p>Calculate impact if this node is modified or removed.</p>
                  <Button variant="primary" size="sm" className="mt-4" onClick={handleFetchImpact}>
                    Analyze WHAT IF Impact
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* DECISION DEBT TAB */}
          {activeTab === 'DECISION_DEBT' && (
            <div className="space-y-5 font-mono text-xs">
              {debtLoading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="w-8 h-8 text-rose-400 mx-auto animate-spin mb-3" />
                  <p className="text-slate-300">Auditing missing context and architectural drift signals...</p>
                </div>
              ) : debtResult ? (
                <>
                  <GlassCard glow={debtResult.score > 70 ? 'rose' : 'purple'} className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={debtResult.score > 70 ? 'rose' : 'amber'}>
                        DEBT SCORE {debtResult.score} / 100 ({debtResult.level})
                      </Badge>
                      <span className="text-slate-400 text-[11px]">
                        Last Rationale: {debtResult.lastRationaleDate || 'Undocumented'}
                      </span>
                    </div>
                    <p className="text-slate-200 font-sans text-sm">{debtResult.explanation}</p>
                  </GlassCard>

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase text-slate-400">Active Debt Signals ({debtResult.signals.length})</h4>
                    {debtResult.signals.map((sig) => (
                      <div key={sig.id} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-400">{sig.title}</span>
                          <span className="text-[10px] text-slate-500">{sig.type}</span>
                        </div>
                        <p className="text-slate-300 text-xs font-sans">{sig.description}</p>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 text-right">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        onClose();
                        onNavigate('/decision-debt');
                      }}
                    >
                      Open Decision Debt Center →
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-slate-400">
                  <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p>No critical decision debt recorded for this component.</p>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
