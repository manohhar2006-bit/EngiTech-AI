import React, { useState, useEffect } from 'react';
import { MessageCircle, ArrowRight, Sparkles } from 'lucide-react';
import { GraphNode } from '../../types/graph';
import { InvestigationSession } from '../../types/aiAssistant';
import { AIInvestigationSessionService } from '../../services/aiInvestigationSessionService';
import { ActiveRepositoryService } from '../../services/activeRepositoryService';

export interface ReturnToAIInvestigationButtonProps {
  repoId: string;
  node: GraphNode | null;
  onNavigate: (route: string) => void;
  className?: string;
}

export const ReturnToAIInvestigationButton: React.FC<ReturnToAIInvestigationButtonProps> = ({
  repoId,
  node,
  onNavigate,
  className = ''
}) => {
  const [matchingSession, setMatchingSession] = useState<InvestigationSession | null>(() => {
    if (!node || !repoId) return null;
    return AIInvestigationSessionService.findActiveSessionForNode(repoId, node);
  });
  const [sessionUnavailableMsg, setSessionUnavailableMsg] = useState<string | null>(null);

  useEffect(() => {
    setSessionUnavailableMsg(null);
    if (!node || !repoId) {
      setMatchingSession(null);
      return;
    }

    const checkSession = () => {
      const session = AIInvestigationSessionService.findActiveSessionForNode(repoId, node);
      setMatchingSession(session);
    };

    checkSession();
    const unsubscribe = AIInvestigationSessionService.subscribe(checkSession);
    return unsubscribe;
  }, [repoId, node?.id]);

  if (sessionUnavailableMsg) {
    return (
      <div className={`p-2.5 rounded-xl bg-amber-950/30 border border-amber-900/50 text-amber-300 text-xs font-mono flex items-center justify-between ${className}`}>
        <span>{sessionUnavailableMsg}</span>
        <button
          onClick={() => setSessionUnavailableMsg(null)}
          className="text-amber-400 hover:text-white ml-2 text-xs font-bold cursor-pointer"
          title="Dismiss notification"
        >
          ✕
        </button>
      </div>
    );
  }

  // Context-aware: Render nothing if no active investigation exists for this exact node and repo
  if (!matchingSession || !node) {
    return null;
  }

  const handleReturn = () => {
    // 1. Identify and verify session exists
    const validSession = AIInvestigationSessionService.getSession(matchingSession.id);
    if (!validSession || validSession.status !== 'active') {
      setSessionUnavailableMsg('Previous investigation session is no longer available.');
      setMatchingSession(null);
      return;
    }

    // 2. Validate repository identity
    if (validSession.repositoryId !== repoId) {
      setSessionUnavailableMsg('Investigation session belongs to a different repository.');
      setMatchingSession(null);
      return;
    }

    // 3. Confirm target node still matches session
    if (!AIInvestigationSessionService.isNodeMatch(validSession, node)) {
      setSessionUnavailableMsg('Investigation session is not associated with this node.');
      setMatchingSession(null);
      return;
    }

    // 4. Activate existing session
    AIInvestigationSessionService.setActiveSession(validSession.id);
    ActiveRepositoryService.setActiveRepoId(validSession.repositoryId, false);

    // 5. Navigate to dedicated AI Assistant route with exact session ID
    onNavigate(`/ai-assistant?session=${encodeURIComponent(validSession.id)}`);
  };

  const messageCount = matchingSession.messages ? matchingSession.messages.length : 0;
  const modeLabel = matchingSession.investigationMode || 'WHY';
  const targetLabel = matchingSession.targetNodeLabel || node.label;

  return (
    <div className={`space-y-1.5 pt-1 ${className}`}>
      <button
        onClick={handleReturn}
        type="button"
        title={`Return to active ${modeLabel} investigation for ${targetLabel}`}
        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-950/70 via-slate-900 to-cyan-950/70 hover:from-cyan-900/80 hover:via-slate-850 hover:to-cyan-900/80 border border-cyan-500/40 hover:border-cyan-400 text-cyan-200 hover:text-white font-mono text-xs font-bold transition-all flex items-center justify-between group shadow-lg shadow-cyan-950/50 cursor-pointer active:scale-[0.99]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="w-4 h-4 text-cyan-300 shrink-0 group-hover:scale-110 transition-transform" />
          <span className="truncate">Return to AI Investigation</span>
        </div>
        <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
      </button>

      {/* Hierarchy: Active investigation details beneath action button */}
      <div className="text-[10px] text-cyan-400/90 font-mono flex items-center gap-1.5 px-1 truncate">
        <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
        <span className="truncate">
          Active investigation: {targetLabel} · {modeLabel} · {messageCount} {messageCount === 1 ? 'message' : 'messages'}
        </span>
      </div>
    </div>
  );
};

