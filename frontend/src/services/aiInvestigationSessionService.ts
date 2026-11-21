/**
 * EngiTrace AI Investigation Session Persistence Service
 *
 * Implements persistent AI investigation session management using browser sessionStorage.
 * Manages multi-turn conversation history, repository/node context, evidence metadata,
 * active session resolution, and graceful quota / corruption recovery.
 */

import {
  InvestigationSession,
  CreateSessionParams,
  AssistantChatMessage,
  InvestigationMode
} from '../types/aiAssistant';

const SESSIONS_STORAGE_KEY = 'engitrace.ai.sessions.v1';
const ACTIVE_SESSION_ID_KEY = 'engitrace.ai.active_session_id.v1';
const MAX_SESSIONS = 25;
const MAX_MESSAGES_PER_SESSION = 60;

export type SessionChangeListener = () => void;

export class AIInvestigationSessionService {
  private static listeners: Set<SessionChangeListener> = new Set();
  private static memoryFallback: Map<string, string> = new Map();

  /**
   * Safe access to sessionStorage with fallback to in-memory map
   */
  private static isStorageAvailable(): boolean {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }
    try {
      const testKey = '__engitrace_test__';
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private static getRawItem(key: string): string | null {
    if (this.isStorageAvailable()) {
      try {
        return window.sessionStorage.getItem(key);
      } catch (err) {
        console.warn(`[AIInvestigationSessionService] Failed to read ${key}:`, err);
      }
    }
    return this.memoryFallback.get(key) || null;
  }

  private static setRawItem(key: string, value: string): boolean {
    if (this.isStorageAvailable()) {
      try {
        window.sessionStorage.setItem(key, value);
        return true;
      } catch (err: any) {
        console.warn(`[AIInvestigationSessionService] Storage write error for ${key}:`, err);
        // Handle QuotaExceededError by pruning old sessions
        if (err?.name === 'QuotaExceededError' || err?.code === 22 || err?.number === -2147024882) {
          this.handleQuotaExceeded(key, value);
          return true;
        }
      }
    }
    this.memoryFallback.set(key, value);
    return false;
  }

  private static removeRawItem(key: string): void {
    if (this.isStorageAvailable()) {
      try {
        window.sessionStorage.removeItem(key);
      } catch {}
    }
    this.memoryFallback.delete(key);
  }

  /**
   * Gracefully prune old or archived sessions on storage quota exhaustion
   */
  private static handleQuotaExceeded(key: string, failedPayload: string): void {
    try {
      if (key !== SESSIONS_STORAGE_KEY) {
        this.memoryFallback.set(key, failedPayload);
        return;
      }

      let sessions = this.getAllSessions();
      if (sessions.length <= 1) {
        this.memoryFallback.set(key, failedPayload);
        return;
      }

      // Sort by updatedAt ascending (oldest first)
      sessions.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

      // 1. Remove oldest archived sessions first
      const activeId = this.getActiveSessionId();
      let pruned = false;

      for (let i = 0; i < sessions.length; i++) {
        if (sessions[i].status === 'archived' && sessions[i].id !== activeId) {
          sessions.splice(i, 1);
          pruned = true;
          break;
        }
      }

      // 2. If no archived sessions were pruned, remove oldest non-active session
      if (!pruned && sessions.length > 2) {
        const nonActiveIdx = sessions.findIndex((s) => s.id !== activeId);
        if (nonActiveIdx !== -1) {
          sessions.splice(nonActiveIdx, 1);
        }
      }

      // Try saving pruned list
      try {
        window.sessionStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
      } catch {
        this.memoryFallback.set(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
      }
    } catch {
      this.memoryFallback.set(key, failedPayload);
    }
  }

  /**
   * Notify all in-memory subscribers of state changes
   */
  private static notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[AIInvestigationSessionService] Listener error:', err);
      }
    });
  }

  /**
   * Subscribe to session modifications
   */
  static subscribe(listener: SessionChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 1. createSession()
   * Creates a new unique investigation session and stores it
   */
  static createSession(params: CreateSessionParams): InvestigationSession {
    const now = new Date().toISOString();
    const sessionId = params.id || `inv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const newSession: InvestigationSession = {
      id: sessionId,
      repositoryId: params.repositoryId,
      repositoryName: params.repositoryName || params.repositoryId,
      targetNodeId: params.targetNodeId,
      targetNodeLabel: params.targetNodeLabel || (params.targetNodeId ? `Node: ${params.targetNodeId}` : 'Repository-wide investigation'),
      targetNodeType: params.targetNodeType,
      targetFilePath: params.targetFilePath,
      targetNodeMetadata: params.targetNodeMetadata,
      investigationMode: params.investigationMode || 'WHY',
      investigationTopic: params.investigationTopic || 'Awaiting initial question...',
      initialQuestion: params.initialQuestion,
      messages: params.messages ? params.messages.slice(-MAX_MESSAGES_PER_SESSION) : [],
      suggestedQuestions: params.suggestedQuestions || [],
      originContext: params.originContext || null,
      nodeNotFound: params.nodeNotFound || null,
      createdAt: now,
      updatedAt: now,
      status: params.status || 'active'
    };

    const existingSessions = this.getAllSessions();
    // Prepend new session
    const updated = [newSession, ...existingSessions.filter((s) => s.id !== sessionId)].slice(0, MAX_SESSIONS);

    this.saveSessions(updated);
    this.setActiveSession(sessionId);

    return newSession;
  }

  /**
   * 2. getSession(sessionId)
   * Retrieves a single session by its unique ID
   */
  static getSession(sessionId: string): InvestigationSession | null {
    if (!sessionId) return null;
    const sessions = this.getAllSessions();
    return sessions.find((s) => s.id === sessionId) || null;
  }

  /**
   * 3. getAllSessions()
   * Retrieves all saved sessions sorted by updatedAt descending
   */
  static getAllSessions(): InvestigationSession[] {
    const raw = this.getRawItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // Validate each session structure
      return parsed
        .filter((item): item is InvestigationSession => {
          return Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.repositoryId === 'string');
        })
        .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    } catch (err) {
      console.warn('[AIInvestigationSessionService] Corrupted sessions JSON in sessionStorage. Recovering gracefully:', err);
      return [];
    }
  }

  /**
   * 4. getActiveSession()
   * Retrieves the currently active investigation session
   */
  static getActiveSession(): InvestigationSession | null {
    const activeId = this.getActiveSessionId();
    if (activeId) {
      const found = this.getSession(activeId);
      if (found) return found;
    }

    // Fallback: If no explicit active session ID is set, use the most recently updated active session
    const all = this.getAllSessions();
    const activeCandidate = all.find((s) => s.status === 'active') || all[0];
    if (activeCandidate) {
      this.setActiveSession(activeCandidate.id);
      return activeCandidate;
    }

    return null;
  }

  /**
   * 5. setActiveSession(sessionId)
   * Sets the specified session as the active investigation
   */
  static setActiveSession(sessionId: string | null): void {
    if (sessionId) {
      this.setRawItem(ACTIVE_SESSION_ID_KEY, sessionId);
    } else {
      this.removeRawItem(ACTIVE_SESSION_ID_KEY);
    }
    this.notifyListeners();
  }

  /**
   * Helper: getActiveSessionId()
   */
  static getActiveSessionId(): string | null {
    return this.getRawItem(ACTIVE_SESSION_ID_KEY);
  }

  /**
   * 6. updateSession(sessionId, updates)
   * Updates an existing session with partial properties and updates timestamp
   */
  static updateSession(sessionId: string, updates: Partial<InvestigationSession>): InvestigationSession | null {
    const sessions = this.getAllSessions();
    const index = sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) return null;

    const current = sessions[index];
    const updatedMessages = updates.messages
      ? updates.messages.slice(-MAX_MESSAGES_PER_SESSION)
      : current.messages;

    const updatedSession: InvestigationSession = {
      ...current,
      ...updates,
      messages: updatedMessages,
      updatedAt: updates.updatedAt || new Date().toISOString()
    };

    sessions[index] = updatedSession;
    this.saveSessions(sessions);

    return updatedSession;
  }

  /**
   * 7. appendMessage(sessionId, message)
   * Appends a message to the specified session and persists it immediately
   */
  static appendMessage(sessionId: string, message: AssistantChatMessage): InvestigationSession | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    // Prevent duplicate messages with identical ID
    if (session.messages.some((m) => m.id === message.id)) {
      return session;
    }

    const updatedMessages = [...session.messages, message].slice(-MAX_MESSAGES_PER_SESSION);
    const updates: Partial<InvestigationSession> = {
      messages: updatedMessages,
      updatedAt: new Date().toISOString()
    };

    // If the session topic was still default and this is a user message, update topic
    if (
      message.role === 'user' &&
      (!session.investigationTopic || session.investigationTopic === 'Awaiting initial question...')
    ) {
      updates.investigationTopic = message.content;
    }

    return this.updateSession(sessionId, updates);
  }

  /**
   * 8. clearSessionMessages(sessionId)
   * Clears the messages of a session while preserving context and metadata
   */
  static clearSessionMessages(sessionId: string): InvestigationSession | null {
    return this.updateSession(sessionId, {
      messages: [],
      suggestedQuestions: []
    });
  }

  /**
   * 9. archiveSession(sessionId)
   * Marks a session as archived
   */
  static archiveSession(sessionId: string): InvestigationSession | null {
    const updated = this.updateSession(sessionId, { status: 'archived' });
    // If the archived session was the active one, clear active session ID
    if (this.getActiveSessionId() === sessionId) {
      const remaining = this.getAllSessions().find((s) => s.id !== sessionId && s.status === 'active');
      this.setActiveSession(remaining ? remaining.id : null);
    }
    return updated;
  }

  /**
   * Unarchive a session
   */
  static unarchiveSession(sessionId: string): InvestigationSession | null {
    return this.updateSession(sessionId, { status: 'active' });
  }

  /**
   * 10. deleteSession(sessionId)
   * Permanently removes a session from storage
   */
  static deleteSession(sessionId: string): boolean {
    const sessions = this.getAllSessions();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    if (filtered.length === sessions.length) return false;

    this.saveSessions(filtered);

    if (this.getActiveSessionId() === sessionId) {
      const nextActive = filtered.find((s) => s.status === 'active') || filtered[0];
      this.setActiveSession(nextActive ? nextActive.id : null);
    } else {
      this.notifyListeners();
    }

    return true;
  }

  /**
   * Find an existing active session matching exact repository, target node, and mode
   */
  static findSessionByContext(
    repoId: string,
    targetNodeId?: string | null,
    mode?: InvestigationMode
  ): InvestigationSession | null {
    const sessions = this.getAllSessions();
    const normalizedTargetNodeId = targetNodeId || undefined;

    return (
      sessions.find((s) => {
        const repoMatches = s.repositoryId === repoId;
        const nodeMatches = (s.targetNodeId || undefined) === normalizedTargetNodeId;
        const modeMatches = !mode || s.investigationMode === mode;
        return repoMatches && nodeMatches && modeMatches && s.status === 'active';
      }) || null
    );
  }

  /**
   * Evaluates whether a session matches a specific graph node.
   * Compares node id, decoded id, case-normalized id, path, and hash.
   */
  static isNodeMatch(
    session: InvestigationSession,
    node: { id: string; label?: string; metadata?: any }
  ): boolean {
    if (!session || !node || !node.id) return false;

    // 1. Exact or decoded targetNodeId match
    if (session.targetNodeId === node.id) return true;
    const decNodeId = decodeURIComponent(node.id).trim();
    if (session.targetNodeId === decNodeId) return true;
    if (session.targetNodeId && decodeURIComponent(session.targetNodeId).trim() === decNodeId) return true;

    // 2. Case-insensitive ID match
    const lowerTarget = (session.targetNodeId || '').toLowerCase();
    const lowerNode = node.id.toLowerCase();
    const lowerDecNode = decNodeId.toLowerCase();
    if (lowerTarget && (lowerTarget === lowerNode || lowerTarget === lowerDecNode)) return true;

    // 3. File path match
    const nodePath = (node.metadata?.path as string) || '';
    if (nodePath) {
      const lowerPath = nodePath.toLowerCase();
      if (session.targetFilePath && (session.targetFilePath === nodePath || session.targetFilePath.toLowerCase() === lowerPath)) {
        return true;
      }
      if (session.targetNodeId) {
        if (session.targetNodeId === nodePath || session.targetNodeId.toLowerCase() === lowerPath) return true;
        if (session.targetNodeId.endsWith(`:${nodePath}`) || session.targetNodeId.toLowerCase().endsWith(`:${lowerPath}`)) return true;
        if (session.targetNodeId.endsWith(`/${nodePath}`) || session.targetNodeId.toLowerCase().endsWith(`/${lowerPath}`)) return true;
      }
    }

    // 4. Commit hash match (for commit / git graph nodes)
    const nodeHash = (node.metadata?.hash as string) || '';
    if (nodeHash && session.targetNodeId) {
      if (session.targetNodeId === nodeHash || session.targetNodeId.startsWith(nodeHash) || nodeHash.startsWith(session.targetNodeId)) {
        return true;
      }
    }

    // 5. Suffix / Substring ID containment
    if (session.targetNodeId && (session.targetNodeId.endsWith(node.id) || node.id.endsWith(session.targetNodeId))) {
      return true;
    }

    return false;
  }

  /**
   * Find an active session for a specific repository and graph node.
   * Prioritizes the currently active session if it matches, otherwise finds
   * the most recently updated active session for this exact node.
   * Requires that the session is active, matches repositoryId, and has at least one conversation message.
   */
  static findActiveSessionForNode(
    repoId: string,
    node: { id: string; label?: string; metadata?: any } | null
  ): InvestigationSession | null {
    if (!repoId || !node || !node.id) return null;

    const all = this.getAllSessions();
    const activeCandidates = all.filter(
      (s) => s.status === 'active' && s.repositoryId === repoId && s.messages && s.messages.length > 0
    );

    if (activeCandidates.length === 0) return null;

    // 1. Prioritize currently active session
    const activeId = this.getActiveSessionId();
    if (activeId) {
      const active = activeCandidates.find((s) => s.id === activeId);
      if (active && this.isNodeMatch(active, node)) {
        return active;
      }
    }

    // 2. Otherwise find the most recently updated active session for this node
    return activeCandidates.find((s) => this.isNodeMatch(s, node)) || null;
  }

  /**
   * Save entire sessions array to storage
   */
  private static saveSessions(sessions: InvestigationSession[]): void {
    const sanitized = sessions.map((s) => ({
      id: s.id,
      repositoryId: s.repositoryId,
      repositoryName: s.repositoryName,
      targetNodeId: s.targetNodeId,
      targetNodeLabel: s.targetNodeLabel,
      targetNodeType: s.targetNodeType,
      targetFilePath: s.targetFilePath,
      targetNodeMetadata: s.targetNodeMetadata,
      investigationMode: s.investigationMode,
      investigationTopic: s.investigationTopic,
      initialQuestion: s.initialQuestion,
      messages: (s.messages || []).slice(-MAX_MESSAGES_PER_SESSION),
      suggestedQuestions: s.suggestedQuestions,
      originContext: s.originContext,
      nodeNotFound: s.nodeNotFound,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      status: s.status
    }));

    this.setRawItem(SESSIONS_STORAGE_KEY, JSON.stringify(sanitized));
    this.notifyListeners();
  }
}

