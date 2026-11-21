import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '../../components/navigation/Sidebar';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConnectRepositoryModal } from '../../components/repository/ConnectRepositoryModal';
import { RepositoryCard } from '../../components/repository/RepositoryCard';
import { AnalysisSummary, RepositoryMetadata } from '../../types/evidence';
import { ApiService } from '../../services/apiService';
import { ActiveRepositoryService } from '../../services/activeRepositoryService';
import {
  GitBranch,
  Plus,
  Search,
  ArrowUpDown,
  RefreshCw,
  FolderGit2,
  AlertCircle,
  Loader2,
  Sparkles,
  Layers
} from 'lucide-react';

interface RepositoryProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const Repository: React.FC<RepositoryProps> = ({ currentRoute, onNavigate }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [repositories, setRepositories] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Single-expansion card state: expanded repo ID
  const [expandedRepoId, setExpandedRepoId] = useState<string | null>(null);

  // Active repo ID state
  const [activeRepoId, setActiveRepoId] = useState<string | null>(() => ActiveRepositoryService.getActiveRepoId());

  // Search & Sort filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'RECENT' | 'NAME' | 'COMMITS'>('RECENT');

  // Load repositories from backend
  const loadRepositories = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await ApiService.fetchRepositories();
      setRepositories(list || []);

      // Auto-expand active or first repo
      const currentActive = ActiveRepositoryService.getActiveRepoId();
      if (list && list.length > 0) {
        const targetId = currentActive && list.some((r) => r.repository.id === currentActive)
          ? currentActive
          : list[0].repository.id;
        
        setExpandedRepoId(targetId);
        setActiveRepoId(targetId);
        ActiveRepositoryService.setActiveRepoId(targetId, false);
      }
    } catch (err) {
      console.error('[RepositoryManager] Failed to fetch repositories:', err);
      setError('Unable to load repository details from backend service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepositories();
  }, []);

  // Listen to global active repo changes
  useEffect(() => {
    const unsubscribe = ActiveRepositoryService.subscribe((newRepoId) => {
      setActiveRepoId(newRepoId);
    });
    return unsubscribe;
  }, []);

  // Filter & sort repository list
  const filteredRepositories = useMemo(() => {
    let result = [...repositories];

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => {
        const repo = item.repository;
        return (
          repo.name.toLowerCase().includes(q) ||
          repo.owner.toLowerCase().includes(q) ||
          repo.repo.toLowerCase().includes(q) ||
          (repo.description && repo.description.toLowerCase().includes(q)) ||
          (repo.language && repo.language.toLowerCase().includes(q))
        );
      });
    }

    if (sortBy === 'NAME') {
      result.sort((a, b) => a.repository.name.localeCompare(b.repository.name));
    } else if (sortBy === 'COMMITS') {
      result.sort((a, b) => (b.totalCommits || 0) - (a.totalCommits || 0));
    } else {
      // RECENT
      result.sort((a, b) => new Date(b.analyzedAt || 0).getTime() - new Date(a.analyzedAt || 0).getTime());
    }

    return result;
  }, [repositories, searchQuery, sortBy]);

  // Handle repository card expand toggle (single-expansion behavior)
  const handleToggleExpand = (id: string) => {
    setExpandedRepoId((prev) => (prev === id ? null : id));
  };

  // Handle opening repository workspace
  const handleOpenWorkspace = (repoId: string) => {
    ActiveRepositoryService.setActiveRepoId(repoId);
    onNavigate(`/whygraph?repo=${encodeURIComponent(repoId)}`);
  };

  // Handle new repository analysis success
  const handleAnalysisSuccess = async (data: { summary: AnalysisSummary; repository: RepositoryMetadata }) => {
    setModalOpen(false);
    await loadRepositories();
    if (data.repository && data.repository.id) {
      setExpandedRepoId(data.repository.id);
      ActiveRepositoryService.setActiveRepoId(data.repository.id);
    }
  };

  const activeRepoObj = repositories.find((r) => r.repository.id === activeRepoId);
  const activeRepoName = activeRepoObj ? activeRepoObj.repository.name : undefined;
  const sidebarReposList = repositories.map((r) => ({ id: r.repository.id, name: r.repository.name }));

  const hasRepositories = repositories.length > 0;

  return (
    <div className="min-h-screen bg-[#05070C] text-slate-100 flex">
      <Sidebar
        currentRoute={currentRoute}
        onNavigate={onNavigate}
        activeRepositoryName={activeRepoName}
        repositories={sidebarReposList}
        onSelectRepository={(id) => {
          ActiveRepositoryService.setActiveRepoId(id);
          setExpandedRepoId(id);
        }}
      />

      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Navigation Bar */}
        <header className="px-8 py-4 bg-[#070A12]/90 backdrop-blur border-b border-slate-800/80 sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-display text-white tracking-wide">
                Repository Command Center
              </h1>
              <p className="text-[11px] font-mono text-slate-400">
                EngiTrace Multi-Repository Intelligence Manager
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={loadRepositories}
              className="text-xs font-mono"
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setModalOpen(true)}
              className="shadow-lg shadow-cyan-500/20 text-xs font-mono font-bold"
            >
              {hasRepositories ? '+ ADD GITHUB REPOSITORY' : '+ CONNECT GITHUB REPOSITORY'}
            </Button>
          </div>
        </header>

        <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
          {/* ── 4. PAGE HEADER SECTION ────────────────────────────────────────── */}
          <GlassCard glow="cyan" className="p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="cyan">REPOSITORY MANAGER</Badge>
                  <span className="text-xs font-mono text-slate-400">EngiTrace Intelligence Engine</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold font-display text-white tracking-tight leading-tight">
                  Repository Intelligence
                </h1>
                <p className="text-sm text-slate-300 font-sans mt-2 leading-relaxed">
                  Connect and manage your analyzed software repositories. Build Engineering Memory graphs, explore commit history, trace decision rationale, and evaluate architectural decision debt across your codebase.
                </p>
              </div>

              {/* Prominent Connect Button */}
              <div className="shrink-0 flex flex-col items-start md:items-end gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  icon={<Plus className="w-5 h-5" />}
                  onClick={() => setModalOpen(true)}
                  className="w-full md:w-auto px-8 py-4 text-sm font-mono font-bold uppercase tracking-wider shadow-2xl shadow-cyan-500/30 hover:scale-105 transition-all duration-300"
                >
                  {hasRepositories ? '+ ADD GITHUB REPOSITORY' : '+ CONNECT GITHUB REPOSITORY'}
                </Button>
                <span className="text-[11px] font-mono text-slate-400">
                  Continuous ingestion pipeline for public & private GitHub repos
                </span>
              </div>
            </div>
          </GlassCard>

          {/* ── 6. REPOSITORY LIST CONTROLS BAR ──────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <span>YOUR REPOSITORIES</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-cyan-400 font-bold">
                  {repositories.length}
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
              {/* Search Bar */}
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                />
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-2 shrink-0">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'RECENT' | 'NAME' | 'COMMITS')}
                  className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="RECENT">Recently Analyzed</option>
                  <option value="NAME">Name (A-Z)</option>
                  <option value="COMMITS">Most Commits</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── LOADING STATE ───────────────────────────────────────────────── */}
          {loading && (
            <div className="p-16 text-center glass-panel rounded-2xl border-slate-800/80 space-y-4">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <p className="text-xs font-mono text-slate-400">
                Fetching connected repositories and Engineering Memory summaries...
              </p>
            </div>
          )}

          {/* ── ERROR STATE ─────────────────────────────────────────────────── */}
          {!loading && error && (
            <GlassCard glow="none" className="p-8 text-center border-rose-500/30 bg-rose-950/20 space-y-4">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
              <h3 className="text-base font-bold font-display text-white">
                Unable to load repository details.
              </h3>
              <p className="text-xs font-mono text-slate-400 max-w-md mx-auto">
                {error}
              </p>
              <Button
                variant="outline"
                size="sm"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={loadRepositories}
                className="font-mono text-xs"
              >
                Retry
              </Button>
            </GlassCard>
          )}

          {/* ── 23. EMPTY STATE ─────────────────────────────────────────────── */}
          {!loading && !error && !hasRepositories && (
            <GlassCard glow="cyan" className="p-16 text-center border-slate-800/80 space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto">
                <FolderGit2 className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-xl font-bold font-display text-white">
                  NO REPOSITORIES CONNECTED
                </h3>
                <p className="text-xs font-mono text-slate-400 leading-relaxed">
                  Connect your first GitHub repository to build its Engineering Memory Graph, ingest commits, and trace historical rationale.
                </p>
              </div>
              <Button
                variant="primary"
                size="lg"
                icon={<Plus className="w-5 h-5" />}
                onClick={() => setModalOpen(true)}
                className="px-8 py-3 font-mono font-bold uppercase tracking-wider shadow-xl shadow-cyan-500/20"
              >
                + CONNECT GITHUB REPOSITORY
              </Button>
            </GlassCard>
          )}

          {/* ── REPOSITORY CARDS LIST ──────────────────────────────────────── */}
          {!loading && !error && hasRepositories && (
            <div className="space-y-4">
              {filteredRepositories.length > 0 ? (
                filteredRepositories.map((summary) => (
                  <RepositoryCard
                    key={summary.repository.id}
                    summary={summary}
                    isExpanded={expandedRepoId === summary.repository.id}
                    onToggleExpand={() => handleToggleExpand(summary.repository.id)}
                    onOpenWorkspace={handleOpenWorkspace}
                    status="READY"
                  />
                ))
              ) : (
                <div className="p-12 text-center glass-panel rounded-2xl border-slate-800 text-slate-400 font-mono text-xs">
                  No repositories match your search criteria "{searchQuery}".
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Connect GitHub Repository Modal */}
      <ConnectRepositoryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleAnalysisSuccess}
      />
    </div>
  );
};

export default Repository;
