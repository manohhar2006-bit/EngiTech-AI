import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from '../../components/navigation/Sidebar';
import { CommandPalette } from '../../components/navigation/CommandPalette';
import { AssistantHeader } from './components/AssistantHeader';
import { InvestigationContextBar } from './components/InvestigationContextBar';
import { ChatConversation } from './components/ChatConversation';
import { ChatInput } from './components/ChatInput';
import { InvestigationContextPanel } from './components/InvestigationContextPanel';
import { RelatedEvidencePanel } from './components/RelatedEvidencePanel';
import { SuggestedQuestionsPanel } from './components/SuggestedQuestionsPanel';
import { ChangeContextModal } from './components/ChangeContextModal';
import { EvidenceDetailModal } from './components/EvidenceDetailModal';
import { RecentInvestigationsModal } from './components/RecentInvestigationsModal';
import { SwitchRepoConfirmModal } from './components/SwitchRepoConfirmModal';
import { AIAssistantService } from '../../services/aiAssistantService';
import { ActiveRepositoryService } from '../../services/activeRepositoryService';
import { AIInvestigationSessionService } from '../../services/aiInvestigationSessionService';
import { GraphNode, WhyGraphData } from '../../types/graph';
import {
  InvestigationContext,
  InvestigationMode,
  AssistantChatMessage,
  GroupedEvidence,
  InvestigationSession
} from '../../types/aiAssistant';
import { GraphNavigationService, GraphOriginContext } from '../../services/graphNavigationService';
import { useInvestigationSession } from '../../context/AIInvestigationContext';

