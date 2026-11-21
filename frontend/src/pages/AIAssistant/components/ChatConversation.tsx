import React, { useRef, useEffect } from 'react';
import { Bot, Loader2, Sparkles, AlertCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { AssistantChatMessage, InvestigationContext } from '../../../types/aiAssistant';
import { ChatMessage } from './ChatMessage';
import { NewInvestigationState } from './NewInvestigationState';

interface ChatConversationProps {
  messages: AssistantChatMessage[];
  isLoading: boolean;
  context: InvestigationContext;
  suggestedQuestions: string[];
  nodeNotFound?: string | null;
  onClearUnavailableNode?: () => void;
  onBackToGraph?: () => void;
  onSelectPrompt: (prompt: string) => void;
  onOpenEvidence?: (evidenceId: string) => void;
  onOpenSourceUrl?: (url: string) => void;
}

export const ChatConversation: React.FC<ChatConversationProps> = ({
  messages,
  isLoading,
  context,
  suggestedQuestions,
  nodeNotFound,
  onClearUnavailableNode,
  onBackToGraph,
  onSelectPrompt,
  onOpenEvidence,
  onOpenSourceUrl
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message or loading change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-4xl mx-auto">
        {/* Unavailable Node Warning Banner */}
        {nodeNotFound && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 mb-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
            <div>
              <div className="font-bold flex items-center gap-2 text-amber-300 font-mono text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Target Entity Unavailable in Graph</span>
              </div>
              <p className="text-xs text-amber-300/80 font-sans mt-1">
                Requested entity <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-cyan-300">{nodeNotFound}</code> was not found in repository <strong>{context.repositoryName}</strong>. No invalid request was submitted.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onClearUnavailableNode && (
                <button
                  onClick={onClearUnavailableNode}
                  className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer transition-colors shadow-sm"
                >
                  Investigate Repository
                </button>
              )}
              {onBackToGraph && (
                <button
                  onClick={onBackToGraph}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-300 text-xs font-mono cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Graph</span>
                </button>
              )}
            </div>
          </div>
        )}

        {messages.length === 0 ? (
          <NewInvestigationState
            context={context}
            onSelectPrompt={onSelectPrompt}
            suggestedQuestions={suggestedQuestions}
          />
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onSelectFollowUp={onSelectPrompt}
                onOpenEvidence={onOpenEvidence}
                onOpenSourceUrl={onOpenSourceUrl}
              />
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-4 max-w-4xl mr-auto mb-8 animate-fadeIn">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-slate-900 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-lg shadow-cyan-950/40">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-display font-bold text-xs text-white tracking-wide">
                      EngiTrace AI
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Analyzing repository evidence...
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#0B0F19]/90 border border-cyan-500/30 shadow-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-300 font-mono">
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      <span>Extracting graph neighborhood and Git commit churn records...</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-sans">
                      Grounding reasoning strictly on engineering memory graph artifacts.
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
};

