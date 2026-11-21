import React, { useState, useEffect } from 'react';
import { Sidebar } from '../../components/navigation/Sidebar';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { NodeInvestigationModal } from '../../components/ui/NodeInvestigationModal';
import { CommandPalette } from '../../components/navigation/CommandPalette';
import { ConnectRepositoryModal } from '../../components/repository/ConnectRepositoryModal';
import { DashboardService } from '../../services/dashboardService';
import { ActiveRepositoryService } from '../../services/activeRepositoryService';
import { ApiService } from '../../services/apiService';
import { GraphNode } from '../../types/graph';
import {
  WorkspaceDashboardData,
  WorkspaceActivityType,
  WorkspaceRepositoryItem
} from '../../types/workspaceDashboard';
import {
  Search,
  GitBranch,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Plus,
  PlusCircle,
  CheckCircle2,
  FolderGit2,
  Activity,
  Package,
  Layers,
  BrainCircuit,
  Bell,
  Clock,
  Code,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  Database,
  Network
} from 'lucide-react';

interface DashboardProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
}

export const Dashboard: React.FC<DashboardProps> = ({ currentRoute, onNavigate }) => {
  const [data, setData] = useState<WorkspaceDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [reanalyzingRepoId, setReanalyzingRepoId] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<'ALL' | WorkspaceActivityType>('ALL');

  // Active repository tracking for downstream views
  const [activeRepoId, setActiveRepoId] = useState<string | null>(() => ActiveRepositoryService.getActiveRepoId());

  // Modals & Panels
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('cmd') === 'true';
    }
    return false;
  });
  const [selectedNodeForModal, setSelectedNodeForModal] = useState<GraphNode | null>(null);

  const loadWorkspaceData = async () => {
    setLoading(true);
    try {
      const workspaceData = await DashboardService.fetchWorkspaceDashboardData();
      setData(workspaceData);

      // If no active repo is set, set first connected repo
      if (!ActiveRepositoryService.getActiveRepoId() && workspaceData.repositories.length > 0) {
        ActiveRepositoryService.setActiveRepoId(workspaceData.repositories[0].id, false);
        setActiveRepoId(workspaceData.repositories[0].id);
      }
    } catch (err) {
      console.warn('[Dashboard] Failed to load workspace data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, []);

  useEffect(() => {
    const unsubscribe = ActiveRepositoryService.subscribe((newRepoId) => {
      setActiveRepoId(newRepoId);
    });
    return unsubscribe;
  }, []);

  const handleSelectRepository = (repoId: string) => {
    ActiveRepositoryService.setActiveRepoId(repoId);
    setActiveRepoId(repoId);
  };

  const handleReanalyzeRepository = async (repo: WorkspaceRepositoryItem) => {
    setReanalyzingRepoId(repo.id);
    try {
      await ApiService.analyzeRepository(repo.url);
      await loadWorkspaceData();
    } catch (err) {
      console.warn(`[Dashboard] Failed to re-analyze ${repo.name}:`, err);
      await loadWorkspaceData();
    } finally {
      setReanalyzingRepoId(null);
    }
  };

  // Activity filter logic
  const filteredActivities = (data?.recentActivities || []).filter((item) => {
    if (activityFilter === 'ALL') return true;
    return item.type === activityFilter;
  });

  const metrics = data?.metrics;
  const repositories = data?.repositories || [];
  const hasRepositories = repositories.length > 0;
  const isPartiallyAnalyzed = Boolean(
    metrics && metrics.pendingRepositories > 0 && metrics.analyzedRepositories > 0
  );

  return (
    <div className="min-h-screen bg-[#05070C] text-slate-100 flex selection:bg-cyan-500/30">
      {/* Sidebar Navigation */}
      <Sidebar
        currentRoute={currentRoute}
        onNavigate={onNavigate}
        repositories={repositories.map((r) => ({ id: r.id, name: r.name }))}
        onSelectRepository={handleSelectRepository}
      />

      {/* Shared Node Investigation Modal */}
      <NodeInvestigationModal
        node={selectedNodeForModal}
        repositoryId={activeRepoId || undefined}
        isOpen={Boolean(selectedNodeForModal)}
        onClose={() => setSelectedNodeForModal(null)}
        onNavigate={onNavigate}
      />

      {/* Global Search & Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={onNavigate}
        onSelectNode={(node) => setSelectedNodeForModal(node)}
      />

      {/* Connect Repository Modal */}
      <ConnectRepositoryModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        onSuccess={(result) => {
          setIsConnectModalOpen(false);
          handleSelectRepository(result.repository.id);
          loadWorkspaceData();
        }}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">

        {/* ─────────────────────────────────────────────────────────── */}
        {/* PART 4 — WORKSPACE HEADER BAR                               */}
        {/* ─────────────────────────────────────────────────────────── */}
        <header className="px-8 py-4 bg-[#070A12]/95 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold font-display text-white tracking-wide">
                Engineering Intelligence Command Center
              </h1>
              {data?.isDemo && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono text-amber-400 font-bold">
                  Demo Data Mode
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              Your engineering workspace at a glance — across all connected repositories.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Connect Repository Button */}
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setIsConnectModalOpen(true)}
            >
              Connect Repository
            </Button>

            {/* Quick Command Trigger */}
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Search / Command...</span>
              <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-800 rounded border border-slate-700 text-slate-300">
                ⌘K
              </kbd>
            </button>

            {/* System Notifications Popover */}
            <div className="relative">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="relative p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Workspace Intelligence Status"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#070A12]" />
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 top-11 w-80 z-50 bg-[#0A0E1A] border border-slate-700 rounded-xl shadow-2xl p-3 font-mono text-xs space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-white text-[11px] uppercase tracking-wider">
                      Workspace Intelligence
                    </span>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      All Engines Online
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[11px] text-slate-300">
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                      <div className="font-bold text-cyan-400">Engineering Memory Active</div>
                      <div className="text-slate-400 text-[10px] mt-0.5">
                        {repositories.length} connected codebases monitored with cross-repository graph topology.
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                      <div className="font-bold text-purple-400">Decision Debt Scanner</div>
                      <div className="text-slate-400 text-[10px] mt-0.5">
                        Deterministic signals evaluated across historical rationale trails.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Avatar */}
            <div className="flex items-center gap-2 pl-1 border-l border-slate-800">
              <div
                className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 p-[1px] flex items-center justify-center cursor-pointer shadow-sm"
                title="EngiTrace Engineer Session"
              >
                <div className="w-full h-full bg-[#070A12] rounded-[11px] flex items-center justify-center text-[11px] font-mono font-bold text-cyan-300">
                  ET
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <div className="p-8 space-y-8 max-w-7xl mx-auto w-full">

          {/* ─────────────────────────────────────────────────────────── */}
          {/* PART 5 — WELCOME BANNER                                     */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="relative overflow-hidden p-6 sm:p-8 rounded-2xl border border-cyan-500/25 bg-gradient-to-r from-cyan-950/30 via-slate-900/80 to-indigo-950/30 shadow-2xl">
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-8 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[11px] font-mono font-bold text-cyan-400 uppercase tracking-widest">
                  <Sparkles className="w-3.5 h-3.5" />
                  WORKSPACE INTELLIGENCE
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-2xl sm:text-3xl font-bold font-display text-white tracking-wide">
                    Welcome to EngiTrace
                  </h2>
                  <p className="text-sm font-mono text-slate-300 max-w-2xl leading-relaxed">
                    Analyze, explore and understand your codebases with an AI-assisted Engineering Memory.
                  </p>
                </div>

                {/* 4 Benefits Pills */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 max-w-2xl">
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800/80 text-xs font-mono text-slate-200">
                    <FolderGit2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Track multiple repositories.</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800/80 text-xs font-mono text-slate-200">
                    <BrainCircuit className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Discover engineering decisions.</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800/80 text-xs font-mono text-slate-200">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Investigate changes with evidence.</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800/80 text-xs font-mono text-slate-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Identify potential engineering risks.</span>
                  </div>
                </div>
              </div>

              {/* Subtle Engineering Network Graphic on Right */}
              <div className="hidden lg:flex lg:col-span-4 justify-center items-center relative select-none">
                <div className="w-64 h-48 relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-cyan-500/5 rounded-full blur-2xl" />
                  <svg className="w-full h-full" viewBox="0 0 240 160" fill="none">
                    {/* Connecting Edges */}
                    <path d="M 40 40 L 120 70" stroke="rgba(6, 182, 212, 0.3)" strokeWidth="1.5" strokeDasharray="3 3" />
                    <path d="M 40 120 L 120 70" stroke="rgba(139, 92, 246, 0.3)" strokeWidth="1.5" strokeDasharray="3 3" />
                    <path d="M 120 70 L 200 40" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="1.5" />
                    <path d="M 120 70 L 200 120" stroke="rgba(245, 158, 11, 0.3)" strokeWidth="1.5" />

                    {/* Nodes */}
                    {/* Center Core Node */}
                    <circle cx="120" cy="70" r="18" fill="#0E1629" stroke="#06B6D4" strokeWidth="2" />
                    <circle cx="120" cy="70" r="8" fill="#06B6D4" className="animate-pulse" />

                    {/* Left Node 1 (Commit) */}
                    <circle cx="40" cy="40" r="14" fill="#0E1629" stroke="#38BDF8" strokeWidth="1.5" />
                    <text x="40" y="43" textAnchor="middle" fill="#38BDF8" fontSize="8" fontFamily="monospace" fontWeight="bold">DAG</text>

                    {/* Left Node 2 (PR) */}
                    <circle cx="40" cy="120" r="14" fill="#0E1629" stroke="#A855F7" strokeWidth="1.5" />
                    <text x="40" y="123" textAnchor="middle" fill="#A855F7" fontSize="8" fontFamily="monospace" fontWeight="bold">PR</text>

                    {/* Right Node 1 (Why / Decision) */}
                    <circle cx="200" cy="40" r="14" fill="#0E1629" stroke="#2DD4BF" strokeWidth="1.5" />
                    <text x="200" y="43" textAnchor="middle" fill="#2DD4BF" fontSize="8" fontFamily="monospace" fontWeight="bold">WHY</text>

                    {/* Right Node 2 (Debt) */}
                    <circle cx="200" cy="120" r="14" fill="#0E1629" stroke="#F59E0B" strokeWidth="1.5" />
                    <text x="200" y="123" textAnchor="middle" fill="#F59E0B" fontSize="8" fontFamily="monospace" fontWeight="bold">DEBT</text>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* PART 6 — WORKSPACE OVERVIEW METRICS                         */}
          {/* ─────────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold font-display text-white tracking-wide">
                  Workspace Overview
                </h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  Real-time aggregated health, topology, and risk indicators across connected codebases
                </p>
              </div>

              {isPartiallyAnalyzed && (
                <span className="px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono text-amber-400 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Partial Analysis ({metrics?.analyzedRepositories}/{metrics?.totalRepositories} Ready)
                </span>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-32 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* CARD 1 — CONNECTED REPOSITORIES */}
                <GlassCard glow="cyan" className="p-4 flex flex-col justify-between hover:border-cyan-500/40 transition-all">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span className="font-semibold text-[11px] tracking-wider uppercase">Connected Repositories</span>
                    <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                      <FolderGit2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="my-2.5">
                    <div className="text-2xl font-bold font-mono text-white tracking-tight">
                      {metrics ? `${metrics.totalRepositories} Repositories` : '0 Repositories'}
                    </div>
                    <div className="text-[11px] font-mono text-cyan-400/90 mt-0.5">
                      {metrics && metrics.totalRepositories > 0
                        ? `${metrics.analyzedRepositories} Analyzed · ${metrics.pendingRepositories} Pending`
                        : 'No repositories connected'}
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500 border-t border-slate-800/80 pt-2">
                    Active codebases in workspace
                  </p>
                </GlassCard>

                {/* CARD 2 — COMMITS ANALYZED */}
                <GlassCard glow="cyan" className="p-4 flex flex-col justify-between hover:border-blue-500/40 transition-all">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span className="font-semibold text-[11px] tracking-wider uppercase">Commits Analyzed</span>
                    <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                      <GitCommit className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="my-2.5">
                    <div className="text-2xl font-bold font-mono text-white tracking-tight">
                      {metrics && metrics.totalRepositories > 0
                        ? metrics.totalCommitsAnalyzed.toLocaleString()
                        : '—'}
                    </div>
                    <div className="text-[11px] font-mono text-blue-400/90 mt-0.5">
                      {metrics && metrics.totalRepositories > 0
                        ? `${metrics.uniqueCommitsCount.toLocaleString()} Unique commits in DAG`
                        : 'Pending repository connection'}
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500 border-t border-slate-800/80 pt-2">
                    Indexed Git DAG histories
                  </p>
                </GlassCard>

                {/* CARD 3 — DEPENDENCIES */}
                <GlassCard glow="purple" className="p-4 flex flex-col justify-between hover:border-purple-500/40 transition-all">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span className="font-semibold text-[11px] tracking-wider uppercase">Dependencies</span>
                    <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                      <Package className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="my-2.5">
                    <div className="text-2xl font-bold font-mono text-white tracking-tight">
                      {metrics && metrics.totalRepositories > 0
                        ? `${metrics.uniquePackagesCount.toLocaleString()} Unique Packages`
                        : '—'}
                    </div>
                    <div className="text-[11px] font-mono text-purple-400/90 mt-0.5">
                      {metrics && metrics.totalRepositories > 0
                        ? `${metrics.totalDependenciesCount.toLocaleString()} Total references declared`
                        : 'Pending manifest analysis'}
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500 border-t border-slate-800/80 pt-2">
                    Workspace-wide ecosystem packages
                  </p>
                </GlassCard>

                {/* CARD 4 — DECISION DEBT FINDINGS */}
                <GlassCard glow="amber" className="p-4 flex flex-col justify-between hover:border-amber-500/40 transition-all">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span className="font-semibold text-[11px] tracking-wider uppercase">Decision Debt Findings</span>
                    <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="my-2.5">
                    <div className="text-2xl font-bold font-mono text-white tracking-tight flex items-center gap-1.5">
                      <span>{metrics && metrics.totalRepositories > 0 ? `${metrics.totalDecisionDebtFindings} Findings` : '—'}</span>
                    </div>
                    <div className="text-[11px] font-mono text-amber-400/90 mt-0.5">
                      {metrics && metrics.totalRepositories > 0
                        ? `${metrics.affectedComponentsCount} components · ${metrics.affectedRepositoriesCount} repos affected`
                        : 'No architectural debt recorded'}
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500 border-t border-slate-800/80 pt-2">
                    Architectural maintenance risks
                  </p>
                </GlassCard>

              </div>
            )}
          </section>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* MIDDLE ROW: YOUR REPOSITORIES (LEFT) + WORKSPACE ACTIVITY (R) */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* ── PART 7 — YOUR REPOSITORIES (7 COLS) ────────────────── */}
            <div className="lg:col-span-7">
              <GlassCard glow="cyan" className="p-5 flex flex-col min-h-[520px]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold font-display text-white tracking-wide">
                        Your Repositories
                      </h3>
                      <Badge variant="cyan">{repositories.length}</Badge>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                      Connected codebases indexed in Engineering Memory
                    </p>
                  </div>

                  <button
                    onClick={() => onNavigate('/repository')}
                    className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold cursor-pointer transition-colors"
                  >
                    <span>View All</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Repository List Content */}
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {loading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-28 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse" />
                      ))}
                    </div>
                  ) : hasRepositories ? (
                    repositories.map((repo) => {
                      const isReanalyzing = reanalyzingRepoId === repo.id;
                      const isNeedsAttention = repo.status === 'NEEDS_ATTENTION';
                      const isReady = repo.status === 'READY';
                      const isNotAnalyzed = repo.status === 'NOT_ANALYZED';

                      return (
                        <div
                          key={repo.id}
                          className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90 hover:border-slate-700 hover:bg-slate-900/90 transition-all flex flex-col justify-between gap-3 group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0 mt-0.5">
                                <GitBranch className="w-4 h-4" />
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold font-display text-white tracking-wide truncate">
                                    {repo.name}
                                  </span>

                                  {/* Status Pill */}
                                  {isReady && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-400 font-bold">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      Ready
                                    </span>
                                  )}

                                  {isNeedsAttention && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono text-amber-400 font-bold">
                                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                                      Needs Attention
                                    </span>
                                  )}

                                  {isNotAnalyzed && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-400">
                                      Not Analyzed
                                    </span>
                                  )}

                                  {isReanalyzing && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-mono text-cyan-400 animate-pulse">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      Analyzing...
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 mt-1 flex-wrap">
                                  <span>Branch: <strong className="text-slate-300">{repo.defaultBranch}</strong></span>
                                  <span>·</span>
                                  <span>Commits: <strong className="text-slate-300">{repo.commitsCount}</strong></span>
                                  <span>·</span>
                                  <span>Files: <strong className="text-slate-300">{repo.filesCount}</strong></span>
                                  {repo.language && (
                                    <>
                                      <span>·</span>
                                      <span className="text-slate-400">{repo.language}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* External GitHub Link */}
                            {repo.url && (
                              <a
                                href={repo.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 text-slate-500 hover:text-cyan-400 transition-colors shrink-0"
                                title="Open on GitHub"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>

                          {/* Footer with Timestamp and Action Buttons */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70 text-[10px] font-mono text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>Last Analyzed: <strong className="text-slate-300">{formatRelativeTime(repo.analyzedAt)}</strong></span>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Open Repository */}
                              <button
                                onClick={() => {
                                  handleSelectRepository(repo.id);
                                  onNavigate('/repository');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                              >
                                Open
                              </button>

                              {/* Explore Engineering Graph */}
                              <button
                                onClick={() => {
                                  handleSelectRepository(repo.id);
                                  onNavigate(`/whygraph?repo=${repo.id}`);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition-colors cursor-pointer font-bold flex items-center gap-1"
                              >
                                <span>Graph</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>

                              {/* Re-analyze Button */}
                              <button
                                onClick={() => handleReanalyzeRepository(repo)}
                                disabled={isReanalyzing}
                                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                                title="Re-analyze repository"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isReanalyzing ? 'animate-spin text-cyan-400' : ''}`} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    /* Empty State when no repos connected */
                    <div className="h-full py-12 flex flex-col items-center justify-center text-center p-6 space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mx-auto">
                        <FolderGit2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold font-display text-white tracking-wide">
                          No Repositories Connected
                        </h4>
                        <p className="text-xs font-mono text-slate-400 mt-1 max-w-sm">
                          Connect your first GitHub repository to begin constructing an Engineering Memory DAG.
                        </p>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<PlusCircle className="w-4 h-4" />}
                        onClick={() => setIsConnectModalOpen(true)}
                      >
                        Connect GitHub Repository
                      </Button>
                    </div>
                  )}
                </div>
              </GlassCard>
            </div>

            {/* ── PART 8 — RECENT WORKSPACE ACTIVITY (5 COLS) ─────────── */}
            <div className="lg:col-span-5">
              <GlassCard glow="cyan" className="p-5 flex flex-col min-h-[520px]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                  <div>
                    <h3 className="text-sm font-bold font-display text-white tracking-wide">
                      Recent Workspace Activity
                    </h3>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                      Activity across all connected repositories
                    </p>
                  </div>

                  <button
                    onClick={() => onNavigate(activeRepoId ? `/whygraph?view=git_graph&repo=${activeRepoId}` : '/whygraph')}
                    className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold cursor-pointer transition-colors"
                  >
                    <span>View All</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 mb-3 p-1 bg-slate-900/80 border border-slate-800 rounded-lg text-[10px] font-mono">
                  {(
                    [
                      { key: 'ALL', label: 'All' },
                      { key: 'COMMIT', label: 'Commits' },
                      { key: 'PULL_REQUEST', label: 'PRs' },
                      { key: 'ISSUE', label: 'Issues' }
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setActivityFilter(key as any)}
                      className={`flex-1 py-1 rounded text-center font-bold transition-colors cursor-pointer ${
                        activityFilter === key
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Event List */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[380px]">
                  {loading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-20 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse" />
                      ))}
                    </div>
                  ) : filteredActivities.length > 0 ? (
                    filteredActivities.map((event) => {
                      const isCommit = event.type === 'COMMIT';
                      const isPR = event.type === 'PULL_REQUEST';
                      const isIssue = event.type === 'ISSUE';
                      const isDep = event.type === 'DEPENDENCY';

                      return (
                        <div
                          key={event.id}
                          onClick={() => {
                            if (event.sourceUrl) {
                              window.open(event.sourceUrl, '_blank');
                            }
                          }}
                          className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/90 transition-all cursor-pointer group"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              {isCommit && (
                                <span className="p-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                  <GitCommit className="w-3 h-3" />
                                </span>
                              )}
                              {isPR && (
                                <span className="p-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                  <GitPullRequest className="w-3 h-3" />
                                </span>
                              )}
                              {isIssue && (
                                <span className="p-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  <AlertCircle className="w-3 h-3" />
                                </span>
                              )}
                              {isDep && (
                                <span className="p-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  <Package className="w-3 h-3" />
                                </span>
                              )}

                              <span className="text-[10px] font-mono font-bold text-slate-300 group-hover:text-cyan-400 transition-colors">
                                {event.id.length > 10 ? `#${event.id.slice(0, 7)}` : event.id}
                              </span>

                              {/* Repository Label Badge */}
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[9px] font-mono text-cyan-300/80 border border-slate-700">
                                {event.repositoryName}
                              </span>
                            </div>

                            <span className="text-[10px] font-mono text-slate-500">
                              {formatRelativeTime(event.timestamp)}
                            </span>
                          </div>

                          <p className="text-xs font-medium text-slate-200 line-clamp-2 leading-relaxed">
                            {event.title}
                          </p>

                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-2 pt-1.5 border-t border-slate-800/60">
                            <span className="truncate max-w-[150px]">By {event.author}</span>
                            <span className="text-slate-500 group-hover:text-cyan-400 transition-colors">
                              Details →
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="h-full py-12 flex flex-col items-center justify-center text-center p-6 text-slate-500 font-mono text-xs">
                      <Activity className="w-8 h-8 text-slate-600 mb-2" />
                      <span>No workspace activity recorded yet</span>
                    </div>
                  )}
                </div>
              </GlassCard>
            </div>

          </div>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* PART 9 — WORKSPACE ENGINEERING INSIGHTS                     */}
          {/* ─────────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-base font-bold font-display text-white tracking-wide">
                Workspace Engineering Insights
              </h3>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                Evidence-backed knowledge, risk analysis, and architecture findings across all repositories
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

              {/* INSIGHT 1: DECISION DEBT */}
              <GlassCard glow="amber" className="p-5 flex flex-col justify-between hover:border-amber-500/40 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono font-bold text-amber-400">
                      {data?.decisionDebtInsight.highCount ? `${data.decisionDebtInsight.highCount} HIGH RISK` : 'EVALUATED'}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold font-mono text-white uppercase tracking-wider mb-1">
                    Decision Debt
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
                    {data?.decisionDebtInsight.summaryText ||
                      'Deterministic evaluation reveals minimal architectural rationale drift across active repositories.'}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">
                    {data?.decisionDebtInsight.totalFindings || 0} Findings in {data?.decisionDebtInsight.affectedReposCount || 0} Repos
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ArrowRight className="w-3.5 h-3.5 text-amber-400" />}
                    onClick={() => onNavigate('/decision-debt')}
                  >
                    Review
                  </Button>
                </div>
              </GlassCard>

              {/* INSIGHT 2: DEPENDENCY INSIGHTS */}
              <GlassCard glow="purple" className="p-5 flex flex-col justify-between hover:border-purple-500/40 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                      <Package className="w-4 h-4" />
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-[10px] font-mono font-bold text-purple-400">
                      {data?.dependencyInsight.uniquePackagesCount || 0} Packages
                    </span>
                  </div>

                  <h4 className="text-xs font-bold font-mono text-white uppercase tracking-wider mb-1">
                    Dependency Insights
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
                    {data?.dependencyInsight.summaryText ||
                      'Multi-ecosystem manifest dependencies analyzed across codebases with DAG topology.'}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">
                    {data?.dependencyInsight.totalDeclarations || 0} Declarations
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ArrowRight className="w-3.5 h-3.5 text-purple-400" />}
                    onClick={() => onNavigate(activeRepoId ? `/whygraph?view=dependencies&repo=${activeRepoId}` : '/whygraph')}
                  >
                    Explore
                  </Button>
                </div>
              </GlassCard>

              {/* INSIGHT 3: HISTORICAL KNOWLEDGE */}
              <GlassCard glow="cyan" className="p-5 flex flex-col justify-between hover:border-cyan-500/40 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                      <Sparkles className="w-4 h-4" />
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-mono font-bold text-cyan-400">
                      {data?.historicalInsight.coveragePercentage || 100}% Grounded
                    </span>
                  </div>

                  <h4 className="text-xs font-bold font-mono text-white uppercase tracking-wider mb-1">
                    Historical Knowledge
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
                    {data?.historicalInsight.summaryText ||
                      'Traceable reasoning connecting commits, pull requests, issues, and code changes with verified FACT and INFERENCE classifications.'}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">
                    {data?.historicalInsight.factCount || 0} Facts · {data?.historicalInsight.inferenceCount || 0} Inferred
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ArrowRight className="w-3.5 h-3.5 text-cyan-400" />}
                    onClick={() => onNavigate(activeRepoId ? `/whygraph?view=decisions&repo=${activeRepoId}` : '/whygraph')}
                  >
                    Investigate WHY
                  </Button>
                </div>
              </GlassCard>

            </div>
          </section>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* PART 10 — QUICK ACTIONS                                    */}
          {/* ─────────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-base font-bold font-display text-white tracking-wide">
                Quick Actions
              </h3>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                Direct shortcuts to workspace intelligence workflows
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

              {/* ACTION 1: CONNECT REPOSITORY */}
              <div
                onClick={() => setIsConnectModalOpen(true)}
                className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-cyan-500/40 hover:bg-slate-900 transition-all cursor-pointer flex flex-col justify-between group h-32"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:scale-105 transition-transform">
                    <PlusCircle className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="text-xs font-bold font-mono text-white group-hover:text-cyan-400 transition-colors">
                    Connect Repository
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Add a new GitHub repository to your workspace.
                  </div>
                </div>
              </div>

              {/* ACTION 2: EXPLORE REPOSITORIES */}
              <div
                onClick={() => onNavigate('/repository')}
                className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-blue-500/40 hover:bg-slate-900 transition-all cursor-pointer flex flex-col justify-between group h-32"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 group-hover:scale-105 transition-transform">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="text-xs font-bold font-mono text-white group-hover:text-blue-400 transition-colors">
                    Explore Repositories
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Manage and analyze your connected repositories.
                  </div>
                </div>
              </div>

              {/* ACTION 3: OPEN ENGINEERING GRAPH */}
              <div
                onClick={() => onNavigate(activeRepoId ? `/whygraph?repo=${activeRepoId}` : '/whygraph')}
                className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-purple-500/40 hover:bg-slate-900 transition-all cursor-pointer flex flex-col justify-between group h-32"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:scale-105 transition-transform">
                    <Network className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="text-xs font-bold font-mono text-white group-hover:text-purple-400 transition-colors">
                    Open Engineering Graph
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Dive into repository history, architecture and changes.
                  </div>
                </div>
              </div>

              {/* ACTION 4: VIEW DECISION DEBT */}
              <div
                onClick={() => onNavigate('/decision-debt')}
                className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-amber-500/40 hover:bg-slate-900 transition-all cursor-pointer flex flex-col justify-between group h-32"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 group-hover:scale-105 transition-transform">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="text-xs font-bold font-mono text-white group-hover:text-amber-400 transition-colors">
                    View Decision Debt
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Review engineering risks and maintenance concerns.
                  </div>
                </div>
              </div>

            </div>
          </section>

        </div>
      </main>
    </div>
  );
};
