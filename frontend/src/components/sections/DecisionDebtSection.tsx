import React, { useState, useEffect } from 'react';
import { SectionHeader } from '../ui/SectionHeader';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import {
  DecisionDebt,
  RepositoryDecisionDebtSummary
} from '../../types/decisionDebt';
import { FrontendDecisionDebtService } from '../../services/decisionDebtService';
import { DecisionDebtDetailModal } from '../decision-debt/DecisionDebtDetailModal';
import {
  AlertTriangle,
  TrendingUp,
  ShieldAlert,
  ArrowUpRight,
  Search,
  Filter,
  Brain,
  Network,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Layers,
  Clock,
  RefreshCw,
  FileCode
} from 'lucide-react';

interface DecisionDebtSectionProps {
  onNavigate?: (route: string) => void;
}

export const DecisionDebtSection: React.FC<DecisionDebtSectionProps> = ({ onNavigate }) => {
  const [repoSummary, setRepoSummary] = useState<RepositoryDecisionDebtSummary | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<DecisionDebt | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');

  const activeRepoId = 'codeorigin/engine';

  useEffect(() => {
    const loadRepoDebt = async () => {
      setLoading(true);
      try {
        const data = await FrontendDecisionDebtService.fetchRepositoryDebt(activeRepoId);
        setRepoSummary(data);
      } catch (err) {
        console.error('Failed to load Decision Debt metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRepoDebt();
  }, []);

  const components = repoSummary?.topDebtComponents || [];

  const filteredComponents = components.filter((c) => {
    const matchesSearch =
      c.targetNodeLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.targetNodeId.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLevel = levelFilter === 'ALL' || c.level === levelFilter;
    return matchesSearch && matchesLevel;
  });

  const handleNavigate = (route: string) => {
    if (onNavigate) {
      onNavigate(route);
    } else {
      window.location.href = route;
    }
  };

  return (
    <section id="decision-debt" className="py-8 relative bg-[#070A12]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest block mb-1">
              ENGINEERING REASONING RISK INTELLIGENCE
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold font-display text-white">
              Decisions Age. EngiTrace Finds the Debt.
            </h2>
            <p className="text-sm font-mono text-slate-400 mt-1 max-w-2xl">
              EngiTrace quantifies lost, missing, or stale engineering reasoning to prevent outages caused by forgotten architectural assumptions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleNavigate('/whygraph')}
              className="px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-bold flex items-center gap-2 hover:bg-cyan-500/20 transition-all"
            >
              <Brain className="w-4 h-4" />
              WHY Explorer
            </button>
            <button
              onClick={() => handleNavigate('/whygraph')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs font-bold flex items-center gap-2 hover:bg-slate-700 transition-all"
            >
              <Network className="w-4 h-4 text-cyan-400" />
              Memory Graph
            </button>
          </div>
        </div>

        {/* Executive Metric Cards */}
        {repoSummary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Repo Debt Score */}
            <GlassCard glow={repoSummary.overallLevel === 'HIGH' ? 'rose' : 'amber'} className="p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-slate-400">REPOSITORY DEBT</span>
                <Badge variant={repoSummary.overallLevel === 'HIGH' ? 'rose' : 'amber'}>
                  {repoSummary.overallLevel}
                </Badge>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold font-mono text-white">
                  {repoSummary.overallScore}
                </span>
                <span className="text-xs font-mono text-slate-500">/ 100</span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-2">
                Across {repoSummary.totalComponents} analyzed key components
              </p>
            </GlassCard>

            {/* Debt Breakdown Counts */}
            <GlassCard glow="cyan" className="p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-slate-400">DEBT BREAKDOWN</span>
                <ShieldAlert className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-3 flex items-center gap-2 font-mono">
                <div className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold">
                  HIGH: {repoSummary.breakdown.HIGH}
                </div>
                <div className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
                  MED: {repoSummary.breakdown.MEDIUM}
                </div>
                <div className="px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold">
                  LOW: {repoSummary.breakdown.LOW}
                </div>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-2">
                {repoSummary.unresolvedWhyCount} components require high review priority
              </p>
            </GlassCard>

            {/* Evidence Coverage */}
            <GlassCard glow="cyan" className="p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-slate-400">EVIDENCE COVERAGE</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-1 font-mono">
                <span className="text-4xl font-extrabold text-emerald-400">
                  {Math.round(repoSummary.evidenceCoverage * 100)}%
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-2">
                Supported relationships with direct evidence records
              </p>
            </GlassCard>

            {/* Historical Coverage */}
            <GlassCard glow="cyan" className="p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-slate-400">HISTORICAL COVERAGE</span>
                <Layers className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-1 font-mono">
                <span className="text-4xl font-extrabold text-cyan-300">
                  {Math.round(repoSummary.historicalCoverage * 100)}%
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-2">
                Reconstructible historical rationale across graph
              </p>
            </GlassCard>

          </div>
        )}

        {/* Filter Bar */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search components or files..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
            <span className="text-xs font-mono text-slate-400 shrink-0">Filter Debt:</span>
            {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  levelFilter === lvl
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

        </div>

        {/* Component Table */}
        <div className="rounded-xl border border-slate-800/80 bg-[#070A12] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-900/60 font-mono text-[11px] text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Component</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Debt Level</th>
                  <th className="py-3.5 px-4">Score</th>
                  <th className="py-3.5 px-4">Confidence</th>
                  <th className="py-3.5 px-4">Signals</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-mono">
                      <div className="inline-flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        Calculating deterministic Decision Debt signals...
                      </div>
                    </td>
                  </tr>
                ) : filteredComponents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 font-mono">
                      No components found matching "{searchQuery}".
                    </td>
                  </tr>
                ) : (
                  filteredComponents.map((comp) => (
                    <tr
                      key={comp.id}
                      className="hover:bg-slate-900/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedDebt(comp)}
                    >
                      {/* Label */}
                      <td className="py-3.5 px-4 font-bold text-white group-hover:text-cyan-300 transition-colors">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
                          <span>{comp.targetNodeLabel}</span>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">{comp.targetNodeType}</td>

                      {/* Level Badge */}
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            comp.level === 'CRITICAL' || comp.level === 'HIGH'
                              ? 'rose'
                              : comp.level === 'MEDIUM'
                              ? 'amber'
                              : 'cyan'
                          }
                        >
                          {comp.level}
                        </Badge>
                      </td>

                      {/* Score Bar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                comp.score >= 75
                                  ? 'bg-rose-500'
                                  : comp.score >= 45
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${comp.score}%` }}
                            />
                          </div>
                          <span className="font-bold text-white font-mono text-xs">{comp.score}</span>
                        </div>
                      </td>

                      {/* Confidence */}
                      <td className="py-3.5 px-4 text-slate-300 font-mono">{Math.round(comp.confidence * 100)}%</td>

                      {/* Signals Count */}
                      <td className="py-3.5 px-4 text-slate-400">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                          {comp.signals.length}
                        </span>
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] uppercase font-bold ${
                            comp.reviewPriority === 'REVIEW_FIRST' ? 'text-rose-400' : 'text-amber-400'
                          }`}
                        >
                          {comp.reviewPriority.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedDebt(comp)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 text-[11px] font-bold flex items-center gap-1 transition-colors"
                          >
                            Inspect <ArrowUpRight className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Modal */}
        {selectedDebt && (
          <DecisionDebtDetailModal
            debt={selectedDebt}
            onClose={() => setSelectedDebt(null)}
            onNavigate={handleNavigate}
          />
        )}

      </div>
    </section>
  );
};
