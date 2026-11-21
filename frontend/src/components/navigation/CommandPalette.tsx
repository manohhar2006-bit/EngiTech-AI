import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Command,
  Network,
  Zap,
  AlertTriangle,
  GitBranch,
  ArrowRight,
  X,
  FileCode,
  Layers,
  History,
  Package,
  BrainCircuit,
  BookOpen,
  LayoutDashboard,
  Brain,
  Sparkles
} from 'lucide-react';
import { GraphNode } from '../../types/graph';
import { MOCK_HERO_GRAPH } from '../../data/mockGraph';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: string) => void;
  onSelectNode?: (node: GraphNode) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onSelectNode
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open handled by parent or state, but here toggling
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter nodes from mock / available graph
  const filteredNodes = MOCK_HERO_GRAPH.nodes.filter(
    (n) =>
      n.label.toLowerCase().includes(query.toLowerCase()) ||
      n.type.toLowerCase().includes(query.toLowerCase()) ||
      (n.sublabel && n.sublabel.toLowerCase().includes(query.toLowerCase()))
  );

  const allQuickActions = [
    {
      id: 'action-overview',
      label: 'Overview & Metrics Dashboard',
      category: 'NAVIGATION',
      icon: <LayoutDashboard className="w-4 h-4 text-cyan-400" />,
      action: () => {
        onClose();
        onNavigate('/dashboard');
      }
    },
    {
      id: 'action-repositories',
      label: 'Manage Repositories',
      category: 'NAVIGATION',
      icon: <GitBranch className="w-4 h-4 text-cyan-400" />,
      action: () => {
        onClose();
        onNavigate('/repository');
      }
    },
    {
      id: 'action-git-history',
      label: 'Explore Git History',
      category: 'ENGINEERING GRAPH',
      icon: <History className="w-4 h-4 text-cyan-400" />,
      action: () => {
        onClose();
        onNavigate('/whygraph?view=git_graph');
      }
    },
    {
      id: 'action-architecture',
      label: 'Explore Architecture',
      category: 'ENGINEERING GRAPH',
      icon: <Layers className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onClose();
        onNavigate('/whygraph?view=architecture');
      }
    },
    {
      id: 'action-dependencies',
      label: 'Explore Dependencies',
      category: 'ENGINEERING GRAPH',
      icon: <Package className="w-4 h-4 text-purple-400" />,
      action: () => {
        onClose();
        onNavigate('/whygraph?view=dependencies');
      }
    },
    {
      id: 'action-decisions',
      label: 'Explore Decisions & Rationale',
      category: 'ENGINEERING GRAPH',
      icon: <BrainCircuit className="w-4 h-4 text-purple-400" />,
      action: () => {
        onClose();
        onNavigate('/whygraph?view=decisions');
      }
    },
    {
      id: 'action-debt',
      label: 'Open Decision Debt',
      category: 'RISK & DEBT',
      icon: <AlertTriangle className="w-4 h-4 text-rose-400" />,
      action: () => {
        onClose();
        onNavigate('/decision-debt');
      }
    },
    {
      id: 'action-docs',
      label: 'Open Documentation',
      category: 'HELP & RESOURCES',
      icon: <BookOpen className="w-4 h-4 text-amber-400" />,
      action: () => {
        onClose();
        onNavigate('/docs');
      }
    },
    {
      id: 'action-ai-assistant',
      label: 'Open EngiTrace AI Assistant',
      category: 'INTELLIGENCE',
      icon: <Sparkles className="w-4 h-4 text-cyan-400" />,
      action: () => {
        onClose();
        onNavigate('/ai-assistant');
      }
    },
    {
      id: 'action-why',
      label: 'Ask WHY Explorer (Historical Rationale)',
      category: 'INTELLIGENCE',
      icon: <Brain className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onClose();
        onNavigate('/whygraph');
      }
    },
    {
      id: 'action-whatif',
      label: 'Run WHAT IF Impact Analysis',
      category: 'INTELLIGENCE',
      icon: <Zap className="w-4 h-4 text-purple-400" />,
      action: () => {
        onClose();
        onNavigate('/whygraph?view=dependencies');
      }
    }
  ];

  const filteredQuickActions = query.trim().length === 0
    ? allQuickActions
    : allQuickActions.filter(
      (a) =>
        a.label.toLowerCase().includes(query.toLowerCase()) ||
        a.category.toLowerCase().includes(query.toLowerCase())
    );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20 p-4 animate-fadeIn">
      <div className="w-full max-w-2xl bg-[#070A12] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col">

        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-900/80">
          <Search className="w-5 h-5 text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search action, docs, component, rationale, or view... (e.g. 'Dependencies', 'Docs')"
            className="w-full bg-transparent border-none text-white placeholder-slate-500 focus:outline-none font-mono text-sm"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-800 rounded border border-slate-700">
            ESC
          </kbd>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4 font-mono text-xs">

          {/* Quick Actions */}
          {filteredQuickActions.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {query.trim().length === 0 ? 'Quick Actions & Views' : `Matching Actions (${filteredQuickActions.length})`}
              </div>
              <div className="space-y-1 mt-1">
                {filteredQuickActions.map((item) => (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-900 text-left transition-colors text-slate-200 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-slate-800/80 group-hover:bg-slate-800">
                        {item.icon}
                      </div>
                      <div>
                        <div className="text-slate-200 group-hover:text-cyan-300 font-semibold">{item.label}</div>
                        <div className="text-[10px] text-slate-500">{item.category}</div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Component Search Results */}
          <div>
            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Matching Components ({filteredNodes.length})</span>
              {query && <span className="text-cyan-400">Filtering for "{query}"</span>}
            </div>

            {filteredNodes.length > 0 ? (
              <div className="space-y-1 mt-1">
                {filteredNodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => {
                      onClose();
                      if (onSelectNode) onSelectNode(node);
                      else onNavigate('/whygraph');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-900 text-left transition-colors text-slate-200 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs">{node.label}</div>
                        <div className="text-[10px] text-slate-400">{node.sublabel || node.type}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 group-hover:text-cyan-300">
                        Inspect →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : query.trim().length > 0 && filteredQuickActions.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                No matching components or actions found for "{query}".
              </div>
            ) : null}
          </div>

        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-800/80 bg-[#05070C] flex items-center justify-between text-[11px] font-mono text-slate-500">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">↵</kbd> Select</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">⌘K</kbd> Toggle</span>
          </div>
          <span className="text-cyan-400">EngiTrace Command Engine</span>
        </div>

      </div>
    </div>
  );
};