interface AIAssistantPageProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const AIAssistantPage: React.FC<AIAssistantPageProps> = ({
  currentRoute,
  onNavigate
}) => {
  // Centralized Investigation Sessions
  const {
    activeSession,
    sessions,
    selectSession,
    createNewInvestigation,
    updateActiveSession,
    appendMessageToActiveSession,
    archiveSession,
    unarchiveSession,
    deleteSession,
    findSessionByContext
  } = useInvestigationSession();

  // Navigation & Dialog states
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [contextModalTitle, setContextModalTitle] = useState('Configure Investigation Context');
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [inspectedEvidence, setInspectedEvidence] = useState<any | null>(null);
  const [isRecentModalOpen, setIsRecentModalOpen] = useState(false);

  // Switch repository confirmation modal
  const [pendingRepoSwitch, setPendingRepoSwitch] = useState<{
    targetRepoId: string;
    targetRepoName: string;
    hasExistingSession: boolean;
  } | null>(null);

  // Available Repositories & Graph Data
  const [repositories, setRepositories] = useState<Array<{ id: string; name: string }>>([]);
  const [graphData, setGraphData] = useState<WhyGraphData | null>(null);

  // Unavailable target state
  const [nodeNotFound, setNodeNotFound] = useState<string | null>(null);

  // Originating Graph Context (for context-preserving return navigation)
  const [originContext, setOriginContext] = useState<GraphOriginContext | null>(null);

  // Investigation Context State
  const [context, setContext] = useState<InvestigationContext>(() => {
    if (activeSession) {
      return {
        repositoryId: activeSession.repositoryId,
        repositoryName: activeSession.repositoryName || activeSession.repositoryId,
        targetNode: null,
        targetLabel: activeSession.targetNodeLabel || 'Repository-wide investigation',
        topic: activeSession.investigationTopic || 'Awaiting initial question...',
        mode: activeSession.investigationMode
      };
    }
    return {
      repositoryId: '',
      repositoryName: '',
      targetNode: null,
      targetLabel: 'Repository-wide investigation',
      topic: '',
      mode: 'WHY'
    };
  });

  // Conversation & Messaging State
  const [messages, setMessages] = useState<AssistantChatMessage[]>(() => {
    return activeSession?.messages ? [...activeSession.messages] : [];
  });
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(() => {
    return activeSession?.suggestedQuestions && activeSession.suggestedQuestions.length > 0
      ? activeSession.suggestedQuestions
      : [];
  });
  const [activeModel, setActiveModel] = useState<string>('gemini-3.6-flash');
  const [isFallback, setIsFallback] = useState<boolean>(false);

  // Related Evidence State
  const [relatedEvidence, setRelatedEvidence] = useState<GroupedEvidence>({
    commits: [],
    pullRequests: [],
    issues: [],
    files: [],
    evidenceRecords: []
  });

  // Ref to track auto-query executions and prevent duplicates
  const executedAutoQueriesRef = useRef<Set<string>>(new Set());

  // Helper to resolve a node in graph topology
  const findNodeInGraph = useCallback((graph: WhyGraphData | null, targetNodeId?: string | null): GraphNode | null => {
    if (!graph || !targetNodeId) return null;
    const decId = decodeURIComponent(targetNodeId).trim();
    const lowerDecId = decId.toLowerCase();

    return (
      graph.nodes.find(
        (n) =>
          n.id === targetNodeId ||
          n.id === decId ||
          n.id.toLowerCase() === lowerDecId ||
          n.label.toLowerCase() === lowerDecId ||
          (typeof n.metadata?.path === 'string' &&
            (n.metadata.path === decId || n.metadata.path.toLowerCase() === lowerDecId)) ||
          (typeof n.metadata?.hash === 'string' &&
            (n.metadata.hash === decId || n.metadata.hash.startsWith(decId) || decId.startsWith(n.metadata.hash))) ||
          n.id.toLowerCase().endsWith(lowerDecId) ||
          lowerDecId.endsWith(n.id.toLowerCase())
      ) || null
    );
  }, []);

  // Synchronize local states when activeSession updates in context
  useEffect(() => {
    if (activeSession) {
      setMessages(activeSession.messages ? [...activeSession.messages] : []);
      if (activeSession.suggestedQuestions && activeSession.suggestedQuestions.length > 0) {
        setSuggestedQuestions(activeSession.suggestedQuestions);
      }
      if (activeSession.originContext) {
        setOriginContext(activeSession.originContext);
      }
      setNodeNotFound(activeSession.nodeNotFound || null);

      setContext((prev) => ({
        ...prev,
        repositoryId: activeSession.repositoryId,
        repositoryName: activeSession.repositoryName || activeSession.repositoryId,
        targetLabel: activeSession.targetNodeLabel || 'Repository-wide investigation',
        topic: activeSession.investigationTopic || 'Awaiting initial question...',
        mode: activeSession.investigationMode
      }));
    }
  }, [activeSession?.id]);

  // Load repository graph and resolve target node
  const loadRepositoryContext = useCallback(
    async (
      repoId: string,
      repoName: string,
      mode: InvestigationMode,
      targetNodeId?: string | null,
      existingMessages?: AssistantChatMessage[]
    ) => {
      try {
        const graph = await AIAssistantService.getRepositoryGraph(repoId);
        setGraphData(graph);

        let matchedNode: GraphNode | null = null;
        let unavailableNodeId: string | null = null;

        if (targetNodeId) {
          matchedNode = findNodeInGraph(graph, targetNodeId);
          if (!matchedNode && graph && graph.nodes.length > 0) {
            unavailableNodeId = targetNodeId;
          }
        }

        setNodeNotFound(unavailableNodeId);

        const targetLabel = matchedNode
          ? AIAssistantService.formatTargetLabel(matchedNode)
          : unavailableNodeId
          ? `Target: ${unavailableNodeId}`
          : 'Repository-wide investigation';

        setContext((prev) => ({
          ...prev,
          repositoryId: repoId,
          repositoryName: repoName,
          targetNode: matchedNode,
          targetLabel: targetLabel,
          mode: mode
        }));

        // Fetch Related Evidence
        const evidence = await AIAssistantService.getRelatedEvidence(repoId, matchedNode);
        setRelatedEvidence(evidence);

        // If no suggested questions yet, set default starters
        if (!existingMessages || existingMessages.length === 0) {
          const starters = AIAssistantService.getDefaultSuggestedQuestions(mode, targetLabel, repoName);
          setSuggestedQuestions(starters);
        }
      } catch (err) {
        console.warn('[AIAssistantPage] Error loading repository context:', err);
      }
    },
    [findNodeInGraph]
  );

  // Synchronize route and handle session restoration or creation
  useEffect(() => {
    let isMounted = true;

    const initOrSyncRoute = async () => {
      const repos = await AIAssistantService.getAvailableRepositories();
      if (!isMounted) return;
      setRepositories(repos);

      const searchStr = currentRoute.includes('?')
        ? currentRoute.slice(currentRoute.indexOf('?'))
        : window.location.search;
      const urlParams = new URLSearchParams(searchStr);

      const isFromGraph = urlParams.get('origin') === 'graph';
      if (urlParams.get('modal') === 'recent') {
        setIsRecentModalOpen(true);
      }

      const urlSessionId = urlParams.get('session');
      const urlRepoId = urlParams.get('repo');
      const urlNodeId = urlParams.get('node');
      const urlModeRaw = (urlParams.get('mode') || '').toUpperCase();
      const urlQuestion = urlParams.get('question');
      const urlView = urlParams.get('view');
      const urlSearch = urlParams.get('search');

      const initialMode: InvestigationMode =
        urlModeRaw === 'WHAT_IF' || urlModeRaw === 'WHATIF'
          ? 'WHAT_IF'
          : urlModeRaw === 'GENERAL'
          ? 'GENERAL'
          : 'WHY';

      // ──────────────────────────────────────────────────────────────────────────
      // CASE 1: Explicit Trigger from Engineering Graph (WHY or WHAT IF clicked)
      // ──────────────────────────────────────────────────────────────────────────
      if (isFromGraph && urlRepoId) {
        const matchedRepo = repos.find((r) => r.id === urlRepoId) || { id: urlRepoId, name: urlRepoId };
        const repoId = matchedRepo.id;
        const repoName = matchedRepo.name;

        const resolvedView = GraphNavigationService.normalizeView(urlView || 'architecture');
        const resolvedOrigin: GraphOriginContext = {
          repoId,
          repoName,
          view: resolvedView,
          nodeId: urlNodeId || undefined,
          searchQuery: urlSearch || undefined,
          timestamp: Date.now()
        };
        setOriginContext(resolvedOrigin);

        // Check if an active or saved session already exists for this exact context
        const existingSession = findSessionByContext(repoId, urlNodeId, initialMode);

        if (existingSession && existingSession.messages.length > 0) {
          // Resume existing investigation without re-querying!
          selectSession(existingSession.id);
          setMessages(existingSession.messages);
          setContext((prev) => ({
            ...prev,
            repositoryId: repoId,
            repositoryName: repoName,
            mode: existingSession.investigationMode,
            topic: existingSession.investigationTopic,
            targetLabel: existingSession.targetNodeLabel || 'Target Entity'
          }));
          await loadRepositoryContext(repoId, repoName, existingSession.investigationMode, urlNodeId, existingSession.messages);
          return;
        }

        // Otherwise, create a new investigation session for this node
        const initialTopic = urlQuestion || (urlNodeId ? `Why does ${urlNodeId} exist?` : 'Repository investigation');
        const queryKey = `${repoId}:${urlNodeId || 'root'}:${initialMode}:${initialTopic}`;

        const newSession = createNewInvestigation({
          repositoryId: repoId,
          repositoryName: repoName,
          targetNodeId: urlNodeId || undefined,
          targetNodeLabel: urlNodeId || undefined,
          investigationMode: initialMode,
          investigationTopic: initialTopic,
          originContext: resolvedOrigin
        });

        setMessages([]);
        setContext((prev) => ({
          ...prev,
          repositoryId: repoId,
          repositoryName: repoName,
          mode: initialMode,
          topic: initialTopic,
          targetLabel: urlNodeId ? `Target: ${urlNodeId}` : 'Repository-wide investigation'
        }));

        await loadRepositoryContext(repoId, repoName, initialMode, urlNodeId, []);

        // Auto-query only once for this fresh graph investigation
        if (!executedAutoQueriesRef.current.has(queryKey)) {
          executedAutoQueriesRef.current.add(queryKey);
          setTimeout(() => {
            handleSendMessage(initialTopic, null, initialMode, repoId, newSession.id);
          }, 80);
        }
        return;
      }

      // ──────────────────────────────────────────────────────────────────────────
      // CASE 2: Sidebar Navigation or Internal Route Switch (/ai-assistant)
      // ──────────────────────────────────────────────────────────────────────────
      // Check if an active session or requested session exists in centralized state
      const targetSession = urlSessionId
        ? (selectSession(urlSessionId) || AIInvestigationSessionService.getSession(urlSessionId))
        : activeSession;

      if (targetSession) {
        // Restore active investigation!
        setMessages(targetSession.messages ? [...targetSession.messages] : []);
        setSuggestedQuestions(targetSession.suggestedQuestions || []);
        if (targetSession.originContext) {
          setOriginContext(targetSession.originContext);
        }
        setNodeNotFound(targetSession.nodeNotFound || null);

        setContext((prev) => ({
          ...prev,
          repositoryId: targetSession.repositoryId,
          repositoryName: targetSession.repositoryName || targetSession.repositoryId,
          targetLabel: targetSession.targetNodeLabel || 'Repository-wide investigation',
          topic: targetSession.investigationTopic || 'Awaiting initial question...',
          mode: targetSession.investigationMode
        }));

        await loadRepositoryContext(
          targetSession.repositoryId,
          targetSession.repositoryName || targetSession.repositoryId,
          targetSession.investigationMode,
          targetSession.targetNodeId,
          targetSession.messages
        );
        return;
      }

      // ──────────────────────────────────────────────────────────────────────────
      // CASE 3: No Active Session Exists (Clean State)
      // ──────────────────────────────────────────────────────────────────────────
      const activeStoredRepoId = ActiveRepositoryService.getActiveRepoId();
      const defaultRepoId = activeStoredRepoId || (repos.length > 0 ? repos[0].id : 'repo-facebook-react');
      const matchedRepo = repos.find((r) => r.id === defaultRepoId) || repos[0];
      const repoId = matchedRepo ? matchedRepo.id : defaultRepoId;
      const repoName = matchedRepo ? matchedRepo.name : defaultRepoId;

      setMessages([]);
      setSuggestedQuestions([]);
      setNodeNotFound(null);
      setOriginContext(null);

      setContext((prev) => ({
        ...prev,
        repositoryId: repoId,
        repositoryName: repoName,
        targetNode: null,
        targetLabel: 'Repository-wide investigation',
        topic: 'Awaiting initial question...',
        mode: 'WHY'
      }));

      await loadRepositoryContext(repoId, repoName, 'WHY', null, []);
    };

    initOrSyncRoute();

    return () => {
      isMounted = false;
    };
  }, [currentRoute]);

  // Return to Engineering Graph with preserved view, repo, node, and search query
  const handleBackToGraph = () => {
    const repoId = context.repositoryId || ActiveRepositoryService.getActiveRepoId() || 'repo-facebook-react';
    const targetNodeId = originContext?.nodeId || context.targetNode?.id || activeSession?.targetNodeId;

    // Determine view mode: prioritize verified graph origin if matching repo
    let targetView: string;
    if (originContext && originContext.repoId === repoId && originContext.view) {
      targetView = originContext.view;
    } else if (context.mode === 'WHAT_IF' || context.targetNode?.type === 'DEPENDENCY') {
      targetView = 'dependencies';
    } else if (context.targetNode?.type === 'DECISION' || context.targetNode?.type === 'INCIDENT') {
      targetView = 'decisions';
    } else if (context.targetNode?.type === 'COMMIT') {
      targetView = 'git_graph';
    } else {
      targetView = 'architecture';
    }

    const returnUrl = GraphNavigationService.buildReturnToGraphUrl({
      repoId,
      view: targetView,
      nodeId: targetNodeId,
      sessionId: activeSession?.id,
      searchQuery: originContext?.repoId === repoId ? originContext.searchQuery : undefined
    });

    onNavigate(returnUrl);
  };

  // Switch Active Repository from Sidebar
  const handleSelectRepository = async (newRepoId: string) => {
    if (newRepoId === context.repositoryId) return;

    const targetRepo = repositories.find((r) => r.id === newRepoId);
    const targetRepoName = targetRepo ? targetRepo.name : newRepoId;

    // Check if current active session has messages from another repository
    if (activeSession && activeSession.messages.length > 0 && activeSession.repositoryId !== newRepoId) {
      // Find if target repo has an existing session
      const existingForTarget = findSessionByContext(newRepoId);
      setPendingRepoSwitch({
        targetRepoId: newRepoId,
        targetRepoName,
        hasExistingSession: Boolean(existingForTarget)
      });
      return;
    }

    // Direct switch if no messages or clean session
    executeRepoSwitch(newRepoId, targetRepoName, false);
  };

  // Execute repository switch safely
  const executeRepoSwitch = async (newRepoId: string, newRepoName: string, resumeExisting: boolean) => {
    ActiveRepositoryService.setActiveRepoId(newRepoId, false);

    if (resumeExisting) {
      const existing = findSessionByContext(newRepoId);
      if (existing) {
        selectSession(existing.id);
        setMessages(existing.messages);
        setNodeNotFound(existing.nodeNotFound || null);
        setOriginContext(existing.originContext || null);
        await loadRepositoryContext(newRepoId, newRepoName, existing.investigationMode, existing.targetNodeId, existing.messages);
        return;
      }
    }

    // Start a clean investigation for the new repository
    const newSession = createNewInvestigation({
      repositoryId: newRepoId,
      repositoryName: newRepoName,
      investigationMode: context.mode || 'WHY',
      investigationTopic: 'Awaiting initial question...'
    });

    setMessages([]);
    setNodeNotFound(null);
    setOriginContext(null);
    setContext((prev) => ({
      ...prev,
      repositoryId: newRepoId,
      repositoryName: newRepoName,
      targetNode: null,
      targetLabel: 'Repository-wide investigation',
      topic: 'Awaiting initial question...'
    }));

    await loadRepositoryContext(newRepoId, newRepoName, context.mode || 'WHY', null, []);
  };

  // Launch New Investigation Dialog
  const handleNewInvestigation = () => {
    setContextModalTitle('Start New Investigation');
    setIsContextModalOpen(true);
  };

  // Open Change Context Dialog
  const handleChangeContext = () => {
    setContextModalTitle('Change Investigation Context');
    setIsContextModalOpen(true);
  };

  // Apply Changes from Context Modal
  const handleApplyContextModal = async (customTopic?: string) => {
    const repoName = context.repositoryName || context.repositoryId;
    const targetLabel = context.targetNode
      ? AIAssistantService.formatTargetLabel(context.targetNode)
      : 'Repository-wide investigation';

    const finalTopic =
      customTopic ||
      AIAssistantService.getInitialQuestionForNode(
        context.targetNode,
        context.mode,
        targetLabel,
        repoName
      );

    const isRepoChange = Boolean(activeSession && context.repositoryId !== activeSession.repositoryId);

    if (contextModalTitle === 'Start New Investigation' || isRepoChange) {
      // Create a brand new session with unique ID
      const newSession = createNewInvestigation({
        repositoryId: context.repositoryId,
        repositoryName: repoName,
        targetNodeId: context.targetNode?.id,
        targetNodeLabel: targetLabel,
        targetNodeType: context.targetNode?.type,
        targetFilePath: (context.targetNode?.metadata?.path as string) || undefined,
        investigationMode: context.mode,
        investigationTopic: finalTopic,
        originContext: isRepoChange ? null : originContext
      });

      setMessages([]);
      setNodeNotFound(null);
      if (isRepoChange) {
        setOriginContext(null);
      }
      setContext((prev) => ({
        ...prev,
        targetLabel,
        topic: finalTopic
      }));
    } else {
      // Update existing session context
      updateActiveSession({
        repositoryId: context.repositoryId,
        repositoryName: repoName,
        targetNodeId: context.targetNode?.id,
        targetNodeLabel: targetLabel,
        targetNodeType: context.targetNode?.type,
        targetFilePath: (context.targetNode?.metadata?.path as string) || undefined,
        investigationMode: context.mode,
        investigationTopic: finalTopic
      });

      setContext((prev) => ({
        ...prev,
        targetLabel,
        topic: finalTopic
      }));
    }

    // Refresh related evidence & suggestions
    const evidence = await AIAssistantService.getRelatedEvidence(
      context.repositoryId,
      context.targetNode
    );
    setRelatedEvidence(evidence);

    const starters = AIAssistantService.getDefaultSuggestedQuestions(
      context.mode,
      targetLabel,
      repoName
    );
    setSuggestedQuestions(starters);
  };

  // Handle Mode Change (WHY, WHAT_IF, GENERAL)
  const handleModeChange = (newMode: InvestigationMode) => {
    setContext((prev) => ({
      ...prev,
      mode: newMode
    }));

    updateActiveSession({
      investigationMode: newMode
    });

    const starters = AIAssistantService.getDefaultSuggestedQuestions(
      newMode,
      context.targetLabel,
      context.repositoryName
    );
    setSuggestedQuestions(starters);
  };

  // Select an investigation from Recent Investigations
  const handleSelectRecentSession = async (sessionId: string) => {
    const session = selectSession(sessionId);
    if (!session) return;

    setMessages(session.messages ? [...session.messages] : []);
    setSuggestedQuestions(session.suggestedQuestions || []);
    setNodeNotFound(session.nodeNotFound || null);
    setOriginContext(session.originContext || null);

    setContext({
      repositoryId: session.repositoryId,
      repositoryName: session.repositoryName || session.repositoryId,
      targetNode: null, // Will be resolved by loadRepositoryContext
      targetLabel: session.targetNodeLabel || 'Repository-wide investigation',
      topic: session.investigationTopic || 'Awaiting initial question...',
      mode: session.investigationMode
    });

    await loadRepositoryContext(
      session.repositoryId,
      session.repositoryName || session.repositoryId,
      session.investigationMode,
      session.targetNodeId,
      session.messages
    );
  };

  // Submit Chat Message
  const handleSendMessage = async (
    overrideText?: string,
    nodeOverride?: GraphNode | null,
    modeOverride?: InvestigationMode,
    repoOverride?: string,
    targetSessionId?: string
  ) => {
    const textToSend = (overrideText || input).trim();
    if (!textToSend || isLoading) return;

    const activeRepoId = repoOverride || context.repositoryId;
    const activeTargetNode = nodeOverride !== undefined ? nodeOverride : context.targetNode;
    const activeMode = modeOverride || context.mode;

    if (!activeRepoId) return;

    if (!overrideText) {
      setInput('');
    }

    // Ensure an active session exists
    let sessionId = targetSessionId || activeSession?.id;
    if (!sessionId) {
      const newSession = createNewInvestigation({
        repositoryId: activeRepoId,
        repositoryName: context.repositoryName || activeRepoId,
        targetNodeId: activeTargetNode?.id,
        targetNodeLabel: context.targetLabel,
        targetNodeType: activeTargetNode?.type,
        investigationMode: activeMode,
        investigationTopic: textToSend,
        originContext: originContext
      });
      sessionId = newSession.id;
    }

    // Set topic to the first user question if not customized
    if (!context.topic || context.topic === 'Awaiting initial question...') {
      setContext((prev) => ({ ...prev, topic: textToSend }));
      updateActiveSession({ investigationTopic: textToSend }, sessionId);
    }

    const userMessage: AssistantChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    appendMessageToActiveSession(userMessage, sessionId);
    setIsLoading(true);

    try {
      // Determine node target ID for backend ChatController
      let backendNodeId: string;
      if (activeTargetNode) {
        backendNodeId = activeTargetNode.id;
      } else {
        // Repository-level investigation: lookup canonical repository root node from graph
        const repoNode = graphData?.nodes.find((n) => n.type === 'REPOSITORY');
        backendNodeId = repoNode ? repoNode.id : activeRepoId;
      }

      // Build nodeMetadata
      const nodeMetadata = activeTargetNode
        ? {
            name: activeTargetNode.label,
            type: activeTargetNode.type,
            filePath:
              (activeTargetNode.metadata?.path as string) ||
              activeTargetNode.id.replace(/^file:[^:]+:/, '').replace(/^file:/, ''),
            commitSha: activeTargetNode.metadata?.hash,
            commitMessage: activeTargetNode.metadata?.description,
            author: activeTargetNode.metadata?.author,
            timestamp: activeTargetNode.createdAt || activeTargetNode.metadata?.date
          }
        : {
            name: context.repositoryName || activeRepoId,
            type: 'REPOSITORY'
          };

      const reply = await AIAssistantService.sendChatMessage(activeRepoId, {
        nodeId: backendNodeId,
        analysisType: activeMode === 'WHAT_IF' ? 'WHAT_IF' : 'WHY',
        messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        nodeMetadata
      });

      const assistantMessage: AssistantChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply.answer,
        timestamp: new Date().toISOString(),
        claims: reply.claims,
        suggestedFollowUps: reply.suggestedFollowUps,
        provider: reply.provider,
        model: reply.model,
        isFallback: reply.isFallback,
        isError: reply.provider === 'GEMINI_ERROR' || Boolean(reply.error)
      };

      setMessages((prev) => [...prev, assistantMessage]);
      appendMessageToActiveSession(assistantMessage, sessionId);

      if (reply.suggestedFollowUps && reply.suggestedFollowUps.length > 0) {
        setSuggestedQuestions(reply.suggestedFollowUps);
        updateActiveSession({
          suggestedQuestions: reply.suggestedFollowUps,
          updatedAt: new Date().toISOString()
        }, sessionId);
      }

      if (reply.model) setActiveModel(reply.model);
      setIsFallback(Boolean(reply.isFallback));
    } catch (err: any) {
      console.error('[AIAssistantPage] Chat message error:', err);
      const errorMessage: AssistantChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **EngiTrace AI Execution Error**:\n${err?.message || 'Failed to reach AI service. Please verify backend service and environment configuration.'}`,
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages((prev) => [...prev, errorMessage]);
      appendMessageToActiveSession(errorMessage, sessionId);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#070A12] text-slate-100 overflow-hidden font-sans">
      {/* COLUMN 1: LEFT SIDEBAR */}
      <Sidebar
        currentRoute={currentRoute}
        onNavigate={onNavigate}
        activeRepositoryName={context.repositoryName}
        repositories={repositories}
        onSelectRepository={handleSelectRepository}
      />

      {/* CENTER & RIGHT COLUMNS CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#070A12]">
        {/* TOP HEADER */}
        <AssistantHeader
          onBackToGraph={handleBackToGraph}
          onNewInvestigation={handleNewInvestigation}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onToggleContextPanel={() => setIsContextPanelOpen((prev) => !prev)}
          isContextPanelOpen={isContextPanelOpen}
          activeModel={activeModel}
          isFallback={isFallback}
          onOpenRecentInvestigations={() => setIsRecentModalOpen(true)}
          savedSessionsCount={sessions.length}
        />

        {/* INVESTIGATION CONTEXT BAR */}
        <InvestigationContextBar
          context={context}
          onChangeContext={handleChangeContext}
          onBackToGraph={handleBackToGraph}
        />

        {/* MAIN BODY: 2-COLUMN SPLIT (Center Chat + Right Context Panel) */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          {/* COLUMN 2: CENTER CONVERSATIONAL AI WORKSPACE */}
          <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#070A12]">
            <ChatConversation
              messages={messages}
              isLoading={isLoading}
              context={context}
              suggestedQuestions={suggestedQuestions}
              nodeNotFound={nodeNotFound}
              onClearUnavailableNode={() => {
                setNodeNotFound(null);
                updateActiveSession({ targetNodeId: undefined, targetNodeLabel: 'Repository-wide investigation', nodeNotFound: null });
                loadRepositoryContext(context.repositoryId, context.repositoryName, 'GENERAL', null, messages);
              }}
              onBackToGraph={handleBackToGraph}
              onSelectPrompt={(prompt) => handleSendMessage(prompt)}
              onOpenEvidence={(evId) => {
                const found = relatedEvidence.evidenceRecords.find((r) => r.id === evId);
                if (found) setInspectedEvidence(found);
              }}
              onOpenSourceUrl={(url) => window.open(url, '_blank')}
            />

            {/* Sticky Bottom Message Input */}
            <ChatInput
              input={input}
              setInput={setInput}
              onSend={() => handleSendMessage()}
              isLoading={isLoading}
              mode={context.mode}
              onModeChange={handleModeChange}
              targetLabel={context.targetLabel}
            />
          </main>

          {/* COLUMN 3: RIGHT INVESTIGATION CONTEXT & EVIDENCE PANEL */}
          {isContextPanelOpen && (
            <aside className="w-80 lg:w-96 border-l border-slate-800/80 bg-[#070A12]/95 backdrop-blur-md flex flex-col h-full overflow-y-auto p-4 space-y-4 shrink-0 transition-all z-10 shadow-2xl">
              {/* Panel A: Investigation Context */}
              <InvestigationContextPanel
                context={context}
                onChangeContext={handleChangeContext}
                onBackToGraph={handleBackToGraph}
              />

              {/* Panel B: Related Evidence */}
              <RelatedEvidencePanel
                evidence={relatedEvidence}
                onSelectEvidenceItem={(item) => setInspectedEvidence(item)}
              />

              {/* Panel C: Suggested Questions */}
              <SuggestedQuestionsPanel
                questions={suggestedQuestions}
                onSelectQuestion={(q) => handleSendMessage(q)}
                isLoading={isLoading}
              />
            </aside>
          )}
        </div>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={onNavigate}
        onSelectNode={(node) => {
          setIsCommandPaletteOpen(false);
          const formatted = AIAssistantService.formatTargetLabel(node);
          setNodeNotFound(null);
          setContext((prev) => ({
            ...prev,
            targetNode: node,
            targetLabel: formatted,
            topic: `Why does ${formatted} exist?`
          }));
          updateActiveSession({
            targetNodeId: node.id,
            targetNodeLabel: formatted,
            targetNodeType: node.type,
            targetFilePath: (node.metadata?.path as string) || undefined,
            investigationTopic: `Why does ${formatted} exist?`
          });
        }}
      />

      {/* Change Context / New Investigation Modal */}
      <ChangeContextModal
        isOpen={isContextModalOpen}
        onClose={() => setIsContextModalOpen(false)}
        title={contextModalTitle}
        repositories={repositories}
        selectedRepoId={context.repositoryId}
        onSelectRepo={(repoId) => {
          const repo = repositories.find((r) => r.id === repoId);
          setContext((prev) => ({
            ...prev,
            repositoryId: repoId,
            repositoryName: repo ? repo.name : repoId
          }));
        }}
        graphNodes={graphData?.nodes || []}
        selectedNode={context.targetNode}
        onSelectNode={(node) => {
          setNodeNotFound(null);
          setContext((prev) => ({
            ...prev,
            targetNode: node,
            targetLabel: AIAssistantService.formatTargetLabel(node)
          }));
        }}
        activeMode={context.mode}
        onSelectMode={(mode) => {
          setContext((prev) => ({ ...prev, mode }));
        }}
        onApplyContext={handleApplyContextModal}
      />

      {/* Evidence Item Detail Inspection Modal */}
      <EvidenceDetailModal
        evidenceItem={inspectedEvidence}
        onClose={() => setInspectedEvidence(null)}
      />

      {/* Recent Investigations Modal */}
      <RecentInvestigationsModal
        isOpen={isRecentModalOpen}
        onClose={() => setIsRecentModalOpen(false)}
        sessions={sessions}
        activeSessionId={activeSession?.id || null}
        onSelectSession={handleSelectRecentSession}
        onArchiveSession={archiveSession}
        onUnarchiveSession={unarchiveSession}
        onDeleteSession={deleteSession}
        onNewInvestigation={handleNewInvestigation}
      />

      {/* Switch Repository Confirmation Modal */}
      {pendingRepoSwitch && (
        <SwitchRepoConfirmModal
          isOpen={Boolean(pendingRepoSwitch)}
          onClose={() => setPendingRepoSwitch(null)}
          currentRepoName={context.repositoryName || context.repositoryId}
          targetRepoName={pendingRepoSwitch.targetRepoName}
          targetRepoId={pendingRepoSwitch.targetRepoId}
          hasTargetRepoSession={pendingRepoSwitch.hasExistingSession}
          onStartNewInvestigation={(targetRepoId) => {
            executeRepoSwitch(targetRepoId, pendingRepoSwitch.targetRepoName, false);
            setPendingRepoSwitch(null);
          }}
          onResumeTargetRepoSession={(targetRepoId) => {
            executeRepoSwitch(targetRepoId, pendingRepoSwitch.targetRepoName, true);
            setPendingRepoSwitch(null);
          }}
        />
      )}
    </div>
  );
};
