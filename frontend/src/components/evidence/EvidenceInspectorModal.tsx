import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { NormalizedEvidence } from '../../types/evidence';
import {
  X,
  ExternalLink,
  ShieldCheck,
  Zap,
  HelpCircle,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  FileCode,
  Package,
  User,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';

interface EvidenceInspectorModalProps {
  evidence: NormalizedEvidence | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EvidenceInspectorModal: React.FC<EvidenceInspectorModalProps> = ({
  evidence,
  isOpen,
  onClose
}) => {
  if (!isOpen || !evidence) return null;

  const getClassificationBadge = (cls: string) => {
    switch (cls) {
      case 'FACT':
        return (
          <Badge variant="emerald" className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" /> FACT
          </Badge>
        );
      case 'INFERENCE':
        return (
          <Badge variant="amber" className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
            <Zap className="w-3.5 h-3.5" /> INFERENCE
          </Badge>
        );
      case 'UNKNOWN':
      default:
        return (
          <Badge variant="slate" className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
            <HelpCircle className="w-3.5 h-3.5" /> UNKNOWN
          </Badge>
        );
    }
  };

  const getSourceIcon = (sourceStr: string) => {
    if (sourceStr.startsWith('commit:')) return <GitCommit className="w-4 h-4 text-blue-400" />;
    if (sourceStr.startsWith('pr:')) return <GitPullRequest className="w-4 h-4 text-purple-400" />;
    if (sourceStr.startsWith('issue:')) return <AlertCircle className="w-4 h-4 text-amber-400" />;
    if (sourceStr.startsWith('file:')) return <FileCode className="w-4 h-4 text-emerald-400" />;
    if (sourceStr.startsWith('dependency:')) return <Package className="w-4 h-4 text-pink-400" />;
    if (sourceStr.startsWith('author:')) return <User className="w-4 h-4 text-sky-400" />;
    return <Layers className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl">
        <GlassCard variant="glow" padding="lg" className="border-indigo-500/30 shadow-2xl shadow-indigo-950/50">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                {getClassificationBadge(evidence.classification)}
                <span className="text-xs font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                  {evidence.id}
                </span>
                <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                  Confidence: {Math.round((evidence.confidence || 0.9) * 100)}%
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                {evidence.title || 'Historical Evidence Record'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Source -> Target Connection */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-300 font-mono">
              {getSourceIcon(evidence.source)}
              <span>{evidence.source}</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs font-semibold text-indigo-300">
              <span>{evidence.relationshipType}</span>
              <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-300 font-mono">
              {getSourceIcon(evidence.target)}
              <span>{evidence.target}</span>
            </div>
          </div>

          {/* Body Description */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Evidence Details & Context
              </label>
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 text-sm text-slate-300 leading-relaxed font-mono">
                {evidence.description || 'Direct historical relationship recorded in repository engineering memory graph.'}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/50">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Timestamp: {new Date(evidence.timestamp).toLocaleString()}</span>
              </div>
              <div>
                <span>Repository: {evidence.repositoryId}</span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Close
            </button>
            {evidence.sourceUrl && (
              <a
                href={evidence.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Open GitHub Source</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
