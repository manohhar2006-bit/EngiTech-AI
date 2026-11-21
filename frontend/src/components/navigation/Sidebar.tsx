import React from 'react';
import {
  LayoutDashboard,
  GitBranch,
  Network,
  AlertTriangle,
  BookOpen,
  ArrowLeft,
  ChevronRight,
  Check,
  Plus,
  Sparkles
} from 'lucide-react';
import { MOCK_REPOSITORIES } from '../../data/mockRepository';

import { ApiService } from '../../services/apiService';
import { ActiveRepositoryService } from '../../services/activeRepositoryService';

interface SidebarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  activeRepositoryName?: string;
  repositories?: Array<{ id: string; name: string }>;
  onSelectRepository?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onNavigate,
  activeRepositoryName,
  repositories: propRepositories = [],
  onSelectRepository
}) => {
  const [showRepoDropdown, setShowRepoDropdown] = React.useState(false);
  const [fetchedRepos, setFetchedRepos] = React.useState<Array<{ id: string; name: string }>>([]);

  React.useEffect(() => {
    const loadRepos = async () => {
      try {
        const summaries = await ApiService.fetchRepositories();
        if (summaries && summaries.length > 0) {
          setFetchedRepos(summaries.map((s) => ({ id: s.repository.id, name: s.repository.name })));
        }
      } catch (err) {
        console.warn('[Sidebar] Error fetching repositories:', err);
      }
    };
    loadRepos();
  }, []);

  const repositories = propRepositories.length > 0 ? propRepositories : fetchedRepos;

  // Primary Navigation: Exactly 5 core sections
  const primaryMenuItems = [
    { label: 'Overview', route: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: 'Repositories', route: '/repository', icon: <GitBranch className="w-4 h-4" /> },
    { label: 'Engineering Graph', route: '/whygraph', icon: <Network className="w-4 h-4" /> },
    { label: 'EngiTrace AI', route: '/ai-assistant', icon: <Sparkles className="w-4 h-4" /> },
    { label: 'Decision Debt', route: '/decision-debt', icon: <AlertTriangle className="w-4 h-4" /> },
  ];

  // Secondary Navigation: Help & Resources
  const helpMenuItems = [
    { label: 'Documentation', route: '/docs', icon: <BookOpen className="w-4 h-4" /> },
  ];

  const currentRepoName = activeRepositoryName || (repositories.length > 0 ? repositories[0].name : 'No Repository Connected');

  const handleRepoClick = (id: string) => {
    ActiveRepositoryService.setActiveRepoId(id);
    if (onSelectRepository) {
      onSelectRepository(id);
    } else {
      onNavigate(`/dashboard?repo=${id}`);
    }
    setShowRepoDropdown(false);
  };

  const isItemActive = (route: string) => {
    const currentPath = currentRoute.split('?')[0] || '/';
    return currentPath === route;
  };

  return (
    <aside className="w-64 bg-[#070A12] border-r border-slate-800/80 flex flex-col h-screen sticky top-0 shrink-0 select-none">

      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
        <div
          onClick={() => onNavigate('/')}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <span className="font-display font-bold text-sm text-white tracking-wider">
              ENGITRACE
            </span>
            <span className="block text-[9px] font-mono text-cyan-400 tracking-widest uppercase">
              ENGINEERING INTELLIGENCE
            </span>
          </div>
        </div>
      </div>

      {/* Active Repository Selector */}
      <div className="p-4 border-b border-slate-800/60 relative">
        <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1.5 font-semibold">
          Active Repository
        </label>
        <button
          onClick={() => setShowRepoDropdown(!showRepoDropdown)}
          className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-xs font-mono text-slate-200 flex items-center justify-between transition-colors text-left cursor-pointer"
        >
          <div className="truncate pr-2">
            <span className="text-cyan-400 font-bold block truncate">{currentRepoName}</span>
            <span className="text-[10px] text-slate-400">
              {repositories.length > 0 ? 'Engineering Memory Ready' : 'Connect Repository'}
            </span>
          </div>
          <ChevronRight className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${showRepoDropdown ? 'rotate-90' : ''}`} />
        </button>

        {showRepoDropdown && (
          <div className="absolute left-4 right-4 top-20 z-40 bg-[#0A0E1A] border border-slate-700 rounded-xl shadow-2xl p-1 font-mono text-xs space-y-0.5">
            {repositories.map((repo) => {
              const isSelected = repo.name === currentRepoName;
              return (
                <button
                  key={repo.id}
                  onClick={() => handleRepoClick(repo.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors flex items-center justify-between cursor-pointer ${isSelected ? 'text-cyan-400 font-bold bg-slate-900' : 'text-slate-300'
                    }`}
                >
                  <span className="truncate flex items-center gap-2">
                    {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                    <span className="truncate">{repo.name}</span>
                  </span>
                </button>
              );
            })}

            <div className="pt-1 mt-1 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowRepoDropdown(false);
                  onNavigate('/repository');
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-cyan-400 hover:bg-cyan-500/10 transition-colors flex items-center gap-2 font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Repository</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
          Main Navigation
        </div>
        {primaryMenuItems.map((item) => {
          const isActive = isItemActive(item.route);
          return (
            <button
              key={item.route}
              onClick={() => onNavigate(item.route)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-mono transition-all duration-200 cursor-pointer ${isActive
                ? 'bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                }`}
            >
              <div className="flex items-center gap-3">
                <span className={isActive ? 'text-cyan-400' : 'text-slate-500'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
            </button>
          );
        })}

        {/* Secondary Navigation: Resources */}
        <div className="pt-4 mt-3 border-t border-slate-800/60">
          <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
            RESOURCES
          </div>
          {helpMenuItems.map((item) => {
            const isActive = isItemActive(item.route);
            return (
              <button
                key={item.route}
                onClick={() => onNavigate(item.route)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-mono transition-all duration-200 cursor-pointer ${isActive
                  ? 'bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-cyan-400' : 'text-slate-500'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Back to Homepage Button */}
      <div className="p-3 border-t border-slate-800/80">
        <button
          onClick={() => onNavigate('/')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-900/80 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit to Homepage</span>
        </button>
      </div>

    </aside>
  );
};
