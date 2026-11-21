import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Sidebar } from '../../components/navigation/Sidebar';
import { GlassCard } from '../../components/ui/GlassCard';
import { GitHistoryGraph } from '../../components/visualizations/GitHistoryGraph';
import { ArchitectureGraph } from '../../components/visualizations/ArchitectureGraph';
import { DependencyExplorer } from '../../components/visualizations/DependencyExplorer';
import { DecisionRationaleExplorer } from '../../components/visualizations/DecisionRationaleExplorer';
import { FocusedWhyGraph } from '../../components/visualizations/FocusedWhyGraph';
import { FocusedImpactGraph } from '../../components/visualizations/FocusedImpactGraph';
import { GraphLegend, GraphMode } from '../../components/visualizations/GraphLegend';
import { Badge } from '../../components/ui/Badge';
import { GraphNode, GraphEdge, WhyGraphData, GraphSummary } from '../../types/graph';
import { GraphService } from '../../services/graphService';
import { WhyService } from '../../services/whyService';
import { ImpactService } from '../../services/impactService';
import { WhyResult, AIReasoningResponse, AIClaim } from '../../types/why';
import { ImpactResult, ImpactAiExplanationResponse } from '../../types/impact';
import { NormalizedEvidence, AnalysisSummary } from '../../types/evidence';
import { EvidenceInspectorModal } from '../../components/evidence/EvidenceInspectorModal';
import { HistoricalChainVisualizer } from '../../components/visualizations/HistoricalChainVisualizer';
import { ClassificationCards } from '../../components/evidence/ClassificationCards';
import { HistoricalTimeline, HistoricalTimelineEvent } from '../../components/visualizations/HistoricalTimeline';
import { AIExplanationPanel } from '../../components/evidence/AIExplanationPanel';
import { ImpactResultPanel } from '../../components/impact/ImpactResultPanel';
import { API_BASE_URL } from '../../config';
import { ActiveRepositoryService } from '../../services/activeRepositoryService';
import { AIInvestigationSessionService } from '../../services/aiInvestigationSessionService';
import { ReturnToAIInvestigationButton } from '../../components/navigation/ReturnToAIInvestigationButton';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import {
  Network,
  ExternalLink,
  Info,
  ShieldCheck,
  Zap,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  Send,
  Trash2,
  GitCommit,
  GitBranch,
  Layers,
  Package,
  Sparkles,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Bot,
  Brain,
  BrainCircuit,
  History,
  AlertTriangle,
  AlertCircle,
  X,
} from 'lucide-react';
import { GraphNavigationService } from '../../services/graphNavigationService';

// ── Graph Mode types ──────────────────────────────────────────────────────────

type ViewMode = 'GIT_GRAPH' | 'ARCHITECTURE' | 'DEPENDENCIES' | 'DECISIONS';
type NodeAnalysisMode = 'NONE' | 'WHY' | 'WHAT_IF';

interface GraphModeConfig {
  key: ViewMode;
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  activeClass: string;
}

const GRAPH_MODES: GraphModeConfig[] = [
  {
    key: 'GIT_GRAPH',
    label: 'GIT GRAPH',
    icon: <History className="w-3.5 h-3.5" />,
    description: 'Real repository Git history graph (commits, parent relationships, branches, merges)',
    color: 'cyan',
    activeClass: 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30',
  },
  {
    key: 'ARCHITECTURE',
    label: 'ARCHITECTURE',
    icon: <Layers className="w-3.5 h-3.5" />,
    description: 'Complete repository structural layout of files, directories, components, and dependencies',
    color: 'emerald',
    activeClass: 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30',
  },
  {
    key: 'DEPENDENCIES',
    label: 'DEPENDENCIES',
    icon: <Package className="w-3.5 h-3.5" />,
    description: 'Package ecosystem dependencies, manifest declarations, and cross-codebase usage topology',
    color: 'purple',
    activeClass: 'bg-purple-600 text-white shadow-lg shadow-purple-600/30',
  },
  {
    key: 'DECISIONS',
    label: 'DECISIONS & RATIONALE',
    icon: <BrainCircuit className="w-3.5 h-3.5" />,
    description: 'Traceable architectural rationale, linked pull requests, issues, commits, and engineering evidence',
    color: 'purple',
    activeClass: 'bg-purple-600 text-white shadow-lg shadow-purple-600/30',
  },
];

// ── Generation Workflow Stages ────────────────────────────────────────────────
const GENERATION_STAGES = [
  'Loading commits',
  'Resolving parent relationships',
  'Detecting branches',
  'Detecting merges',
  'Building topology',
  'Calculating lanes',
  'Rendering graph',
];

// ── Props ──────────────────────────────────────────────────────────────────────

interface WhyGraphPageProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  claims?: any[];
  suggestedFollowUps?: string[];
  isError?: boolean;
  provider?: string;
  model?: string;
  isFallback?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

