/**
 * EngiTrace Recent Investigations Modal
 *
 * Displays saved AI investigation sessions stored in browser storage.
 * Supports switching sessions, archiving, unarchiving, filtering,
 * and two-step confirmation deletion.
 */

import React, { useState } from 'react';
import {
  X,
  History,
  GitBranch,
  FileCode,
  Layers,
  MessageSquare,
  Clock,
  Trash2,
  Archive,
  ArchiveRestore,
  Sparkles,
  Search,
  CheckCircle2,
  Plus,
  AlertTriangle
} from 'lucide-react';
import { InvestigationSession } from '../../../types/aiAssistant';

interface RecentInvestigationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: InvestigationSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewInvestigation: () => void;
}

export const RecentInvestigationsModal: React.FC<RecentInvestigationsModalProps> = ({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
  onNewInvestigation
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Format relative time helper
  const formatTimeAgo = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return dateStr;
    }
  };

  // Filter sessions
  const filteredSessions = sessions.filter((s) => {
    if (statusFilter === 'active' && s.status !== 'active') return false;
    if (statusFilter === 'archived' && s.status !== 'archived') return false;

    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      s.investigationTopic.toLowerCase().includes(q) ||
      (s.repositoryName && s.repositoryName.toLowerCase().includes(q)) ||
      s.repositoryId.toLowerCase().includes(q) ||
      (s.targetNodeLabel && s.targetNodeLabel.toLowerCase().includes(q)) ||
      s.investigationMode.toLowerCase().includes(q)
    );
  });

  const getModeBadge = (mode: string) => {
    switch (mode) {
      case 'WHY':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            WHY
          </span>
        );
      case 'WHAT_IF':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            WHAT IF
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            GENERAL
          </span>
        );
    }
  };

  const handleSelect = (sessionId: string) => {
    onSelectSession(sessionId);
    onClose();
  };

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirmDeleteId === sessionId) {
      onDeleteSession(sessionId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(sessionId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn select-none">
      <div className="bg-[#0A0E1A] border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-display font-bold text-white tracking-wide">
                  Recent Investigations
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {sessions.length} saved
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Saved engineering investigation sessions in this browser tab.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onNewInvestigation();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>New Investigation</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-mono text-xs">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search by topic, repository, or target..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-cyan-500/60 focus:outline-none text-slate-200 placeholder-slate-500 transition-colors"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({sessions.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active ({sessions.filter((s) => s.status === 'active').length})
            </button>
            <button
              onClick={() => setStatusFilter('archived')}
              className={`px-3 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                statusFilter === 'archived'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Archived ({sessions.filter((s) => s.status === 'archived').length})
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredSessions.length === 0 ? (
            <div className="py-16 text-center text-slate-500 font-mono text-xs">
              <History className="w-10 h-10 text-slate-600 mx-auto mb-3 opacity-60" />
              <p className="font-bold text-slate-400 mb-1">
                {sessions.length === 0 ? 'No Saved Investigations Yet' : 'No Matching Investigations'}
              </p>
              <p className="text-slate-500 max-w-sm mx-auto mb-4 font-sans text-xs">
                {sessions.length === 0
                  ? 'Conversations you have with EngiTrace AI will automatically appear here and persist across navigation.'
                  : 'Try adjusting your search filter or start a fresh investigation.'}
              </p>
              {sessions.length === 0 && (
                <button
                  onClick={() => {
                    onClose();
                    onNewInvestigation();
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors cursor-pointer"
                >
                  Start First Investigation
                </button>
              )}
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isDeleting = confirmDeleteId === session.id;

              return (
                <div
                  key={session.id}
                  onClick={() => handleSelect(session.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer group relative ${
                    isActive
                      ? 'bg-cyan-950/20 border-cyan-500/50 shadow-lg shadow-cyan-950/30'
                      : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    {/* Top Row: Mode & Active Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {getModeBadge(session.investigationMode)}

                      {isActive && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                          ACTIVE SESSION
                        </span>
                      )}

                      {session.status === 'archived' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                          <Archive className="w-3 h-3" />
                          ARCHIVED
                        </span>
                      )}

                      <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-600" />
                        {formatTimeAgo(session.updatedAt)}
                      </span>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex items-center gap-1.5 opacity-90 sm:opacity-40 group-hover:opacity-100 transition-opacity">
                      {session.status === 'archived' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUnarchiveSession(session.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-cyan-300 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Restore to Active"
                        >
                          <ArchiveRestore className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onArchiveSession(session.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-amber-300 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Archive Investigation"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}

                      {isDeleting ? (
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => handleDeleteClick(e, session.id)}
                            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold font-mono transition-colors cursor-pointer"
                          >
                            Confirm Delete?
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer text-[10px]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => handleDeleteClick(e, session.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/30 transition-colors cursor-pointer"
                          title="Delete Investigation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Investigation Topic */}
                  <h3 className="text-sm font-semibold text-slate-100 mb-2 font-display group-hover:text-cyan-300 transition-colors line-clamp-2">
                    {session.investigationTopic || 'Awaiting initial question...'}
                  </h3>

                  {/* Context Details Line */}
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
                    <span className="flex items-center gap-1 text-slate-300">
                      <GitBranch className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate max-w-[200px]">
                        {session.repositoryName || session.repositoryId}
                      </span>
                    </span>

                    {session.targetNodeLabel && (
                      <span className="flex items-center gap-1 text-slate-300">
                        <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate max-w-[240px]">
                          {session.targetNodeLabel}
                        </span>
                      </span>
                    )}

                    <span className="flex items-center gap-1 text-slate-400">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{session.messages.length} message{session.messages.length === 1 ? '' : 's'}</span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-xs font-mono text-slate-500">
          <span>Click any investigation to resume its conversation.</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

