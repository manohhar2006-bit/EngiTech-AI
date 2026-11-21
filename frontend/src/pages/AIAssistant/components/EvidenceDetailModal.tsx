import React from 'react';
import { X, ExternalLink, ShieldCheck, GitCommit, GitPullRequest, AlertCircle, FileCode } from 'lucide-react';

interface EvidenceDetailModalProps {
  evidenceItem: any | null;
  onClose: () => void;
}

export const EvidenceDetailModal: React.FC<EvidenceDetailModalProps> = ({
  evidenceItem,
  onClose
}) => {
  if (!evidenceItem) return null;

  const url = evidenceItem.url || evidenceItem.sourceUrl;
  const classification = evidenceItem.classification;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0A0E1A] border border-slate-700/80 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4 font-mono text-xs select-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Evidence Record Details</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Title / Identifier</span>
            <p className="font-bold text-slate-200 mt-0.5 text-xs">
              {evidenceItem.title || evidenceItem.id || evidenceItem.message || 'Evidence Record'}
            </p>
          </div>

          {classification && (
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Classification</span>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                classification === 'FACT'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : classification === 'INFERENCE'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800 text-rose-300 border border-rose-500/30'
              }`}>
                {classification}
              </span>
            </div>
          )}

          {evidenceItem.description && (
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Description</span>
              <p className="text-slate-300 font-sans text-xs leading-relaxed mt-1 p-3 rounded-xl bg-slate-900 border border-slate-800">
                {evidenceItem.description}
              </p>
            </div>
          )}

          {evidenceItem.authorName && (
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Author</span>
              <p className="text-slate-300 mt-0.5">{evidenceItem.authorName}</p>
            </div>
          )}

          {evidenceItem.date && (
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Timestamp</span>
              <p className="text-slate-400 mt-0.5">{evidenceItem.date}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold text-xs transition-colors"
            >
              <span>Open on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <span className="text-[10px] text-slate-500 italic">No external URL recorded</span>
          )}

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

