import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { FactItem, InferenceItem, UnknownItem } from '../../types/why';
import {
  ShieldCheck,
  Zap,
  HelpCircle,
  ExternalLink,
  Info,
  CheckCircle2,
  AlertTriangle,
  HelpCircle as QuestionIcon
} from 'lucide-react';

interface ClassificationCardsProps {
  facts: FactItem[];
  inferences: InferenceItem[];
  unknowns: UnknownItem[];
  onInspectEvidence?: (evidenceId: string) => void;
}

export const ClassificationCards: React.FC<ClassificationCardsProps> = ({
  facts,
  inferences,
  unknowns
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'FACT' | 'INFERENCE' | 'UNKNOWN'>('ALL');

  return (
    <div className="space-y-4">
      {/* Tab Switcher Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-400" /> Statement Classification
        </h3>

        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'ALL'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({facts.length + inferences.length + unknowns.length})
          </button>
          <button
            onClick={() => setActiveTab('FACT')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'FACT'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-emerald-400 hover:bg-emerald-500/10'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> FACT ({facts.length})
          </button>
          <button
            onClick={() => setActiveTab('INFERENCE')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'INFERENCE'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> INFERENCE ({inferences.length})
          </button>
          <button
            onClick={() => setActiveTab('UNKNOWN')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'UNKNOWN'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" /> UNKNOWN ({unknowns.length})
          </button>
        </div>
      </div>

      {/* Grid of Classification Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* FACT Column / Tab */}
        {(activeTab === 'ALL' || activeTab === 'FACT') && (
          <GlassCard variant="glow" padding="sm" className="border-emerald-500/30 bg-emerald-950/10">
            <div className="flex items-center justify-between mb-3 border-b border-emerald-500/20 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                  Verified Facts ({facts.length})
                </span>
              </div>
              <Badge variant="emerald" className="text-[10px]">Direct Evidence</Badge>
            </div>

            {facts.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No direct fact statements available.</p>
            ) : (
              <div className="space-y-2.5">
                {facts.map((fact) => (
                  <div
                    key={fact.id}
                    className="p-2.5 rounded-lg bg-slate-900/80 border border-emerald-500/20 text-xs text-slate-200 leading-relaxed font-mono"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span>✓ {fact.statement}</span>
                      {fact.sourceUrl && (
                        <a
                          href={fact.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 shrink-0 mt-0.5"
                          title="Open Source URL"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {/* INFERENCE Column / Tab */}
        {(activeTab === 'ALL' || activeTab === 'INFERENCE') && (
          <GlassCard variant="glow" padding="sm" className="border-amber-500/30 bg-amber-950/10">
            <div className="flex items-center justify-between mb-3 border-b border-amber-500/20 pb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Inferences ({inferences.length})
                </span>
              </div>
              <Badge variant="amber" className="text-[10px]">Plausible Signals</Badge>
            </div>

            {inferences.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No inferred connections present.</p>
            ) : (
              <div className="space-y-2.5">
                {inferences.map((inf) => (
                  <div
                    key={inf.id}
                    className="p-2.5 rounded-lg bg-slate-900/80 border border-amber-500/20 text-xs text-slate-200 leading-relaxed font-mono"
                  >
                    <div className="font-semibold text-amber-200 mb-1 flex items-center justify-between gap-2">
                      <span>⚡ {inf.statement}</span>
                      {inf.sourceUrl && (
                        <a
                          href={inf.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-400 hover:text-amber-300 shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-slate-400 text-[11px] font-sans border-t border-slate-800/80 pt-1.5 mt-1">
                      <strong>Reasoning:</strong> {inf.reasoning}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {/* UNKNOWN Column / Tab */}
        {(activeTab === 'ALL' || activeTab === 'UNKNOWN') && (
          <GlassCard variant="glow" padding="sm" className="border-slate-700/50 bg-slate-900/40">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <QuestionIcon className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Unknown Rationale ({unknowns.length})
                </span>
              </div>
              <Badge variant="slate" className="text-[10px]">Missing Evidence</Badge>
            </div>

            {unknowns.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No missing evidence areas identified.</p>
            ) : (
              <div className="space-y-2.5">
                {unknowns.map((unk) => (
                  <div
                    key={unk.id}
                    className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300 leading-relaxed font-mono"
                  >
                    <div className="font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{unk.area}</span>
                    </div>
                    <p className="text-slate-400 text-[11px] font-sans border-t border-slate-800/80 pt-1.5 mt-1">
                      {unk.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}
      </div>
    </div>
  );
};
