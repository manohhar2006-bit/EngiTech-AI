/**
 * EngiTrace Switch Repository Confirmation Modal
 *
 * Prevents cross-repository conversation leakage. Prompts the user when switching
 * repositories while an active investigation with messages is open, ensuring
 * previous conversations are safely preserved and not silently overwritten or combined.
 */

import React from 'react';
import { AlertCircle, GitBranch, Plus, History, ArrowRight } from 'lucide-react';

interface SwitchRepoConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRepoName: string;
  targetRepoName: string;
  targetRepoId: string;
  hasTargetRepoSession: boolean;
  onStartNewInvestigation: (targetRepoId: string) => void;
  onResumeTargetRepoSession: (targetRepoId: string) => void;
}

export const SwitchRepoConfirmModal: React.FC<SwitchRepoConfirmModalProps> = ({
  isOpen,
  onClose,
  currentRepoName,
  targetRepoName,
  targetRepoId,
  hasTargetRepoSession,
  onStartNewInvestigation,
  onResumeTargetRepoSession
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn select-none font-sans">
      <div className="bg-[#0A0E1A] border border-slate-700/80 rounded-2xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/60 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-sm text-white">
              Switching Repository Context
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Prevent cross-repository evidence leakage
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 font-mono text-xs">
          <p className="text-slate-300 font-sans leading-relaxed">
            You currently have an active investigation in{' '}
            <strong className="text-cyan-400">{currentRepoName}</strong>.
            Switching repositories must never mix evidence from two codebases.
          </p>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5 text-slate-400">
              <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
              <span>Target:</span>
            </span>
            <span className="font-bold text-white truncate max-w-[220px]">
              {targetRepoName}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 font-sans">
            Your current conversation will be safely saved in <strong>Recent Investigations</strong> and can be resumed at any time.
          </p>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-col gap-2">
          {hasTargetRepoSession && (
            <button
              onClick={() => {
                onResumeTargetRepoSession(targetRepoId);
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors cursor-pointer"
            >
              <History className="w-4 h-4" />
              <span>Resume Existing {targetRepoName} Session</span>
            </button>
          )}

          <button
            onClick={() => {
              onStartNewInvestigation(targetRepoId);
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold transition-all cursor-pointer shadow-md"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Start New Investigation for {targetRepoName}</span>
          </button>

          <button
            onClick={onClose}
            className="w-full py-2 text-center text-slate-400 hover:text-white transition-colors cursor-pointer text-xs font-mono"
          >
            Keep Current Investigation
          </button>
        </div>
      </div>
    </div>
  );
};