export const WhyGraphPage: React.FC<WhyGraphPageProps> = ({ currentRoute, onNavigate }) => {
  const [repositories, setRepositories] = useState<AnalysisSummary[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<WhyGraphData | null>(null);
  const [graphSummary, setGraphSummary] = useState<GraphSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Graph Generation workflow states
  const [isGraphGenerated, setIsGraphGenerated] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStageIndex, setGenerationStageIndex] = useState<number>(0);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [connectedEdges, setConnectedEdges] = useState<GraphEdge[]>([]);
  const [connectedNodes, setConnectedNodes] = useState<GraphNode[]>([]);
  const [nodeUnavailableAlert, setNodeUnavailableAlert] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Workspace tab: GIT_GRAPH, ARCHITECTURE, or DEPENDENCIES
  const [graphMode, setGraphMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view') || params.get('mode') || params.get('tab');
      if (viewParam) {
        const upper = viewParam.toUpperCase();
        if (upper === 'DEPENDENCIES' || upper === 'DEPENDENCY') return 'DEPENDENCIES';
        if (upper === 'DECISIONS' || upper === 'DECISION' || upper === 'RATIONALE') return 'DECISIONS';
        if (upper === 'ARCHITECTURE') return 'ARCHITECTURE';
        if (upper === 'GIT_GRAPH' || upper === 'GIT' || upper === 'TIMELINE' || upper === 'HISTORY') return 'GIT_GRAPH';
      }
    }
    return 'GIT_GRAPH';
  });

  // Keep graphMode, selectedRepoId, and searchQuery synchronized when currentRoute or URL search changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchStr = currentRoute.includes('?')
        ? currentRoute.slice(currentRoute.indexOf('?'))
        : window.location.search;
      const params = new URLSearchParams(searchStr);

      // 1. Synchronize view mode
      const viewParam = params.get('view') || params.get('mode') || params.get('tab');
      if (viewParam) {
        const upper = viewParam.toUpperCase();
        if ((upper === 'DEPENDENCIES' || upper === 'DEPENDENCY') && graphMode !== 'DEPENDENCIES') {
          setGraphMode('DEPENDENCIES');
        } else if ((upper === 'DECISIONS' || upper === 'DECISION' || upper === 'RATIONALE') && graphMode !== 'DECISIONS') {
          setGraphMode('DECISIONS');
        } else if (upper === 'ARCHITECTURE' && graphMode !== 'ARCHITECTURE') {
          setGraphMode('ARCHITECTURE');
        } else if ((upper === 'GIT_GRAPH' || upper === 'GIT' || upper === 'TIMELINE' || upper === 'HISTORY') && graphMode !== 'GIT_GRAPH') {
          setGraphMode('GIT_GRAPH');
        }
      }

      // 2. Synchronize repository parameter
      const repoParam = params.get('repo') || params.get('repoId');
      if (repoParam && repoParam !== selectedRepoId) {
        setSelectedRepoId(repoParam);
        ActiveRepositoryService.setActiveRepoId(repoParam);
      }

      // 3. Synchronize search query
      const searchParam = params.get('search') || params.get('q');
      if (searchParam && searchParam !== searchQuery) {
        setSearchQuery(searchParam);
      }
    }
  }, [currentRoute, selectedRepoId, searchQuery, graphMode]);

  // Active node-level analysis mode
  const [analysisMode, setAnalysisMode] = useState<NodeAnalysisMode>('NONE');

  // WHY Explorer state (Phase 3 + 4)
  const [whyResult, setWhyResult] = useState<WhyResult | null>(null);
  const [whyLoading, setWhyLoading] = useState<boolean>(false);
  const [whyLoadingStep, setWhyLoadingStep] = useState<string>('');
  const [selectedEvidenceModal, setSelectedEvidenceModal] = useState<NormalizedEvidence | null>(null);
  const [activeTab, setActiveTab] = useState<'AI_REASONING' | 'CHAIN' | 'CLASSIFICATION' | 'TIMELINE'>('AI_REASONING');
  const [showConfidenceReasons, setShowConfidenceReasons] = useState<boolean>(false);

  // AI Reasoning state (Phase 4)
  const [aiResponse, setAiResponse] = useState<AIReasoningResponse | null>(null);
  const [isReasoning, setIsReasoning] = useState<boolean>(false);
  const [highlightedClaimNodeIds, setHighlightedClaimNodeIds] = useState<string[]>([]);

  // What-If Impact state (Phase 6)
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [impactAiExplanation, setImpactAiExplanation] = useState<ImpactAiExplanationResponse | null>(null);
  const [impactLoading, setImpactLoading] = useState<boolean>(false);
  const [impactLoadingStep, setImpactLoadingStep] = useState<string>('');
  const [isImpactAiAnalyzing, setIsImpactAiAnalyzing] = useState<boolean>(false);

  // Contextual AI Chat Mode states
  const [chatActive, setChatActive] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat stream to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Reset chat context on node or repo change to prevent context leakage
  useEffect(() => {
    setChatMessages([]);
    setChatActive(false);
  }, [selectedNode?.id, selectedRepoId]);

  // Node-level chronological history states (Preserve node historical timeline in Engineering Graph)
  const [nodeHistoryEvents, setNodeHistoryEvents] = useState<HistoricalTimelineEvent[] | null>(null);
  const [nodeHistoryLoading, setNodeHistoryLoading] = useState<boolean>(false);
  const [showNodeHistory, setShowNodeHistory] = useState<boolean>(true);

  // Fetch chronological change history when a node is selected
  useEffect(() => {
    if (!selectedNode || !selectedRepoId) {
      setNodeHistoryEvents(null);
      setNodeHistoryLoading(false);
      return;
    }

    let isMounted = true;
    setNodeHistoryLoading(true);

    WhyService.fetchNodeHistory(selectedRepoId, selectedNode.id)
      .then((data) => {
        if (!isMounted) return;
        if (data && data.events && data.events.length > 0) {
          const mapped: HistoricalTimelineEvent[] = data.events.map((ev) => ({
            stepNumber: ev.stepNumber,
            id: ev.id,
            title: ev.title,
            type: ev.title?.split(':')[0]?.trim() || selectedNode.type,
            event: ev.event,
            classification: ev.classification,
            timestamp: ev.timestamp,
            sourceUrl: ev.sourceUrl
          }));
          setNodeHistoryEvents(mapped);
        } else {
          // If backend history is unindexed/offline, check connected commit/PR edges from current graph
          const connectedCommitEdges = connectedEdges.filter(
            (e) =>
              e.relationshipType === 'COMMITTED_IN' ||
              e.relationshipType === 'MODIFIED_BY' ||
              e.relationshipType === 'RESOLVES' ||
              e.relationshipType === 'AUTHORED_BY'
          );
          if (connectedCommitEdges.length > 0) {
            const localEvents: HistoricalTimelineEvent[] = connectedCommitEdges.map((e, idx) => {
              const otherId = e.source === selectedNode.id ? e.target : e.source;
              const otherNode = graphData?.nodes.find((n) => n.id === otherId);
              return {
                stepNumber: idx + 1,
                id: otherId,
                title: otherNode?.label || otherId,
                type: otherNode?.type || 'COMMIT',
                event: `${e.relationshipType}: ${otherNode?.label || otherId}`,
                classification: e.classification || 'FACT',
                timestamp:
                  (otherNode?.metadata?.date as string) ||
                  (otherNode?.createdAt as string) ||
                  new Date().toISOString(),
                sourceUrl:
                  (otherNode?.sourceReference as string) ||
                  (otherNode?.metadata?.url as string),
                node: otherNode
              };
            });
            setNodeHistoryEvents(localEvents);
          } else {
            setNodeHistoryEvents([]);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('[WhyGraphPage] Error loading node history:', err);
        setNodeHistoryEvents([]);
      })
      .finally(() => {
        if (isMounted) setNodeHistoryLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedNode?.id, selectedRepoId, connectedEdges.length, graphData]);

  // ── Fetch repositories on mount ─────────────────────────────────────────────

  useEffect(() => {
    const loadRepositories = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/repositories`);
        if (response.ok) {
          const data = await response.json();
          if (data.repositories && data.repositories.length > 0) {
            setRepositories(data.repositories);
            const searchStr = currentRoute.includes('?')
              ? currentRoute.slice(currentRoute.indexOf('?'))
              : window.location.search;
            const params = new URLSearchParams(searchStr);
            const urlRepo = params.get('repo') || params.get('repoId');
            const activeId = ActiveRepositoryService.getActiveRepoId();

            const targetId = urlRepo && data.repositories.some((r: any) => r.repository.id === urlRepo)
              ? urlRepo
              : activeId && data.repositories.some((r: any) => r.repository.id === activeId)
              ? activeId
              : data.repositories[0].repository.id;

            if (urlRepo && data.repositories.some((r: any) => r.repository.id === urlRepo)) {
              ActiveRepositoryService.setActiveRepoId(urlRepo);
            }
            setSelectedRepoId(targetId);
          }
        }
      } catch (err) {
        console.log('[WhyGraphPage] Backend offline or no analyzed repos — Demo Mode.', err);
      }
    };
    loadRepositories();
  }, []);

  useEffect(() => {
    const unsubscribe = ActiveRepositoryService.subscribe((newRepoId) => {
      setSelectedRepoId(newRepoId);
    });
    return unsubscribe;
  }, []);

  // ── Fetch graph data when repo changes ─────────────────────────────────────

  useEffect(() => {
    if (!selectedRepoId) return;

    setSelectedNode(null);
    setSelectedEdge(null);
    setAnalysisMode('NONE');
    setWhyResult(null);
    setAiResponse(null);
    setImpactResult(null);
    setImpactAiExplanation(null);
    setChatActive(false);
    setChatMessages([]);
    setChatInput('');
    setChatLoading(false);

    const fetchGraph = async () => {
      setLoading(true);
      try {
        const [gData, gSum] = await Promise.all([
          GraphService.fetchGraph(selectedRepoId),
          GraphService.fetchGraphSummary(selectedRepoId),
        ]);
        if (gData) setGraphData(gData);
        if (gSum) setGraphSummary(gSum);
        setIsGraphGenerated(Boolean(gData && gData.nodes.length > 0));
      } catch (err) {
        console.error('Failed to load graph data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGraph();
  }, [selectedRepoId]);

  // ── Interactive Graph Generation Pipeline ──────────────────────────────────

  const handleGenerateGraph = async () => {
    if (!selectedRepoId) return;
    setIsGenerating(true);
    setGenerationError(null);
    setGenerationStageIndex(0);

    for (let i = 0; i < GENERATION_STAGES.length; i++) {
      setGenerationStageIndex(i);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    try {
      const [gData, gSum] = await Promise.all([
        GraphService.fetchGraph(selectedRepoId),
        GraphService.fetchGraphSummary(selectedRepoId),
      ]);
      if (gData) setGraphData(gData);
      if (gSum) setGraphSummary(gSum);
      setIsGraphGenerated(true);
    } catch (err: any) {
      setGenerationError(err?.message || 'Failed to generate graph for repository.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendChatMessage = async (
    overrideText?: string,
    targetNodeOverride?: GraphNode,
    modeOverride?: NodeAnalysisMode
  ) => {
    const activeNode = targetNodeOverride || selectedNode;
    const activeMode = modeOverride || analysisMode;
    const repoId = selectedRepoId;

    const messageText = (overrideText || chatInput).trim();
    if (!messageText || !repoId || !activeNode) return;

    if (!overrideText) {
      setChatInput('');
    }

    const userMsg: ChatMessage = { role: 'user', content: messageText };
    const validHistory = chatMessages.filter((m) => !m.isError);
    const updatedMessages = [...validHistory, userMsg];

    setChatMessages(updatedMessages);
    setChatLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(repoId)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: activeNode.id,
          analysisType: activeMode === 'WHAT_IF' ? 'WHAT_IF' : 'WHY',
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          nodeMetadata: {
            name: activeNode.label,
            type: activeNode.type,
            filePath: (activeNode.metadata?.path as string) || activeNode.id.replace(/^file:[^:]+:/, '').replace(/^file:/, ''),
            commitSha: activeNode.metadata?.hash,
            commitMessage: activeNode.metadata?.description,
            author: activeNode.metadata?.author,
            timestamp: activeNode.createdAt || activeNode.metadata?.date
          }
        })
      });

      if (response.ok) {
        const reply = await response.json();
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: reply.answer,
            claims: reply.claims,
            suggestedFollowUps: reply.suggestedFollowUps,
            provider: reply.provider,
            model: reply.model,
            isFallback: Boolean(reply.isFallback || reply.provider === 'LOCAL_FALLBACK')
          }
        ]);
      } else {
        let safeError = 'Server Error';
        try {
          const errJson = await response.json();
          safeError = errJson.details || errJson.error || response.statusText;
        } catch {
          safeError = await response.text();
        }
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `EngiTrace AI could not complete the request.\nReason: ${safeError}`,
            isError: true
          }
        ]);
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `EngiTrace AI could not complete the request.\nReason: ${err.message || String(err)}`,
          isError: true
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── WHY Engine — Node-level action (Navigates to dedicated AI Assistant workspace) ────────────────
  const handleExecuteWhy = (targetNode?: GraphNode) => {
    const target = targetNode || selectedNode;
    const repoId = selectedRepoId || ActiveRepositoryService.getActiveRepoId() || 'repo-facebook-react';
    if (!target) return;

    const initialQuestion = `Why does ${target.label} exist? Please provide a grounded initial explanation of its purpose, history, and connections.`;
    const currentView = graphMode.toLowerCase();

    // Capture complete originating graph context
    GraphNavigationService.saveGraphOrigin({
      repoId,
      view: GraphNavigationService.normalizeView(currentView),
      nodeId: target.id,
      nodeType: target.type,
      nodeLabel: target.label,
      nodePath: (target.metadata?.path as string) || undefined,
      searchQuery: searchQuery || undefined,
      timestamp: Date.now()
    });

    const aiUrl = GraphNavigationService.buildAIAssistantUrl({
      repoId,
      node: target,
      mode: 'WHY',
      view: currentView,
      searchQuery: searchQuery || undefined,
      question: initialQuestion
    });

    onNavigate(aiUrl);
  };

  // ── WHAT-IF Engine — Node-level action (Navigates to dedicated AI Assistant workspace) ─────────────
  const handleExecuteWhatIf = (targetNode?: GraphNode, operation: 'REMOVE' | 'CHANGE' = 'REMOVE') => {
    const target = targetNode || selectedNode;
    const repoId = selectedRepoId || ActiveRepositoryService.getActiveRepoId() || 'repo-facebook-react';
    if (!target) return;

    const initialQuestion = `What happens if ${target.label} is removed? Please explain its impact on downstream components, APIs, and tests.`;
    const currentView = graphMode.toLowerCase();

    // Capture complete originating graph context
    GraphNavigationService.saveGraphOrigin({
      repoId,
      view: GraphNavigationService.normalizeView(currentView),
      nodeId: target.id,
      nodeType: target.type,
      nodeLabel: target.label,
      nodePath: (target.metadata?.path as string) || undefined,
      searchQuery: searchQuery || undefined,
      timestamp: Date.now()
    });

    const aiUrl = GraphNavigationService.buildAIAssistantUrl({
      repoId,
      node: target,
      mode: 'WHAT_IF',
      view: currentView,
      searchQuery: searchQuery || undefined,
      question: initialQuestion
    });

    onNavigate(aiUrl);
  };

  // ── Handle URL query parameters and selected-node restoration ──────────────

  useEffect(() => {
    const searchStr = currentRoute.includes('?')
      ? currentRoute.slice(currentRoute.indexOf('?'))
      : window.location.search;
    const params = new URLSearchParams(searchStr);
    const targetNodeId = params.get('nodeId') || params.get('node');
    const action = params.get('action');
    const targetSessionId = params.get('session');
    if (targetSessionId) {
      AIInvestigationSessionService.setActiveSession(targetSessionId);
    }

    if (!graphData) return;

    if (!targetNodeId) {
      setNodeUnavailableAlert(null);
      return;
    }

    const decId = decodeURIComponent(targetNodeId).trim();
    const lowerDecId = decId.toLowerCase();

    const node =
      graphData.nodes.find((n) => n.id === targetNodeId || n.id === decId || n.id.toLowerCase() === lowerDecId) ||
      graphData.nodes.find((n) => n.label.toLowerCase() === lowerDecId) ||
      graphData.nodes.find(
        (n) => typeof n.metadata?.path === 'string' && (n.metadata.path === decId || n.metadata.path.toLowerCase() === lowerDecId)
      ) ||
      graphData.nodes.find(
        (n) => typeof n.metadata?.hash === 'string' && (n.metadata.hash === decId || n.metadata.hash.startsWith(decId) || decId.startsWith(n.metadata.hash))
      ) ||
      graphData.nodes.find((n) => n.id.toLowerCase().endsWith(lowerDecId) || lowerDecId.endsWith(n.id.toLowerCase()));

    if (node) {
      setSelectedNode(node);
      setSelectedEdge(null);
      setNodeUnavailableAlert(null);
      if (action === 'whatif' || action === 'what_if') {
        handleExecuteWhatIf(node);
      } else if (action === 'why') {
        handleExecuteWhy(node);
      }
    } else {
      console.warn(`[WhyGraphPage] Target node "${targetNodeId}" not found in graph topology for ${selectedRepoId}.`);
      setSelectedNode(null);
      setNodeUnavailableAlert(decId);
    }
  }, [graphData, currentRoute, selectedRepoId]);

  const handleExecuteImpactAiExplanation = async () => {
    const target = selectedNode || (impactResult ? impactResult.target : null);
    const repoId = selectedRepoId || 'demo-repo';
    if (!target) return;

    setIsImpactAiAnalyzing(true);
    const res = await ImpactService.executeAiExplanation(repoId, target.id);
    setImpactAiExplanation(res);
    setIsImpactAiAnalyzing(false);
  };

  const handleExecuteAiReasoningOnly = async () => {
    const target = selectedNode || (whyResult ? whyResult.target : null);
    const repoId = selectedRepoId || 'demo-repo';
    if (!target) return;

    setIsReasoning(true);
    const aiRes = await WhyService.executeAiReasoning(repoId, target.id);
    setAiResponse(aiRes);
    setIsReasoning(false);
    setActiveTab('AI_REASONING');
  };

  // ── Chat and proof visual jumps ────────────────────────────────────────────

  const navigateToNode = (nodeId: string) => {
    if (!graphData) return;
    const target = graphData.nodes.find((n) => n.id === nodeId);
    if (target) {
      setSelectedNode(target);
      // Switch view mode depending on the target node type
      if (target.type === 'COMMIT' || target.type === 'PULL_REQUEST' || target.type === 'ISSUE') {
        setGraphMode('GIT_GRAPH');
      } else if (target.type === 'DEPENDENCY') {
        setGraphMode('DEPENDENCIES');
      } else if (target.type === 'DECISION') {
        setGraphMode('DECISIONS');
      } else {
        setGraphMode('ARCHITECTURE');
      }
    }
  };

  const handleInspectEvidenceNode = (ev: any) => {
    const targetId = ev.sourceId || ev.source || ev.targetId || ev.target;
    if (targetId) {
      navigateToNode(targetId);
    }
  };

  const handleInspectArchitectureNode = (ev: any) => {
    setGraphMode('ARCHITECTURE');
    const targetId = ev.sourceId || ev.source || ev.targetId || ev.target;
    if (targetId) {
      navigateToNode(targetId);
    }
  };

  // ── Claim highlight handler ────────────────────────────────────────────────

  const handleSelectClaim = (claim: AIClaim) => {
    if (!graphData) return;

    const matchedNodeIds: string[] = [];
    if (claim.evidenceIds && claim.evidenceIds.length > 0) {
      claim.evidenceIds.forEach((evId) => {
        const edge = graphData.edges.find((e) => e.id === evId);
        if (edge) matchedNodeIds.push(edge.source, edge.target);
      });
    }
    graphData.nodes.forEach((node) => {
      if (claim.text.toLowerCase().includes(node.label.toLowerCase())) {
        matchedNodeIds.push(node.id);
      }
    });

    setHighlightedClaimNodeIds(matchedNodeIds.length > 0 ? matchedNodeIds : []);
  };

  // ── Evidence inspector ────────────────────────────────────────────────────

  const handleOpenEvidenceById = (evidenceId: string) => {
    if (whyResult) {
      const match = whyResult.evidence.find((e) => e.id === evidenceId);
      if (match) { setSelectedEvidenceModal(match); return; }
    }
    if (impactResult) {
      const match = impactResult.evidence.find((e) => e.id === evidenceId);
      if (match) {
        setSelectedEvidenceModal({
          id: match.id,
          repositoryId: selectedRepoId || 'demo-repo',
          source: match.sourceId,
          target: match.targetId,
          relationshipType: (match.relationshipType || 'DEPENDS_ON') as import('../../types/evidence').RelationshipType,
          classification: match.classification || 'FACT',
          confidence: match.confidence || 0.9,
          title: `${match.relationshipType}: ${match.sourceId} -> ${match.targetId}`,
          description: match.evidence || 'Graph edge impact evidence',
          sourceUrl: match.sourceUrl || '',
          timestamp: match.timestamp || new Date().toISOString(),
        });
        return;
      }
    }
    if (graphData) {
      const edge = graphData.edges.find((e) => e.id === evidenceId);
      if (edge) {
        setSelectedEvidenceModal({
          id: edge.id,
          repositoryId: selectedRepoId || 'demo-repo',
          source: edge.source,
          target: edge.target,
          relationshipType: (edge.relationshipType || 'MODIFIED_BY') as import('../../types/evidence').RelationshipType,
          classification: edge.classification || 'FACT',
          confidence: edge.confidence || 0.9,
          title: `${edge.relationshipType}: ${edge.source} -> ${edge.target}`,
          description: edge.evidence || 'Graph edge evidence',
          sourceUrl: edge.sourceUrl || '',
          timestamp: edge.timestamp || new Date().toISOString(),
        });
      }
    }
  };

  // ── Computed node highlight sets ──────────────────────────────────────────

  const baseHighlightedNodeIds = whyResult
    ? whyResult.historicalChain.map((step) => step.node.id)
    : selectedNode
      ? [selectedNode.id, ...connectedNodes.map((n) => n.id)]
      : [];

  const combinedHighlightedNodeIds = Array.from(
    new Set([...baseHighlightedNodeIds, ...highlightedClaimNodeIds]),
  );

  const directImpactNodeIds = impactResult ? impactResult.directImpact.map((n) => n.id) : [];
  const indirectImpactNodeIds = impactResult ? impactResult.indirectImpact.map((n) => n.id) : [];

  // ── Mode switch handler ───────────────────────────────────────────────────

  const handleSwitchMode = (mode: ViewMode) => {
    setGraphMode(mode);
    setSelectedNode(null);
    setSelectedEdge(null);
    setNodeUnavailableAlert(null);
    setAnalysisMode('NONE');
    setWhyResult(null);
    setAiResponse(null);
    setImpactResult(null);
    setImpactAiExplanation(null);
    setChatActive(false);
    setChatMessages([]);
    setNodeHistoryEvents(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', mode.toLowerCase());
      url.searchParams.delete('nodeId');
      url.searchParams.delete('node');
      window.history.replaceState({}, '', url.toString());
    } catch { }
  };

  // ── Node selection handler ────────────────────────────────────────────────

  const handleSelectNode = (node: GraphNode | null) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    setNodeUnavailableAlert(null);
    setChatActive(false);
    setChatMessages([]);
    setChatInput('');
    setChatLoading(false);

    try {
      const url = new URL(window.location.href);
      if (node) {
        url.searchParams.set('nodeId', node.id);
      } else {
        url.searchParams.delete('nodeId');
        url.searchParams.delete('node');
      }
      window.history.replaceState({}, '', url.toString());
    } catch { }
  };

  // ── Legend mode mapping ───────────────────────────────────────────────────
  const legendMode: GraphMode =
    analysisMode === 'WHAT_IF' ? 'WHAT_IF' :
      analysisMode === 'WHY' ? 'WHY' :
        graphMode === 'ARCHITECTURE' ? 'ARCHITECTURE' :
          graphMode === 'DEPENDENCIES' ? 'DEPENDENCIES' :
            graphMode === 'DECISIONS' ? 'DECISIONS' : 'HISTORY';

  // ── Active mode config ────────────────────────────────────────────────────
  const activeModeConfig = GRAPH_MODES.find((m) => m.key === graphMode) || GRAPH_MODES[0];

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#05070C] text-slate-100 flex">
      <Sidebar currentRoute={currentRoute} onNavigate={onNavigate} />

      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="px-8 py-4 bg-[#070A12]/90 backdrop-blur border-b border-slate-800/80 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold font-display text-white">EngiTrace Intelligence</h1>
              <Badge variant="cyan" icon={<Brain className="w-3 h-3 text-cyan-400" />}>
                Engineering Memory Graph
              </Badge>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              {activeModeConfig.description}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Repository Selector */}
            {repositories.length > 0 ? (
              <select
                value={selectedRepoId || ''}
                onChange={(e) => {
                  setSelectedRepoId(e.target.value);
                  setSelectedNode(null);
                  setSelectedEdge(null);
                  setAnalysisMode('NONE');
                  setWhyResult(null);
                  setAiResponse(null);
                  setImpactResult(null);
                  setImpactAiExplanation(null);
                  setChatActive(false);
                  setChatMessages([]);
                  setChatInput('');
                  setChatLoading(false);
                }}
                className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
              >
                {repositories.map((repo) => (
                  <option key={repo.repository.id} value={repo.repository.id}>
                    {repo.repository.name} ({repo.totalEvidenceRecords} evidence records)
                  </option>
                ))}
              </select>
            ) : (
              <Badge variant="purple">Demo Mode</Badge>
            )}

            <button
              onClick={() => onNavigate('/repository')}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-mono transition flex items-center gap-1.5"
            >
              Ingest Repo
            </button>
          </div>
        </header>

        {/* ── Main Content ───────────────────────────────────────────────── */}
        <div className="p-6 space-y-6 flex-1">
          {(() => {
            const hasSelection = Boolean(selectedNode || selectedEdge);
            const showSidePanel = hasSelection && graphMode !== 'DEPENDENCIES' && graphMode !== 'DECISIONS';
            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start transition-all duration-300">

                {/* ── Left: Graph Canvas ──────────────────────────────────────── */}
                <div className={`${showSidePanel ? 'lg:col-span-7' : 'lg:col-span-12'} transition-all duration-300 space-y-4`}>

                  <GlassCard padding="none" className="overflow-hidden border-cyan-500/15 relative">

                    {/* ── Mode Switcher Bar ─────────────────────────────────── */}
                    <div className="p-3 bg-slate-950/80 border-b border-slate-800/80 flex flex-col gap-3">

                      {/* Graph mode tabs */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {GRAPH_MODES.map((mode) => (
                          <button
                            key={mode.key}
                            onClick={() => handleSwitchMode(mode.key)}
                            title={mode.description}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition ${graphMode === mode.key
                              ? mode.activeClass
                              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-600'
                              }`}
                          >
                            {mode.icon}
                            <span>{mode.label}</span>
                          </button>
                        ))}

                        {/* Action controls for Git Graph */}
                        {graphMode === 'GIT_GRAPH' && (
                          <div className="flex items-center gap-1.5 ml-2">
                            <button
                              onClick={handleGenerateGraph}
                              disabled={isGenerating}
                              className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                              <span>{isGenerating ? 'GENERATING...' : isGraphGenerated ? 'REGENERATE GRAPH' : 'GENERATE GRAPH'}</span>
                            </button>
                          </div>
                        )}

                        {/* Search box - Global graph search across entities */}
                        <div
                          className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs ml-auto"
                          title="Global repository graph search (commits, files, components)"
                        >
                          <Search className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                          <input
                            type="text"
                            placeholder="Global search (commits, files)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none text-slate-200 focus:outline-none w-44 text-xs font-mono"
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="p-0.5 hover:text-white text-slate-500"
                              title="Clear global search"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Help text for current workspace tab */}
                      {graphMode === 'GIT_GRAPH' && (
                        <div className="flex items-start gap-2 px-1">
                          <GitBranch className="w-3 h-3 text-cyan-500/70 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                            Explore how this repository evolved through real commits, branches, and merges. Select a commit to inspect its engineering context.
                          </p>
                        </div>
                      )}
                      {graphMode === 'ARCHITECTURE' && (
                        <div className="flex items-start gap-2 px-1">
                          <Layers className="w-3 h-3 text-emerald-500/70 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                            ARCHITECTURE — Real repository directory tree & structural layout. Select any file or folder to inspect relationships.
                          </p>
                        </div>
                      )}
                      {graphMode === 'DEPENDENCIES' && (
                        <div className="flex items-start gap-2 px-1">
                          <Package className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                            DEPENDENCIES — Package ecosystem manifests, direct & indirect dependents, and structural impact topology.
                          </p>
                        </div>
                      )}
                      {graphMode === 'DECISIONS' && (
                        <div className="flex items-start gap-2 px-1">
                          <BrainCircuit className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                            DECISIONS &amp; RATIONALE — Traceable engineering rationale connecting commits, PRs, issues, ADRs, and historical evidence.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Notice when restored node could not be resolved */}
                    {nodeUnavailableAlert && (
                      <div className="mx-4 mb-3 p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl flex items-center justify-between gap-3 text-xs font-mono text-amber-200 animate-in fade-in">
                        <div className="flex items-center gap-2 min-w-0">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="truncate">
                            The previously selected entity <strong className="text-white">"{nodeUnavailableAlert}"</strong> is unavailable in the current {selectedRepoId} graph topology.
                          </span>
                        </div>
                        <button
                          onClick={() => setNodeUnavailableAlert(null)}
                          className="text-amber-400 hover:text-white p-1 rounded hover:bg-amber-900/50 transition cursor-pointer shrink-0"
                          title="Dismiss notice"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* ── Graph Canvas ──────────────────────────────────────── */}
                    <div className="relative" style={{ height: graphMode === 'DEPENDENCIES' || graphMode === 'DECISIONS' ? '890px' : '480px' }}>
                      {loading || isGenerating ? (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-8">
                          <div className="inline-flex items-center justify-center p-4 rounded-full bg-cyan-500/10 border border-cyan-500/30 animate-spin">
                            <RefreshCw className="w-6 h-6 text-cyan-400" />
                          </div>
                          <div className="space-y-1.5 font-mono text-xs text-slate-400">
                            <p className="text-slate-200 font-bold uppercase tracking-wider">
                              {isGenerating ? 'GENERATING GIT GRAPH TOPOLOGY' : 'LOADING REPOSITORY MEMORY'}
                            </p>
                            {isGenerating ? (
                              <div className="space-y-1 text-left bg-slate-950/90 p-4 rounded-xl border border-slate-800 w-64 mx-auto mt-2">
                                {GENERATION_STAGES.map((stage, idx) => (
                                  <div key={idx} className={`flex items-center gap-2 ${idx <= generationStageIndex ? 'text-cyan-400 font-bold' : 'text-slate-600'}`}>
                                    <span>{idx <= generationStageIndex ? '✓' : '○'}</span>
                                    <span>{stage}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <>
                                <p className="animate-pulse">✓ Repository metadata loaded</p>
                                <p className="animate-pulse text-cyan-400">● Reconstructing topology graph...</p>
                              </>
                            )}
                          </div>
                        </div>
                      ) : !isGraphGenerated && graphMode === 'GIT_GRAPH' ? (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4 font-mono p-8 bg-slate-950/80">
                          <GitBranch className="w-12 h-12 text-cyan-400/80 animate-pulse" />
                          <div className="space-y-1">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">GIT GRAPH</h3>
                            <p className="text-xs text-slate-400">Repository: {selectedRepoId}</p>
                            <p className="text-xs text-slate-500">Graph not generated yet.</p>
                          </div>
                          <button
                            onClick={handleGenerateGraph}
                            className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-lg shadow-cyan-600/30 flex items-center gap-2 cursor-pointer"
                          >
                            <RefreshCw className="w-4 h-4" />
                            <span>GENERATE GRAPH</span>
                          </button>
                          {generationError && (
                            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900 text-rose-300 text-xs">
                              <p className="font-bold">Unable to generate Git graph.</p>
                              <p className="text-[11px] opacity-80">{generationError}</p>
                              <button onClick={handleGenerateGraph} className="mt-2 text-cyan-400 underline font-bold cursor-pointer">RETRY</button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* FOCUSED WHY GRAPH mode */}
                          {analysisMode === 'WHY' && whyResult ? (
                            <FocusedWhyGraph
                              whyResult={whyResult}
                              fullGraph={graphData}
                              selectedNodeId={selectedNode?.id || null}
                              onSelectNode={handleSelectNode}
                              onSelectEdge={(edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
                              onInspectEvidence={handleOpenEvidenceById}
                              onCloseFocus={() => {
                                setAnalysisMode('NONE');
                                setWhyResult(null);
                                setChatActive(false);
                              }}
                              className="w-full h-full"
                            />
                          ) : analysisMode === 'WHAT_IF' && impactResult ? (
                            <FocusedImpactGraph
                              impactResult={impactResult}
                              fullGraph={graphData}
                              selectedNodeId={selectedNode?.id || null}
                              onSelectNode={handleSelectNode}
                              onSelectEdge={(edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
                              onInspectEvidence={handleOpenEvidenceById}
                              onCloseFocus={() => {
                                setAnalysisMode('NONE');
                                setImpactResult(null);
                                setChatActive(false);
                              }}
                              className="w-full h-full"
                            />
                          ) : graphMode === 'GIT_GRAPH' ? (
                            <GitHistoryGraph
                              data={graphData}
                              onSelectNode={handleSelectNode}
                              selectedNodeId={selectedNode?.id || null}
                              highlightedNodeIds={[]}
                              targetNodeId={analysisMode === 'WHAT_IF' ? (impactResult?.target.id || selectedNode?.id || null) : null}
                              directImpactNodeIds={analysisMode === 'WHAT_IF' ? directImpactNodeIds : []}
                              indirectImpactNodeIds={analysisMode === 'WHAT_IF' ? indirectImpactNodeIds : []}
                              isImpactMode={analysisMode === 'WHAT_IF' && Boolean(impactResult)}
                              searchQuery={searchQuery}
                              className="w-full h-full"
                            />
                          ) : graphMode === 'ARCHITECTURE' ? (
                            <ArchitectureGraph
                              data={graphData}
                              onSelectNode={handleSelectNode}
                              onSelectEdge={(edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
                              selectedNodeId={selectedNode?.id || null}
                              highlightedNodeIds={combinedHighlightedNodeIds}
                              searchQuery={searchQuery}
                              className="w-full h-full"
                            />
                          ) : graphMode === 'DEPENDENCIES' ? (
                            <DependencyExplorer
                              data={graphData}
                              selectedRepoId={selectedRepoId}
                              isDemoRepo={repositories.length === 0 || selectedRepoId === 'demo-repo'}
                              selectedNodeId={selectedNode?.id || null}
                              onSelectNode={handleSelectNode}
                              onSelectEdge={(edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
                              onAnalyzeImpact={(node) => handleExecuteWhatIf(node, 'REMOVE')}
                              onInspectEvidence={handleOpenEvidenceById}
                              onSwitchToArchitecture={() => handleSwitchMode('ARCHITECTURE')}
                              searchQuery={searchQuery}
                              className="w-full h-full"
                            />
                          ) : (
                            <DecisionRationaleExplorer
                              data={graphData}
                              selectedRepoId={selectedRepoId}
                              isDemoRepo={repositories.length === 0 || selectedRepoId === 'demo-repo'}
                              selectedNodeId={selectedNode?.id || null}
                              onSelectNode={handleSelectNode}
                              onSelectEdge={(edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
                              onInspectEvidence={handleOpenEvidenceById}
                              onTriggerWhy={(node) => handleExecuteWhy(node)}
                              onNavigateToDecisionDebt={() => onNavigate('/decision-debt')}
                              onSwitchToArchitecture={() => handleSwitchMode('ARCHITECTURE')}
                              searchQuery={searchQuery}
                              className="w-full h-full"
                            />
                          )}
                        </>
                      )}
                    </div>

                    {/* ── Graph Footer: Legend ──────────────────────────────── */}
                    <div className="p-3 bg-slate-950/90 border-t border-slate-800/80">
                      <GraphLegend mode={legendMode} />
                    </div>
                    {/* Graph canvas card closed */}
                  </GlassCard>
                </div>

                {/* ── Right: Node Investigation Panel (Contextual - visible only when node or edge is selected) ────────────────────────── */}
                {showSidePanel && (
                  <div className="lg:col-span-5 space-y-4 transition-all duration-300 animate-in fade-in slide-in-from-right-4">
                    <GlassCard padding="md" className="border-cyan-500/20">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 font-mono">
                        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                          <Info className="w-4 h-4 text-cyan-400" /> Node Details & Intelligence
                        </h2>
                        <div className="flex items-center gap-2">
                          <Badge variant="cyan" className="text-[9px]">
                            {analysisMode === 'WHY'
                              ? 'Historical WHY Mode'
                              : analysisMode === 'WHAT_IF'
                                ? 'What-If Impact Mode'
                                : graphMode === 'ARCHITECTURE'
                                  ? 'Architecture Mode'
                                  : 'Git Graph Mode'}
                          </Badge>
                          <button
                            onClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition cursor-pointer"
                            title="Deselect node / close panel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div>
                        {selectedNode ? (
                          <div className="space-y-4 font-mono text-xs">
                            <div>
                              <div className="flex items-center justify-between">
                                <Badge variant="purple">{selectedNode.type}</Badge>
                                <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                  {selectedNode.id}
                                </span>
                              </div>
                              <h3 className="text-lg font-bold text-white mt-2 font-display break-all">
                                {selectedNode.label}
                              </h3>
                              {selectedNode.sublabel && (
                                <p className="text-xs text-slate-400 mt-1 break-all">{selectedNode.sublabel}</p>
                              )}
                            </div>

                            {/* WHY? and WHAT IF? action buttons */}
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                onClick={() => handleExecuteWhy(selectedNode)}
                                disabled={whyLoading || isReasoning}
                                className="py-3 px-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/30 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <HelpCircle className="w-4 h-4 text-cyan-200" />
                                <span>WHY?</span>
                              </button>

                              <button
                                onClick={() => handleExecuteWhatIf(selectedNode, 'REMOVE')}
                                disabled={impactLoading}
                                className="py-3 px-3 bg-gradient-to-r from-rose-600 via-amber-600 to-rose-700 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <Zap className="w-4 h-4 text-amber-200" />
                                <span>WHAT IF?</span>
                              </button>
                            </div>

                            {/* Return to AI Investigation button */}
                            <ReturnToAIInvestigationButton
                              repoId={selectedRepoId || ActiveRepositoryService.getActiveRepoId() || 'repo-facebook-react'}
                              node={selectedNode}
                              onNavigate={onNavigate}
                            />

                            <button
                              onClick={() => handleExecuteWhatIf(selectedNode, 'REMOVE')}
                              disabled={impactLoading}
                              className="w-full text-left p-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-mono text-xs flex items-center justify-between transition group"
                            >
                              <span className="font-bold">WHAT IF I REMOVE THIS?</span>
                              <ArrowRight className="w-4 h-4 text-rose-400 group-hover:translate-x-1 transition-transform" />
                            </button>

                            {selectedNode.metadata?.description && (
                              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans">
                                {selectedNode.metadata.description}
                              </div>
                            )}

                            {/* Node metadata */}
                            <div className="space-y-2 text-xs text-slate-400 pt-3 border-t border-slate-800">
                              {selectedNode.metadata?.author && (
                                <div className="flex justify-between">
                                  <span>Author:</span>
                                  <span className="text-slate-200">{selectedNode.metadata.author as string}</span>
                                </div>
                              )}
                              {(selectedNode.metadata?.date || selectedNode.createdAt) && (
                                <div className="flex justify-between">
                                  <span>Timestamp:</span>
                                  <span className="text-slate-200">
                                    {new Date(
                                      (selectedNode.metadata?.date as string) || selectedNode.createdAt || '',
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                              {Boolean(selectedNode.metadata?.hash) && (
                                <div className="flex justify-between">
                                  <span>Hash:</span>
                                  <span className="text-cyan-400 font-mono">{String(selectedNode.metadata?.hash || '').slice(0, 8)}</span>
                                </div>
                              )}
                              {connectedEdges.length > 0 && (
                                <div className="flex justify-between">
                                  <span>Graph Degree:</span>
                                  <span className="text-cyan-400 font-bold">{connectedEdges.length} connected edges</span>
                                </div>
                              )}
                            </div>

                            {/* Connected edges */}
                            {connectedEdges.length > 0 && (
                              <div className="pt-3 border-t border-slate-800 space-y-2">
                                <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                                  Connected Neighborhood ({connectedEdges.length})
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                                  {connectedEdges.map((edge) => (
                                    <button
                                      key={edge.id}
                                      onClick={() => setSelectedEdge(edge)}
                                      className="w-full text-left p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs flex items-center justify-between transition"
                                    >
                                      <span className="text-cyan-300 truncate">
                                        {edge.relationshipType} ➔{' '}
                                        {edge.target === selectedNode.id
                                          ? edge.source.split(':').pop()
                                          : edge.target.split(':').pop()}
                                      </span>
                                      <Badge
                                        variant={edge.classification === 'FACT' ? 'emerald' : 'amber'}
                                        className="text-[9px] py-0 px-1"
                                      >
                                        {edge.classification || 'FACT'}
                                      </Badge>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Chronological Change History (Node-Level Timeline) */}
                            <div className="pt-3 border-t border-slate-800 space-y-2">
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => setShowNodeHistory(!showNodeHistory)}
                                  className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-bold hover:text-slate-200 transition-colors cursor-pointer"
                                >
                                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>Chronological History</span>
                                  {showNodeHistory ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                                </button>
                                {nodeHistoryLoading ? (
                                  <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />
                                ) : nodeHistoryEvents && nodeHistoryEvents.length > 0 ? (
                                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">
                                    {nodeHistoryEvents.length} {nodeHistoryEvents.length === 1 ? 'event' : 'events'}
                                  </span>
                                ) : null}
                              </div>

                              {showNodeHistory && (
                                <div className="max-h-64 overflow-y-auto pr-1">
                                  <HistoricalTimeline
                                    compact
                                    events={nodeHistoryEvents || []}
                                    targetNode={selectedNode}
                                    loading={nodeHistoryLoading}
                                    onSelectEvent={(item) => {
                                      if ('node' in item && item.node) {
                                        setSelectedNode(item.node);
                                      } else if ('id' in item && item.id) {
                                        const found = graphData?.nodes.find((n) => n.id === item.id);
                                        if (found) setSelectedNode(found);
                                      }
                                    }}
                                  />
                                </div>
                              )}
                            </div>

                            {selectedNode.sourceReference && (
                              <a
                                href={selectedNode.sourceReference}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs transition"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> View Source Reference
                              </a>
                            )}
                          </div>
                        ) : selectedEdge ? (
                          <div className="space-y-4 font-mono text-xs">
                            <div>
                              <Badge variant="cyan">Edge Relationship</Badge>
                              <h3 className="text-base font-bold text-white mt-2 font-display">
                                {selectedEdge.relationshipType || 'RELATIONSHIP'}
                              </h3>
                              <p className="text-xs text-slate-400 mt-1">
                                {selectedEdge.source} <ArrowRight className="inline w-3 h-3 mx-1" /> {selectedEdge.target}
                              </p>
                            </div>

                            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Traceable Evidence</div>
                              <p className="text-xs text-slate-200 leading-relaxed font-sans">
                                {selectedEdge.evidence || 'Direct relationship recorded from repository metadata.'}
                              </p>
                            </div>

                            {selectedEdge.sourceUrl && (
                              <a
                                href={selectedEdge.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs transition"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Open GitHub Evidence Source
                              </a>
                            )}
                          </div>
                        ) : null}
                      </div>

                      {/* Memory Health summary */}
                      <div className="pt-3 border-t border-slate-800 mt-4">
                        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">
                          Repository Memory Health
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center font-mono">
                          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <div className="text-base font-bold text-emerald-400">{graphSummary?.factCount || 12}</div>
                            <div className="text-[9px] text-slate-400">FACTS</div>
                          </div>
                          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <div className="text-base font-bold text-amber-400">{graphSummary?.inferenceCount || 3}</div>
                            <div className="text-[9px] text-slate-400">INFERENCES</div>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
                            <div className="text-base font-bold text-slate-300">{graphSummary?.unknownCount || 1}</div>
                            <div className="text-[9px] text-slate-400">UNKNOWNS</div>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── ROW 2: Full-Width Bottom AI Investigation Workspace ────────── */}
          <div className="lg:col-span-12">
            <GlassCard padding="md" className={`border-cyan-500/30 relative transition-all duration-300 ${chatActive ? 'min-h-[520px] max-h-[640px] h-[58vh] flex flex-col overflow-hidden' : 'min-h-[160px]'}`}>
              {/* Header controls: Close / Collapse */}
              {(analysisMode === 'WHY' || analysisMode === 'WHAT_IF') && (
                <button
                  onClick={() => {
                    setAnalysisMode('NONE');
                    setWhyResult(null);
                    setAiResponse(null);
                    setImpactResult(null);
                    setImpactAiExplanation(null);
                    setChatActive(false);
                    setChatMessages([]);
                  }}
                  className="absolute top-4 right-4 text-xs font-mono text-slate-400 hover:text-slate-200 hover:underline cursor-pointer z-10"
                  title="Close analysis and return to workspace view"
                >
                  Close Analysis ×
                </button>
              )}

              {analysisMode === 'WHY' || analysisMode === 'WHAT_IF' ? (
                chatActive ? (
                  /* ── CONTEXTUAL AI CHAT WORKSPACE ── */
                  <div className="flex flex-col h-full space-y-3 font-mono text-xs overflow-hidden">
                    {/* Header Bar */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 pr-28 flex-shrink-0">
                      <div className="flex items-center gap-3">
                        <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                          <Bot className="w-5 h-5 text-cyan-400 animate-pulse" /> ENGITRACE AI CHAT
                        </h2>
                        <Badge variant="cyan" className="text-[9px]">
                          MODE: {analysisMode === 'WHAT_IF' ? 'WHAT IF' : 'WHY'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
                        <span className="bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                          Context: <strong className="text-cyan-300">{selectedNode?.label}</strong> ({selectedNode?.type || 'NODE'})
                        </span>
                        <span>•</span>
                        <span className="bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                          Repo: <strong className="text-slate-200">{repositories.find((r) => r.repository.id === selectedRepoId)?.repository.name || selectedRepoId}</strong>
                        </span>
                        <button
                          onClick={() => {
                            const repoId = selectedRepoId || 'repo-facebook-react';
                            const nodeId = selectedNode ? selectedNode.id : '';
                            const mode = analysisMode === 'WHAT_IF' ? 'WHAT_IF' : 'WHY';
                            onNavigate(`/ai-assistant?repo=${encodeURIComponent(repoId)}&node=${encodeURIComponent(nodeId)}&mode=${mode}`);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold flex items-center gap-1 transition cursor-pointer"
                          title="Open in Dedicated AI Assistant Workspace"
                        >
                          <Sparkles className="w-3 h-3 text-cyan-400" />
                          <span>Dedicated Workspace ↗</span>
                        </button>
                      </div>
                    </div>

                    {/* Scrollable Conversation Stream */}
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-2 border border-slate-900 bg-slate-950/70 rounded-xl p-4 shadow-inner">
                      {chatMessages.length === 0 ? (
                        <div className="text-center text-slate-500 py-12 font-sans space-y-3">
                          <Bot className="w-10 h-10 text-slate-700 mx-auto animate-pulse" />
                          <div className="text-sm font-semibold text-slate-300">
                            EngiTrace AI — Contextual Chatbot
                          </div>
                          <p className="text-xs text-slate-500 max-w-md mx-auto">
                            Connected to node <strong className="text-cyan-400">{selectedNode?.label}</strong>. Ask any question about its purpose, commits, or dependencies.
                          </p>
                          <div className="flex flex-wrap justify-center gap-2 pt-3">
                            {[
                              `Why does ${selectedNode?.label} exist?`,
                              `Which commit changed ${selectedNode?.label}?`,
                              `What depends on ${selectedNode?.label}?`,
                              `What happens if I remove ${selectedNode?.label}?`
                            ].map((promptText, pIdx) => (
                              <button
                                key={pIdx}
                                onClick={() => handleSendChatMessage(promptText)}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50 transition cursor-pointer"
                              >
                                "{promptText}"
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        chatMessages.map((msg, idx) => (
                          <div key={idx} className="space-y-2">
                            <div className={`flex items-center gap-1.5 font-bold text-[10px] tracking-wide ${msg.role === 'user' ? 'text-indigo-400' : 'text-cyan-400'}`}>
                              <span>{msg.role === 'user' ? '● YOU' : '● ENGITRACE AI'}</span>
                            </div>

                            {msg.isError ? (
                              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/60 text-rose-300 leading-relaxed font-sans space-y-3">
                                <div className="font-semibold text-xs text-rose-400 flex items-center gap-2">
                                  <span>⚠️</span> EngiTrace AI could not complete the request.
                                </div>
                                <div className="text-xs text-rose-300/90 whitespace-pre-wrap font-mono text-[11px] bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/30">
                                  {msg.content.replace(/^EngiTrace AI could not complete the request\.\nReason:\s*/, '')}
                                </div>
                                <button
                                  onClick={() => {
                                    const lastUserMsg = [...chatMessages].reverse().find(m => m.role === 'user');
                                    if (lastUserMsg) handleSendChatMessage(lastUserMsg.content);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-rose-900/40 hover:bg-rose-800/60 border border-rose-700/80 text-rose-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Retry Request</span>
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {/* Fallback Notice Badge */}
                                {msg.role === 'assistant' && msg.isFallback && (
                                  <div className="flex items-center justify-between text-[11px] font-mono text-amber-300 bg-amber-950/30 border border-amber-800/40 px-3 py-1.5 rounded-lg">
                                    <span className="flex items-center gap-1.5">
                                      <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                      <span>Gemini is temporarily unavailable. Showing evidence-grounded local explanation.</span>
                                    </span>
                                    <Badge variant="amber" className="text-[9px] py-0 shrink-0">LOCAL FALLBACK</Badge>
                                  </div>
                                )}

                                {/* Natural Language Explanation */}
                                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/70 text-slate-200 leading-relaxed font-sans text-xs">
                                  <MarkdownRenderer content={msg.content} />
                                </div>

                                {/* Supporting Evidence & Claims */}
                                {msg.role === 'assistant' && msg.claims && msg.claims.length > 0 && (
                                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 font-mono tracking-wider">
                                      <span>SUPPORTING EVIDENCE & CLAIMS ({msg.claims.length})</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {msg.claims.map((claim, cIdx) => (
                                        <div key={cIdx} className="flex items-start gap-2 p-2 rounded-lg bg-slate-900/50 border border-slate-800/50 text-[11px] font-sans">
                                          <Badge
                                            variant={claim.classification === 'FACT' ? 'emerald' : claim.classification === 'INFERENCE' ? 'amber' : 'rose'}
                                            className="text-[8px] py-0.5 px-1.5 font-bold uppercase shrink-0 mt-0.5"
                                          >
                                            {claim.classification || 'FACT'}
                                          </Badge>
                                          <div className="text-slate-300 flex-1 leading-snug">
                                            {claim.text || claim.statement}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Render Suggested Follow-ups */}
                            {msg.role === 'assistant' && idx === chatMessages.length - 1 && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                <div className="text-[10px] font-bold text-slate-400 tracking-wider font-mono">SUGGESTED FOLLOW-UPS:</div>
                                <div className="flex flex-wrap gap-2">
                                  {msg.suggestedFollowUps.map((qText, sIdx) => (
                                    <button
                                      key={sIdx}
                                      onClick={() => handleSendChatMessage(qText)}
                                      disabled={chatLoading}
                                      className="px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-800/60 hover:bg-cyan-900/60 text-cyan-300 text-[11px] font-sans transition cursor-pointer disabled:opacity-50"
                                    >
                                      {qText} →
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                      {chatLoading && (
                        <div className="flex items-center gap-2 text-slate-400 italic py-3 text-[11px] font-mono bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                          <span>ENGITRACE AI: Analyzing selected node context & repository evidence...</span>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-900 flex-shrink-0">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={`Ask about ${selectedNode?.label || 'this node'}...`}
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendChatMessage();
                            }
                          }}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-sans"
                          disabled={chatLoading}
                        />
                        <button
                          onClick={() => handleSendChatMessage()}
                          disabled={chatLoading || !chatInput.trim()}
                          className="px-5 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs disabled:opacity-50 transition cursor-pointer flex items-center gap-2 shadow-lg shadow-cyan-600/20"
                        >
                          <span>Send</span>
                          <Send className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Press Enter to send message</span>
                        <button
                          onClick={() => setChatMessages([])}
                          className="text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" /> Clear Chat History
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── ANALYSIS RESULT MODE ── */
                  <div className="space-y-4">
                    {analysisMode === 'WHY' && (whyLoading || isReasoning || whyResult) && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-2">
                          <div className="flex items-center gap-3">
                            <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
                              WHY DOES THIS EXIST?
                            </h2>
                            {whyResult && (
                              <Badge variant="cyan">
                                Confidence: {Math.round(whyResult.confidence.score * 100)}% ({whyResult.confidence.level})
                              </Badge>
                            )}
                          </div>

                          {whyResult && (
                            <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
                              {(
                                [
                                  { key: 'AI_REASONING', label: 'AI Explanation & Proof', icon: <Bot className="w-3.5 h-3.5" /> },
                                  { key: 'CHAIN', label: `Historical Chain (${whyResult.historicalChain.length})`, icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                                  { key: 'CLASSIFICATION', label: 'FACT / INFERENCE Details', icon: <Info className="w-3.5 h-3.5" /> },
                                  { key: 'TIMELINE', label: 'Timeline', icon: <Clock className="w-3.5 h-3.5" /> },
                                ] as const
                              ).map((tab) => (
                                <button
                                  key={tab.key}
                                  onClick={() => setActiveTab(tab.key)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${activeTab === tab.key
                                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                                    }`}
                                >
                                  {tab.icon} {tab.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {whyLoading || isReasoning ? (
                          <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                            <span className="text-xs font-mono">{whyLoadingStep || 'Reconstructing historical evidence...'}</span>
                          </div>
                        ) : whyResult ? (
                          <div className="space-y-4">
                            {activeTab === 'AI_REASONING' && (
                              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-mono text-xs">
                                {/* Left Side: Summary and Chat Actions */}
                                <div className="lg:col-span-7 space-y-4">
                                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">AI Grounded Explanation</div>
                                    <div className="text-[11px] text-slate-300 font-sans leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                                      {aiResponse?.summary || whyResult.summary}
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => handleExecuteWhy(selectedNode || undefined)}
                                    className="w-full py-3 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/20 transition-all active:scale-95"
                                  >
                                    <Sparkles className="w-4 h-4" />
                                    <span>INVESTIGATE IN ENGITRACE AI ASSISTANT ↗</span>
                                  </button>
                                </div>

                                {/* Right Side: Evidence List & Proof cards */}
                                <div className="lg:col-span-5 space-y-3">
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">PROOF / EVIDENCE</div>
                                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                    {whyResult.facts.map((fact, idx) => (
                                      <div key={idx} className="p-2.5 rounded-xl bg-slate-950 border border-slate-900 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <Badge variant="emerald" className="text-[8px] py-0 px-1 font-bold">FACT</Badge>
                                          {fact.evidenceIds && fact.evidenceIds.length > 0 && (
                                            <button
                                              onClick={() => {
                                                const ev = whyResult.evidence.find(e => e.id === fact.evidenceIds[0]);
                                                if (ev) handleInspectEvidenceNode(ev);
                                              }}
                                              className="text-[9px] text-cyan-400 hover:underline cursor-pointer"
                                            >
                                              [SHOW ME]
                                            </button>
                                          )}
                                        </div>
                                        <div className="font-sans text-[11px] text-slate-400 leading-tight">{fact.statement}</div>
                                      </div>
                                    ))}
                                    {whyResult.inferences.map((inf, idx) => (
                                      <div key={idx} className="p-2.5 rounded-xl bg-slate-950 border border-slate-900 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <Badge variant="amber" className="text-[8px] py-0 px-1 font-bold">INFERENCE</Badge>
                                          {inf.evidenceIds && inf.evidenceIds.length > 0 && (
                                            <button
                                              onClick={() => {
                                                const ev = whyResult.evidence.find(e => e.id === inf.evidenceIds[0]);
                                                if (ev) handleInspectEvidenceNode(ev);
                                              }}
                                              className="text-[9px] text-cyan-400 hover:underline cursor-pointer"
                                            >
                                              [SHOW ME]
                                            </button>
                                          )}
                                        </div>
                                        <div className="font-sans text-[11px] text-slate-400 leading-tight">{inf.statement}</div>
                                      </div>
                                    ))}
                                    {whyResult.unknowns.map((unk, idx) => (
                                      <div key={idx} className="p-2.5 rounded-xl bg-slate-950 border border-slate-900 space-y-1">
                                        <Badge variant="rose" className="text-[8px] py-0 px-1 font-bold">UNKNOWN</Badge>
                                        <div className="font-sans text-[11px] text-slate-400 leading-tight">Undocumented {unk.area}: {unk.reason}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {activeTab === 'CHAIN' && (
                              <HistoricalChainVisualizer
                                chain={whyResult.historicalChain}
                                onSelectStep={(step) => setSelectedNode(step.node)}
                                onInspectEvidence={() => {
                                  if (whyResult.evidence.length > 0) setSelectedEvidenceModal(whyResult.evidence[0]);
                                }}
                              />
                            )}

                            {activeTab === 'CLASSIFICATION' && (
                              <ClassificationCards
                                facts={whyResult.facts}
                                inferences={whyResult.inferences}
                                unknowns={whyResult.unknowns}
                                onInspectEvidence={handleOpenEvidenceById}
                              />
                            )}

                            {activeTab === 'TIMELINE' && (
                              <HistoricalTimeline
                                chain={whyResult.historicalChain}
                                targetNode={whyResult.target}
                                onSelectEvent={(step) => {
                                  if ('node' in step && step.node) {
                                    setSelectedNode(step.node);
                                  }
                                }}
                              />
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {analysisMode === 'WHAT_IF' && (impactLoading || isImpactAiAnalyzing || impactResult) && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
                          <h2 className="text-sm font-bold text-rose-400 uppercase tracking-wider">
                            WHAT IF THIS IS REMOVED?
                          </h2>
                          {impactResult && (
                            <div className="flex gap-2">
                              <Badge variant="rose">Impact: {impactResult.impactLevel}</Badge>
                              <Badge variant="amber">Confidence: {Math.round(impactResult.confidence.score * 100)}%</Badge>
                            </div>
                          )}
                        </div>

                        {impactLoading || isImpactAiAnalyzing ? (
                          <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                            <RefreshCw className="w-6 h-6 animate-spin text-rose-400" />
                            <span className="text-xs font-mono">{impactLoadingStep || 'Tracing downstream impact...'}</span>
                          </div>
                        ) : impactResult ? (
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-mono text-xs">
                            {/* Left Side: Summary & Dependency Listings */}
                            <div className="lg:col-span-7 space-y-4">
                              {impactResult.warnings && impactResult.warnings.length > 0 && (
                                <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 text-rose-300 text-[11px] leading-snug">
                                  {impactResult.warnings.map((w, idx) => (
                                    <div key={idx} className="flex gap-2">
                                      <span>⚠</span>
                                      <span>{w}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Grounded Explanation</div>
                                <div className="text-[11px] text-slate-300 font-sans leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                                  {impactAiExplanation?.summary || impactResult.summary}
                                </div>
                              </div>

                              <button
                                onClick={() => handleExecuteWhatIf(selectedNode || undefined, 'REMOVE')}
                                className="w-full py-3 bg-gradient-to-r from-rose-500 to-purple-500 hover:from-rose-400 hover:to-purple-400 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-500/20 transition-all active:scale-95"
                              >
                                <Sparkles className="w-4 h-4" />
                                <span>ANALYZE IMPACT IN ENGITRACE AI ASSISTANT ↗</span>
                              </button>
                            </div>

                            {/* Right Side: Affected Downstream Components lists */}
                            <div className="lg:col-span-5 space-y-3">
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">AFFECTED DOWNSTREAM TOPOLOGY</div>
                              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                                {impactResult.directImpact.length > 0 && (
                                  <div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase">Direct Dependents:</div>
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {impactResult.directImpact.map((n) => (
                                        <button
                                          key={n.id}
                                          onClick={() => navigateToNode(n.id)}
                                          className="px-2 py-0.5 rounded bg-rose-950/20 border border-rose-900/30 text-[10px] text-rose-300 hover:bg-rose-950/40 transition cursor-pointer"
                                        >
                                          {n.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {impactResult.indirectImpact.length > 0 && (
                                  <div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase mt-1">Indirect Dependents:</div>
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {impactResult.indirectImpact.map((n) => (
                                        <button
                                          key={n.id}
                                          onClick={() => navigateToNode(n.id)}
                                          className="px-2 py-0.5 rounded bg-slate-950 border border-slate-900 text-[10px] text-slate-400 hover:bg-slate-900 transition cursor-pointer"
                                        >
                                          {n.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {impactResult.affectedTests.length > 0 && (
                                  <div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase mt-1">Impacted Test Suites:</div>
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {impactResult.affectedTests.map((n) => (
                                        <button
                                          key={n.id}
                                          onClick={() => navigateToNode(n.id)}
                                          className="px-2 py-0.5 rounded bg-indigo-950/20 border border-indigo-900/30 text-[10px] text-indigo-300 hover:bg-indigo-950/40 transition cursor-pointer"
                                        >
                                          {n.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {impactResult.affectedAPIs.length > 0 && (
                                  <div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase mt-1">Affected API Routes:</div>
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {impactResult.affectedAPIs.map((n) => (
                                        <button
                                          key={n.id}
                                          onClick={() => navigateToNode(n.id)}
                                          className="px-2 py-0.5 rounded bg-emerald-950/20 border border-emerald-900/30 text-[10px] text-emerald-300 hover:bg-emerald-950/40 transition cursor-pointer"
                                        >
                                          {n.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              ) : (
                /* ── EMPTY / INACTIVE STATE ── */
                <div className="py-8 text-center text-slate-500 text-xs font-mono flex items-center justify-center gap-2.5">
                  <Brain className="w-5 h-5 text-slate-600 animate-pulse" />
                  <span>Select a node on the graph and click <strong className="text-cyan-400">WHY?</strong> or <strong className="text-rose-400">WHAT IF?</strong> inside the details panel to begin engineering analysis.</span>
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      </main>

      {/* Evidence Inspector Modal */}
      <EvidenceInspectorModal
        evidence={selectedEvidenceModal}
        isOpen={Boolean(selectedEvidenceModal)}
        onClose={() => setSelectedEvidenceModal(null)}
      />
    </div>
  );
};
