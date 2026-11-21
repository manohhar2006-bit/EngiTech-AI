/**
 * EngiTrace AI Investigation Central Session Context
 *
 * Provides application-wide investigation session state mounted above page routes.
 * Ensures session continuity across internal route changes, sidebar navigation,
 * and page reloads while delegating persistence to AIInvestigationSessionService.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  InvestigationSession,
  CreateSessionParams,
  AssistantChatMessage,
  InvestigationMode
} from '../types/aiAssistant';
import { AIInvestigationSessionService } from '../services/aiInvestigationSessionService';
import { ActiveRepositoryService } from '../services/activeRepositoryService';

export interface AIInvestigationContextValue {
  sessions: InvestigationSession[];
  activeSession: InvestigationSession | null;
  activeSessionId: string | null;
  createSession: (params: CreateSessionParams) => InvestigationSession;
  selectSession: (sessionId: string) => InvestigationSession | null;
  updateActiveSession: (updates: Partial<InvestigationSession>, targetSessionId?: string) => void;
  appendMessageToActiveSession: (message: AssistantChatMessage, targetSessionId?: string) => void;

  clearActiveSessionMessages: () => void;
  archiveSession: (sessionId: string) => void;
  unarchiveSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  createNewInvestigation: (params: {
    repositoryId: string;
    repositoryName?: string;
    targetNodeId?: string;
    targetNodeLabel?: string;
    targetNodeType?: string;
    targetFilePath?: string;
    targetNodeMetadata?: Record<string, any>;
    investigationMode?: InvestigationMode;
    investigationTopic?: string;
    originContext?: InvestigationSession['originContext'];
  }) => InvestigationSession;
  findSessionByContext: (
    repoId: string,
    targetNodeId?: string | null,
    mode?: InvestigationMode
  ) => InvestigationSession | null;
  refreshSessions: () => void;
}

const AIInvestigationContext = createContext<AIInvestigationContextValue | null>(null);

export const AIInvestigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<InvestigationSession[]>(() => {
    return AIInvestigationSessionService.getAllSessions();
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return AIInvestigationSessionService.getActiveSessionId();
  });

  // Synchronize state from service whenever storage or memory updates
  const refreshSessions = useCallback(() => {
    const all = AIInvestigationSessionService.getAllSessions();
    const currentActiveId = AIInvestigationSessionService.getActiveSessionId();
    setSessions(all);
    setActiveSessionId(currentActiveId);
  }, []);

  useEffect(() => {
    const unsubscribe = AIInvestigationSessionService.subscribe(() => {
      refreshSessions();
    });
    return unsubscribe;
  }, [refreshSessions]);

  // Derive the active session object
  const activeSession: InvestigationSession | null = React.useMemo(() => {
    if (!activeSessionId) {
      // If no explicit ID, get active from service
      return sessions.find((s) => s.status === 'active') || sessions[0] || null;
    }
    return sessions.find((s) => s.id === activeSessionId) || sessions.find((s) => s.status === 'active') || null;
  }, [sessions, activeSessionId]);

  // Create a session
  const createSession = useCallback((params: CreateSessionParams): InvestigationSession => {
    const created = AIInvestigationSessionService.createSession(params);
    refreshSessions();
    return created;
  }, [refreshSessions]);

  // Select/switch active session
  const selectSession = useCallback((sessionId: string): InvestigationSession | null => {
    AIInvestigationSessionService.setActiveSession(sessionId);
    const session = AIInvestigationSessionService.getSession(sessionId);
    if (session && session.repositoryId) {
      // Sync active repository if switching to a session from another repo
      ActiveRepositoryService.setActiveRepoId(session.repositoryId, false);
    }
    refreshSessions();
    return session;
  }, [refreshSessions]);

  // Update active session
  const updateActiveSession = useCallback((updates: Partial<InvestigationSession>, targetSessionId?: string) => {
    const currentId = targetSessionId || AIInvestigationSessionService.getActiveSessionId();
    if (currentId) {
      AIInvestigationSessionService.updateSession(currentId, updates);
      refreshSessions();
    }
  }, [refreshSessions]);

  // Append message to active session
  const appendMessageToActiveSession = useCallback((message: AssistantChatMessage, targetSessionId?: string) => {
    const currentId = targetSessionId || AIInvestigationSessionService.getActiveSessionId();
    if (currentId) {
      AIInvestigationSessionService.appendMessage(currentId, message);
      refreshSessions();
    }
  }, [refreshSessions]);

  // Clear messages for active session
  const clearActiveSessionMessages = useCallback(() => {
    const currentId = AIInvestigationSessionService.getActiveSessionId();
    if (currentId) {
      AIInvestigationSessionService.clearSessionMessages(currentId);
      refreshSessions();
    }
  }, [refreshSessions]);

  // Archive a session
  const archiveSession = useCallback((sessionId: string) => {
    AIInvestigationSessionService.archiveSession(sessionId);
    refreshSessions();
  }, [refreshSessions]);

  // Unarchive a session
  const unarchiveSession = useCallback((sessionId: string) => {
    AIInvestigationSessionService.unarchiveSession(sessionId);
    refreshSessions();
  }, [refreshSessions]);

  // Delete a session
  const deleteSession = useCallback((sessionId: string) => {
    AIInvestigationSessionService.deleteSession(sessionId);
    refreshSessions();
  }, [refreshSessions]);

  // Explicit New Investigation creation
  const createNewInvestigation = useCallback((params: {
    repositoryId: string;
    repositoryName?: string;
    targetNodeId?: string;
    targetNodeLabel?: string;
    targetNodeType?: string;
    targetFilePath?: string;
    targetNodeMetadata?: Record<string, any>;
    investigationMode?: InvestigationMode;
    investigationTopic?: string;
    originContext?: InvestigationSession['originContext'];
  }): InvestigationSession => {
    const newSession = AIInvestigationSessionService.createSession({
      repositoryId: params.repositoryId,
      repositoryName: params.repositoryName || params.repositoryId,
      targetNodeId: params.targetNodeId,
      targetNodeLabel: params.targetNodeLabel || (params.targetNodeId ? `Node: ${params.targetNodeId}` : 'Repository-wide investigation'),
      targetNodeType: params.targetNodeType,
      targetFilePath: params.targetFilePath,
      targetNodeMetadata: params.targetNodeMetadata,
      investigationMode: params.investigationMode || 'WHY',
      investigationTopic: params.investigationTopic || 'Awaiting initial question...',
      messages: [],
      suggestedQuestions: [],
      originContext: params.originContext,
      status: 'active'
    });

    refreshSessions();
    return newSession;
  }, [refreshSessions]);

  const findSessionByContext = useCallback(
    (repoId: string, targetNodeId?: string | null, mode?: InvestigationMode): InvestigationSession | null => {
      return AIInvestigationSessionService.findSessionByContext(repoId, targetNodeId, mode);
    },
    []
  );

  const value: AIInvestigationContextValue = {
    sessions,
    activeSession,
    activeSessionId,
    createSession,
    selectSession,
    updateActiveSession,
    appendMessageToActiveSession,
    clearActiveSessionMessages,
    archiveSession,
    unarchiveSession,
    deleteSession,
    createNewInvestigation,
    findSessionByContext,
    refreshSessions
  };

  return (
    <AIInvestigationContext.Provider value={value}>
      {children}
    </AIInvestigationContext.Provider>
  );
};

export const useInvestigationSession = (): AIInvestigationContextValue => {
  const context = useContext(AIInvestigationContext);
  if (!context) {
    throw new Error('useInvestigationSession must be used within an AIInvestigationProvider');
  }
  return context;
};
