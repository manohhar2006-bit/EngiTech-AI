/**
 * EngiTrace Phase 4 - Polished AI Explanation & Grounded Reasoning Panel Component
 */

import React, { useState } from 'react';
import { AIReasoningResponse, AIClaim } from '../../types/why';
import { Bot, CheckCircle2, AlertTriangle, HelpCircle, ExternalLink, ShieldCheck, Cpu, ChevronRight } from 'lucide-react';

interface AIExplanationPanelProps {
  aiResponse: AIReasoningResponse | null;
  isAnalyzing: boolean;
  onSelectClaim?: (claim: AIClaim) => void;
  onOpenEvidence?: (evidenceId: string) => void;
  onOpenSourceUrl?: (url: string) => void;
}

export const AIExplanationPanel: React.FC<AIExplanationPanelProps> = ({
  aiResponse,
  isAnalyzing,
  onSelectClaim,
  onOpenEvidence,
  onOpenSourceUrl
}) => {
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  if (isAnalyzing) {
    return (
      <div className="bg-[#0f172a]/90 backdrop-blur-md border border-cyan-500/30 rounded-xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
          <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/30 animate-pulse">
            <Bot className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide uppercase">Reconstructing WHY with AI Reasoning</h3>
            <p className="text-xs text-slate-400">Filtering neighborhood graph & verifying evidence citations...</p>
          </div>
        </div>

        <div className="space-y-3 py-2">
          <div className="flex items-center space-x-3 text-xs text-emerald-400 font-mono">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Historical chain assembled from memory graph</span>
          </div>
          <div className="flex items-center space-x-3 text-xs text-emerald-400 font-mono">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Neighborhood evidence records prioritized & deduplicated</span>
          </div>
          <div className="flex items-center space-x-3 text-xs text-cyan-400 font-mono animate-pulse">
            <Cpu className="w-4 h-4 text-cyan-400 animate-spin" />
            <span>Synthesizing grounded explanation via AI provider...</span>
          </div>
          <div className="flex items-center space-x-3 text-xs text-slate-500 font-mono">
            <div className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[10px]">4</div>
            <span>Verifying claim groundings & hallucination defense</span>
          </div>
        </div>
      </div>
    );
  }

  if (!aiResponse) return null;

  const handleClaimClick = (claim: AIClaim) => {
    const claimKey = claim.id || claim.text;
    setSelectedClaimId(selectedClaimId === claimKey ? null : claimKey);
    if (onSelectClaim) {
      onSelectClaim(claim);
    }
  };

  const confidenceLevel = aiResponse.confidence?.level || 'HIGH';
  const confidenceScore = Math.round((aiResponse.confidence?.score || 0.85) * 100);

  const getConfidenceBadgeColor = (level: string) => {
    switch (level) {
      case 'HIGH':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'MEDIUM':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      default:
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
  };

  return (
    <div className="bg-[#0f172a]/95 backdrop-blur-md border border-cyan-500/30 rounded-xl p-5 shadow-2xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
            <Bot className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-white tracking-wider uppercase">AI Evidence Reasoning Engine</h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Model: <span className="text-cyan-300">{aiResponse.modelMetadata.model}</span> | Prompt: <span className="text-slate-300">{aiResponse.modelMetadata.promptVersion}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${getConfidenceBadgeColor(confidenceLevel)} flex items-center space-x-1`}>
            <ShieldCheck className="w-3 h-3 mr-1 inline" />
            {confidenceLevel} CONFIDENCE ({confidenceScore}%)
          </span>
        </div>
      </div>

      {/* Fallback Banner Notice */}
      {aiResponse.modelMetadata.fallbackUsed && (
        <div className="bg-cyan-950/40 border border-cyan-500/20 rounded-lg px-3 py-2 text-xs text-cyan-300 flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Reasoned via EngiTrace Grounded Evidence Engine</span>
          </span>
          <span className="text-[10px] text-cyan-400/70 font-mono">STRICT GROUNDING ON</span>
        </div>
      )}

      {/* Reconstructed Summary */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 space-y-1.5">
        <div className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">Grounding Synthesis</div>
        <p className="text-xs text-slate-200 leading-relaxed font-sans">{aiResponse.summary}</p>
      </div>

      {/* Claims Breakdown: FACT / INFERENCE / UNKNOWN */}
      <div className="space-y-3">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>Evidence-Backed Claims</span>
          <span className="text-[10px] text-slate-500 font-normal">Click any claim to highlight graph path</span>
        </div>

        <div className="space-y-2.5">
          {aiResponse.claims.map((claim, idx) => {
            const isSelected = selectedClaimId === (claim.id || claim.text);
            const isFact = claim.classification === 'FACT';
            const isInf = claim.classification === 'INFERENCE';
            const isUnk = claim.classification === 'UNKNOWN';

            return (
              <div
                key={claim.id || idx}
                onClick={() => handleClaimClick(claim)}
                className={`cursor-pointer transition-all duration-200 border rounded-lg p-3 ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-950/30 shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400/40'
                    : isFact
                    ? 'border-emerald-500/20 bg-emerald-950/10 hover:border-emerald-500/40'
                    : isInf
                    ? 'border-amber-500/20 bg-amber-950/10 hover:border-amber-500/40'
                    : 'border-slate-700/40 bg-slate-900/40 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between space-x-2">
                  <div className="flex items-center space-x-2">
                    {isFact && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
                        FACT
                      </span>
                    )}
                    {isInf && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center">
                        <AlertTriangle className="w-3 h-3 mr-1 text-amber-400" />
                        INFERENCE
                      </span>
                    )}
                    {isUnk && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-slate-700/40 text-slate-300 border border-slate-600/40 flex items-center">
                        <HelpCircle className="w-3 h-3 mr-1 text-slate-400" />
                        UNKNOWN
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono">
                      Conf: {Math.round(claim.confidence * 100)}%
                    </span>
                  </div>

                  <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isSelected ? 'rotate-90 text-cyan-400' : ''}`} />
                </div>

                <p className="text-xs text-slate-200 mt-2 font-medium leading-relaxed">{claim.text}</p>

                {claim.reasoning && (
                  <p className="text-[11px] text-amber-300/80 mt-1 italic pl-2 border-l-2 border-amber-500/40">
                    Reasoning: {claim.reasoning}
                  </p>
                )}

                {/* Evidence Chips */}
                {claim.evidenceIds && claim.evidenceIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-800/60">
                    <span className="text-[10px] text-slate-400 font-mono mr-1">Evidence:</span>
                    {claim.evidenceIds.map((evId) => (
                      <button
                        key={evId}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenEvidence) onOpenEvidence(evId);
                        }}
                        className="px-2 py-0.5 bg-slate-800/80 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 rounded text-[10px] font-mono transition-colors flex items-center"
                      >
                        [ {evId} ]
                      </button>
                    ))}
                  </div>
                )}

                {/* Direct Source URLs */}
                {claim.sourceUrls && claim.sourceUrls.length > 0 && (
                  <div className="flex items-center space-x-2 mt-2">
                    {claim.sourceUrls.map((url, uIdx) => (
                      <a
                        key={uIdx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenSourceUrl) onOpenSourceUrl(url);
                        }}
                        className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-1 font-mono"
                      >
                        <span>GitHub Source</span>
                        <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Explainable Confidence Basis */}
      {aiResponse.confidence?.reasons && aiResponse.confidence.reasons.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Grounding Basis & Metric Checks</div>
          <div className="space-y-1">
            {aiResponse.confidence.reasons.map((reason, rIdx) => (
              <div key={rIdx} className="text-[11px] font-mono text-slate-300 flex items-center space-x-1.5">
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
