import React, { useState } from 'react';
import {
  Bot,
  User,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Cpu,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { AssistantChatMessage, EvidenceClaim } from '../../../types/aiAssistant';
import { MarkdownRenderer } from '../../../components/ui/MarkdownRenderer';

interface ChatMessageProps {
  message: AssistantChatMessage;
  onSelectFollowUp?: (question: string) => void;
  onOpenEvidence?: (evidenceId: string) => void;
  onOpenSourceUrl?: (url: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onSelectFollowUp,
  onOpenEvidence,
  onOpenSourceUrl
}) => {
  const isUser = message.role === 'user';
  const [expandedClaimIdx, setExpandedClaimIdx] = useState<number | null>(null);

  if (isUser) {
    return (
      <div className="flex justify-end gap-3 max-w-4xl ml-auto mb-6">
        <div className="flex flex-col items-end max-w-2xl">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono text-slate-500">
              {message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
            </span>
            <span className="text-[11px] font-mono font-bold text-slate-300">You</span>
          </div>
          <div className="bg-gradient-to-r from-cyan-600/90 to-blue-600/90 text-white rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-lg shadow-cyan-950/20 text-xs sm:text-sm font-sans leading-relaxed border border-cyan-400/20">
            {message.content}
          </div>
        </div>
        <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0 mt-6">
          <User className="w-4 h-4" />
        </div>
      </div>
    );
  }

  // AI Assistant Response
  return (
    <div className="flex gap-4 max-w-4xl mr-auto mb-8 w-full">
      {/* Assistant Avatar */}
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-slate-900 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-1 shadow-lg shadow-cyan-950/40">
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Header: Name, Model & Timestamp */}
        <div className="flex flex-wrap items-center gap-2.5 mb-2">
          <span className="font-display font-bold text-xs text-white tracking-wide">
            EngiTrace AI
          </span>
          {message.model && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
              {message.model}
            </span>
          )}
          {message.timestamp && (
            <span className="text-[10px] font-mono text-slate-500">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Fallback Notice Banner */}
        {message.isFallback && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-cyan-950/30 border border-cyan-500/20 flex items-center justify-between text-xs text-cyan-300">
            <span className="flex items-center gap-2 text-[11px] font-mono">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Reasoned via EngiTrace Grounded Evidence Engine (Strict Grounding ON)</span>
            </span>
            <span className="text-[10px] font-mono font-bold text-cyan-400/80 uppercase">
              LOCAL FALLBACK
            </span>
          </div>
        )}

        {/* Main Answer Card */}
        <div className={`p-5 rounded-2xl border transition-all ${
          message.isError
            ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
            : 'bg-[#0B0F19]/90 border-slate-800/90 shadow-xl'
        }`}>
          {/* Markdown Content */}
          <div className="text-slate-200 text-xs sm:text-sm font-sans leading-relaxed">
            <MarkdownRenderer content={message.content} />
          </div>

          {/* Evidence-Backed Claims Breakdown */}
          {message.claims && message.claims.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  Evidence Grounding & Claims ({message.claims.length})
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  Click claim to inspect citations
                </span>
              </div>

              <div className="space-y-2">
                {message.claims.map((claim, idx) => {
                  const isExpanded = expandedClaimIdx === idx;
                  const isFact = claim.classification === 'FACT';
                  const isInf = claim.classification === 'INFERENCE';
                  const isUnk = claim.classification === 'UNKNOWN';

                  return (
                    <div
                      key={idx}
                      onClick={() => setExpandedClaimIdx(isExpanded ? null : idx)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                        isExpanded
                          ? 'bg-slate-900/90 border-cyan-500/40 shadow-md ring-1 ring-cyan-500/20'
                          : isFact
                          ? 'bg-emerald-950/10 border-emerald-500/20 hover:border-emerald-500/40'
                          : isInf
                          ? 'bg-amber-950/10 border-amber-500/20 hover:border-amber-500/40'
                          : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {isFact && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              FACT
                            </span>
                          )}
                          {isInf && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              INFERENCE
                            </span>
                          )}
                          {isUnk && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider bg-slate-800 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                              <HelpCircle className="w-3 h-3" />
                              UNKNOWN
                            </span>
                          )}
                          {claim.evidenceIds && claim.evidenceIds.length > 0 && (
                            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-500/30">
                              {claim.evidenceIds.length} citation{claim.evidenceIds.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isExpanded ? 'rotate-90 text-cyan-400' : ''}`} />
                      </div>

                      <p className="text-slate-200 mt-2 font-sans text-xs leading-relaxed">
                        {claim.text}
                      </p>

                      {/* Expanded Claim Details */}
                      {isExpanded && (
                        <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2">
                          {claim.reasoning && (
                            <p className="text-[11px] text-amber-300/90 italic pl-2 border-l-2 border-amber-500/40">
                              <span className="font-semibold">Reasoning: </span>
                              {claim.reasoning}
                            </p>
                          )}

                          {claim.evidenceIds && claim.evidenceIds.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-[10px] font-mono text-slate-400 mr-1">
                                Citations:
                              </span>
                              {claim.evidenceIds.map((evId) => (
                                <button
                                  key={evId}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onOpenEvidence) onOpenEvidence(evId);
                                  }}
                                  className="px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-[10px] font-mono text-cyan-300 flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <span>{evId}</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Suggested Follow-Up Questions Chips */}
        {message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {message.suggestedFollowUps.map((q, qIdx) => (
              <button
                key={qIdx}
                onClick={() => onSelectFollowUp && onSelectFollowUp(q)}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/40 text-xs font-mono text-slate-300 hover:text-cyan-300 transition-all text-left cursor-pointer"
              >
                <ArrowRight className="w-3 h-3 text-cyan-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                <span>{q}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

