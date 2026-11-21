import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { AnalysisSummary } from '../../types/evidence';
import {
  GitBranch,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Star,
  GitFork,
  FileCode,
  GitCommit,
  Layers,
  Sparkles,
  ArrowRight,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Activity,
  Loader2
} from 'lucide-react';

interface RepositoryCardProps {
  summary: AnalysisSummary;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenWorkspace: (repoId: string) => void;
  status?: 'READY' | 'ANALYZING' | 'FAILED' | 'NEEDS_REANALYSIS';
}

export const RepositoryCard: React.FC<RepositoryCardProps> = ({
  summary,
  isExpanded,
  onToggleExpand,
  onOpenWorkspace,
  status = 'READY'
}) => {
  const repo = summary.repository;

  // Format date helper
  const formattedAnalyzedAt = React.useMemo(() => {
    if (!summary.analyzedAt) return 'Not available';
    try {
      const date = new Date(summary.analyzedAt);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) + ' · ' + date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return summary.analyzedAt;
    }
  }, [summary.analyzedAt]);

  const recentCommits = summary.recentCommits || [];

  return (
    <GlassCard
      glow={isExpanded ? 'cyan' : 'none'}
      className={`transition-all duration-300 border-slate-800 ${
        isExpanded ? 'border-cyan-500/40 bg-slate-950/80 shadow-2xl shadow-cyan-950/20' : 'hover:border-slate-700'
      }`}
    >
      {/* ── COLLAPSED CARD HEADER ────────────────────────────────────────────── */}
      <div
        className="p-5 flex items-center justify-between gap-4 cursor-pointer select-none"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {/* Repo Icon */}
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <GitBranch className="w-5 h-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-base font-bold font-display text-white tracking-wide truncate">
                {repo.name}
              </h3>

              {/* Status Indicator */}
              {status === 'READY' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Engineering Memory Ready
                </span>
              )}

              {status === 'ANALYZING' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[11px] font-mono text-cyan-400 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                  Analyzing...
                </span>
              )}

              {status === 'FAILED' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-[11px] font-mono text-rose-400 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  Analysis Failed
                </span>
              )}
            </div>

            <p className="text-xs font-sans text-slate-400 truncate mt-1 max-w-2xl">
              {repo.description || 'No description provided for this repository.'}
            </p>

            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-2 flex-wrap">
              <span>{summary.totalFiles || 0} files</span>
              <span>•</span>
              <span>{summary.totalCommits || 0} commits</span>
              <span>•</span>
              <span>{summary.totalEvidenceRecords || 0} evidence records</span>
              {repo.language && (
                <>
                  <span>•</span>
                  <span className="text-cyan-400">{repo.language}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Chevron Expand Button */}
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={`repo-details-${repo.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className={`p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-all cursor-pointer shrink-0 ${
            isExpanded ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : ''
          }`}
          title={isExpanded ? 'Collapse Details' : 'Expand Details'}
        >
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 transition-transform duration-300" />
          ) : (
            <ChevronRight className="w-5 h-5 transition-transform duration-300" />
          )}
        </button>
      </div>

      {/* ── EXPANDED DETAILS CONTENT ────────────────────────────────────────── */}
      {isExpanded && (
        <div
          id={`repo-details-${repo.id}`}
          className="border-t border-slate-800/80 p-6 space-y-6 animate-fadeIn"
        >
          {/* Metadata Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800/60 font-mono text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Branch</span>
              <span className="text-slate-200 font-bold mt-0.5 block">{repo.defaultBranch || 'main'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Last Analyzed</span>
              <span className="text-slate-200 font-semibold mt-0.5 block">{formattedAnalyzedAt}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Repository Status</span>
              <span className="text-emerald-400 font-bold mt-0.5 block flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {status}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase tracking-wider">GitHub Metadata</span>
              <div className="flex items-center gap-3 mt-0.5 text-slate-300">
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  {(repo.stars || 0).toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <GitFork className="w-3.5 h-3.5 text-slate-400" />
                  {(repo.forks || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Breakdown */}
          <div>
            <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-3">
              Engineering Metrics Summary
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              <div className="p-3 rounded-xl bg-[#080C16] border border-slate-800 text-center">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">Files</span>
                <span className="text-lg font-bold font-mono text-white mt-1 block">{summary.totalFiles || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#080C16] border border-slate-800 text-center">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">Commits</span>
                <span className="text-lg font-bold font-mono text-cyan-400 mt-1 block">{summary.totalCommits || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#080C16] border border-slate-800 text-center">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">PRs / Issues</span>
                <span className="text-lg font-bold font-mono text-purple-400 mt-1 block">
                  {(summary.totalPullRequests || 0) + (summary.totalIssues || 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#080C16] border border-slate-800 text-center">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">Evidence</span>
                <span className="text-lg font-bold font-mono text-white mt-1 block">{summary.totalEvidenceRecords || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#080C16] border border-slate-800 text-center">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">Facts</span>
                <span className="text-lg font-bold font-mono text-emerald-400 mt-1 block">{summary.factCount || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#080C16] border border-slate-800 text-center">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">Inferences</span>
                <span className="text-lg font-bold font-mono text-amber-400 mt-1 block">{summary.inferenceCount || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#080C16] border border-slate-800 text-center">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">Decision Debt</span>
                <span className="text-lg font-bold font-mono text-cyan-300 mt-1 block">LOW</span>
              </div>
            </div>
          </div>

          {/* Analyzing In-Progress Stage Checklist if analyzing */}
          {status === 'ANALYZING' && (
            <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 space-y-2">
              <h5 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                ANALYZING REPOSITORY STAGES
              </h5>
              <div className="space-y-1 text-xs font-mono text-slate-300">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Repository metadata extracted
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> File structure indexed
                </div>
                <div className="flex items-center gap-2 text-cyan-400 font-bold">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Git history parsing in progress
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <span className="w-3.5 text-center">○</span> Evidence normalization pending
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <span className="w-3.5 text-center">○</span> Engineering Memory Graph construction pending
                </div>
              </div>
            </div>
          )}

          {/* Recent Activity List */}
          <div>
            <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              Recent Activity
            </h4>

            {recentCommits.length > 0 ? (
              <div className="space-y-2">
                {recentCommits.slice(0, 3).map((commit) => (
                  <div
                    key={commit.hash}
                    className="p-3 rounded-xl bg-[#070A12] border border-slate-800/80 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <GitCommit className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-slate-200 font-semibold truncate">
                          {commit.message}
                        </p>
                        <span className="text-[10px] font-mono text-slate-500 block mt-0.5">
                          Commit #{commit.shortHash || commit.hash.substring(0, 7)} by {commit.authorName}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {new Date(commit.date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-mono text-slate-500 italic p-3 rounded-xl bg-[#070A12] border border-slate-800/80">
                Not available
              </p>
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-800/80 flex-wrap gap-4">
            <a
              href={repo.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on GitHub
            </a>

            <Button
              variant="primary"
              size="md"
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={() => onOpenWorkspace(repo.id)}
              className="shadow-lg shadow-cyan-500/20 font-mono font-bold"
            >
              OPEN ENGINEERING MEMORY
            </Button>
          </div>
        </div>
      )}
    </GlassCard>
  );
};
