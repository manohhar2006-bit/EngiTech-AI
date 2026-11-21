import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  FileCode,
  Box,
  GitCommit,
  Sparkles,
  HelpCircle,
  Zap,
  Layers,
  Search,
  Check
} from 'lucide-react';
import { GraphNode } from '../../../types/graph';
import { InvestigationMode } from '../../../types/aiAssistant';

interface ChangeContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  repositories: Array<{ id: string; name: string }>;
  selectedRepoId: string;
  onSelectRepo: (id: string) => void;
  graphNodes: GraphNode[];
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode | null) => void;
  activeMode: InvestigationMode;
  onSelectMode: (mode: InvestigationMode) => void;
  onApplyContext: (newTopic?: string) => void;
  title?: string;
}

export const ChangeContextModal: React.FC<ChangeContextModalProps> = ({
  isOpen,
  onClose,
  repositories,
  selectedRepoId,
  onSelectRepo,
  graphNodes,
  selectedNode,
  onSelectNode,
  activeMode,
  onSelectMode,
  onApplyContext,
  title = 'Configure Investigation Context'
}) => {
  const [nodeSearch, setNodeSearch] = useState('');
  const [topicInput, setTopicInput] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setNodeSearch('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter nodes suitable for investigation (files, dependencies, commits, decisions)
  const filteredNodes = graphNodes
    .filter((n) => n.type !== 'REPOSITORY')
    .filter((n) => {
      if (!nodeSearch.trim()) return true;
      const q = nodeSearch.toLowerCase();
      return (
        n.label.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        (n.sublabel && n.sublabel.toLowerCase().includes(q)) ||
        (typeof n.metadata?.path === 'string' && n.metadata.path.toLowerCase().includes(q))
      );
    })
    .slice(0, 30); // reasonable display limit

  const handleApply = () => {
    onApplyContext(topicInput.trim() || undefined);
    onClose();
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'FILE':
        return <FileCode className="w-3.5 h-3.5 text-cyan-400" />;
      case 'DEPENDENCY':
        return <Box className="w-3.5 h-3.5 text-emerald-400" />;
      case 'COMMIT':
        return <GitCommit className="w-3.5 h-3.5 text-amber-400" />;
      case 'DECISION':
        return <Sparkles className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0A0E1A] border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-display tracking-wide">
                {title}
              </h2>
              <p className="text-[11px] text-slate-400 font-sans">
                Select repository, target entity, and investigation mode.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* 1. Repository Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
              <span>1. Target Repository</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {repositories.map((repo) => {
                const isSelected = repo.id === selectedRepoId;
                return (
                  <button
                    key={repo.id}
                    onClick={() => onSelectRepo(repo.id)}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 font-bold shadow-sm ring-1 ring-cyan-500/20'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="truncate">{repo.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-cyan-400 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Investigation Mode */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>2. Investigation Mode</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => onSelectMode('WHY')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  activeMode === 'WHY'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-bold ring-1 ring-emerald-500/20'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold mb-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>WHY</span>
                </div>
                <p className="text-[10px] text-slate-400 font-sans leading-tight">
                  Historical rationale, commits & PR evidence.
                </p>
              </button>

              <button
                onClick={() => onSelectMode('WHAT_IF')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  activeMode === 'WHAT_IF'
                    ? 'bg-purple-500/10 border-purple-500/50 text-purple-300 font-bold ring-1 ring-purple-500/20'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-purple-400 font-bold mb-1">
                  <Zap className="w-3.5 h-3.5" />
                  <span>WHAT IF</span>
                </div>
                <p className="text-[10px] text-slate-400 font-sans leading-tight">
                  Deterministic graph impact & breakage risk.
                </p>
              </button>

              <button
                onClick={() => onSelectMode('GENERAL')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  activeMode === 'GENERAL'
                    ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 font-bold ring-1 ring-cyan-500/20'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold mb-1">
                  <Layers className="w-3.5 h-3.5" />
                  <span>GENERAL</span>
                </div>
                <p className="text-[10px] text-slate-400 font-sans leading-tight">
                  Codebase structure, architecture & flow.
                </p>
              </button>
            </div>
          </div>

          {/* 3. Target Entity Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                <span>3. Target Entity (Optional)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal">
                {graphNodes.length} graph entities available
              </span>
            </label>

            {/* "Entire Repository" option */}
            <button
              onClick={() => onSelectNode(null)}
              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer mb-2 ${
                selectedNode === null
                  ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-bold ring-1 ring-cyan-500/20'
                  : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Entire Repository (Repository-wide Investigation)</span>
              </div>
              {selectedNode === null && <Check className="w-4 h-4 text-cyan-400" />}
            </button>

            {/* Search filter for nodes */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter files, components, dependencies..."
                value={nodeSearch}
                onChange={(e) => setNodeSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 font-sans"
              />
            </div>

            {/* Scrollable Node List */}
            <div className="max-h-48 overflow-y-auto space-y-1 p-1 bg-slate-950/60 rounded-xl border border-slate-800/80">
              {filteredNodes.length === 0 ? (
                <div className="p-3 text-center text-slate-500 font-sans text-xs">
                  No matching graph entities found.
                </div>
              ) : (
                filteredNodes.map((node) => {
                  const isNodeSelected = selectedNode?.id === node.id;
                  return (
                    <button
                      key={node.id}
                      onClick={() => onSelectNode(node)}
                      className={`w-full p-2 rounded-lg text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                        isNodeSelected
                          ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                          : 'hover:bg-slate-900 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {getNodeIcon(node.type)}
                        <span className="truncate">{node.label}</span>
                        <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                          {node.type}
                        </span>
                      </div>
                      {isNodeSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer active:scale-95"
          >
            Apply Investigation Context
          </button>
        </div>
      </div>
    </div>
  );
};

