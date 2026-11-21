/**
 * DecisionRationaleExplorer — Architectural Decisions & Historical Rationale Intelligence
 *
 * Integrated into the Engineering Memory Graph workspace to connect architectural reasoning
 * with actual repository history:
 *
 *   Code (File) → Commit → Pull Request → Issue → Architectural Rationale → Affected Components
 *
 * Honest Data Model:
 *  - Distinguishes explicit DECISION nodes (formal ADRs) from historical rationale evidence.
 *  - Categorizes statements as FACT, INFERENCE, or UNKNOWN.
 *  - Provides interactive directed lineage graph (SVG with zoom, pan, and fit-to-view).
 *  - Integrates with the existing WHY Explorer for deep historical chain reconstruction.
 *  - Provides navigation shortcut to Decision Debt without merging detector logic.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GraphNode, GraphEdge, WhyGraphData, NodeType, EvidenceClassification } from '../../types/graph';
import { NormalizedEvidence } from '../../types/evidence';
import { WhyResult, AIReasoningResponse } from '../../types/why';
import { ApiService } from '../../services/apiService';
import { WhyService } from '../../services/whyService';
import { Badge } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';
import { HistoricalChainVisualizer } from './HistoricalChainVisualizer';
import { ClassificationCards } from '../evidence/ClassificationCards';
import { EvidenceInspectorModal } from '../evidence/EvidenceInspectorModal';
import { AIExplanationPanel } from '../evidence/AIExplanationPanel';
import {
  BrainCircuit,
  GitPullRequest,
  AlertCircle,
  GitCommit,
  FileCode,
  User,
  ShieldCheck,
  Zap,
  HelpCircle,
  Info,
  ExternalLink,
  Search,
  X,
  Filter,
  ArrowDownAZ,
  ArrowUpAZ,
  RefreshCw,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  ArrowRight,
  Clock,
  History,
  Calendar,
  Compass,
  FileText,
  Boxes,
  HelpCircle as QuestionIcon,
} from 'lucide-react';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DecisionRationaleExplorerProps {
  data?: WhyGraphData | null;
  selectedRepoId?: string | null;
  isDemoRepo?: boolean;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode | null) => void;
  onSelectEdge?: (edge: GraphEdge | null) => void;
  onInspectEvidence?: (evidenceId: string) => void;
  onTriggerWhy?: (node: GraphNode) => void;
  onNavigateToDecisionDebt?: () => void;
  onSwitchToArchitecture?: () => void;
  searchQuery?: string;
  className?: string;
}

export type RationaleKind = 'DECISION' | 'PULL_REQUEST' | 'ISSUE' | 'COMMIT' | 'EVIDENCE';
export type FilterKind = 'ALL' | 'DECISION' | 'PULL_REQUEST' | 'ISSUE' | 'COMMIT' | 'EVIDENCE';
export type SortOrder = 'CONNECTED' | 'DATE_DESC' | 'DATE_ASC' | 'TITLE_ASC';

export interface RationaleRecord {
  id: string;
  kind: RationaleKind;
  title: string;
  subtitle?: string;
  description?: string;
  author?: string;
  date?: string;
  identifier?: string;
  sourceUrl?: string;
  classification: EvidenceClassification;
  confidence?: number;
  node?: GraphNode;
  evidence?: NormalizedEvidence;
  connectedNodeIds: string[];
  connectedFiles: string[];
  isExplicitDecision: boolean;
}

interface VisualGraphNode {
  id: string;
  label: string;
  type: NodeType;
  sublabel?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isTarget: boolean;
  color: string;
  icon: string;
  originalNode?: GraphNode;
  record?: RationaleRecord;
}

interface VisualGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  classification: EvidenceClassification;
  confidence: number;
  evidence?: string;
  sourceUrl?: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DecisionRationaleExplorer: React.FC<DecisionRationaleExplorerProps> = ({
  data,
  selectedRepoId,
  isDemoRepo = false,
  selectedNodeId,
  onSelectNode,
  onSelectEdge,
  onInspectEvidence,
  onTriggerWhy,
  onNavigateToDecisionDebt,
  onSwitchToArchitecture,
  searchQuery = '',
  className = '',
}) => {
  // Search & Filter state
  const [localSearch, setLocalSearch] = useState<string>('');
  const [selectedKind, setSelectedKind] = useState<FilterKind>('ALL');
  const [selectedClassification, setSelectedClassification] = useState<'ALL' | EvidenceClassification>('ALL');
  const [sortBy, setSortBy] = useState<SortOrder>('CONNECTED');

  // Selected rationale record ID
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Evidence records loaded from backend evidence API
  const [evidenceRecords, setEvidenceRecords] = useState<NormalizedEvidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState<boolean>(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  // Evidence Inspector modal state
  const [inspectModalEvidence, setInspectModalEvidence] = useState<NormalizedEvidence | null>(null);

  // WHY Explorer Integration state
  const [whyResult, setWhyResult] = useState<WhyResult | null>(null);
  const [whyLoading, setWhyLoading] = useState<boolean>(false);
  const [whyError, setWhyError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<AIReasoningResponse | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'CONTEXT' | 'WHY_EXPLORER' | 'AI_REASONING'>('CONTEXT');

  // SVG Canvas Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const whyResultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (whyResult && whyResultRef.current) {
      whyResultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [whyResult]);

  // Active combined search
  const activeSearch = (localSearch || searchQuery || '').trim();

  // ── 1. Fetch Repository Evidence on Repo Change ──────────────────────────────

  useEffect(() => {
    setSelectedRecordId(null);
    setWhyResult(null);
    setWhyLoading(false);
    setWhyError(null);
    setAiResponse(null);
    setAiAnalyzing(false);
    setActiveTab('CONTEXT');
    setZoom(1);
    setPan({ x: 0, y: 0 });

    if (!selectedRepoId) {
      setEvidenceRecords([]);
      return;
    }

    setEvidenceLoading(true);
    setEvidenceError(null);

    ApiService.fetchEvidence(selectedRepoId)
      .then((records) => {
        setEvidenceRecords(records || []);
      })
      .catch((err) => {
        console.warn('[DecisionRationaleExplorer] Failed to fetch evidence records:', err);
        setEvidenceError(err?.message || 'Failed to load evidence records');
      })
      .finally(() => {
        setEvidenceLoading(false);
      });
  }, [selectedRepoId]);

  // ── 2. Synthesize Real Repository Graph Entities & Evidence Records ───────────

  const {
    records,
    explicitDecisions,
    historicalEvidence,
    nodeMap,
    edgeMap,
    connectedNodeMap,
  } = useMemo(() => {
    const rawNodes = data?.nodes || [];
    const rawEdges = data?.edges || [];

    const nMap = new Map<string, GraphNode>(rawNodes.map((n) => [n.id, n]));
    const eMap = new Map<string, GraphEdge[]>();
    const connMap = new Map<string, Set<string>>();

    // Build adjacency mappings
    rawNodes.forEach((n) => {
      eMap.set(n.id, []);
      connMap.set(n.id, new Set<string>());
    });

    rawEdges.forEach((edge) => {
      eMap.get(edge.source)?.push(edge);
      eMap.get(edge.target)?.push(edge);
      connMap.get(edge.source)?.add(edge.target);
      connMap.get(edge.target)?.add(edge.source);
    });

    const items: RationaleRecord[] = [];

    // A. Explicit Decision Nodes (if any structured DECISION nodes exist)
    const decisionNodes = rawNodes.filter((n) => n.type === 'DECISION');
    decisionNodes.forEach((node) => {
      const neighbors = Array.from(connMap.get(node.id) || []);
      const linkedFiles = neighbors
        .map((id) => nMap.get(id))
        .filter((n): n is GraphNode => n?.type === 'FILE')
        .map((n) => n.label);

      items.push({
        id: node.id,
        kind: 'DECISION',
        title: node.label,
        subtitle: (node.metadata?.status as string) || 'ACTIVE',
        description:
          (node.metadata?.description as string) ||
          node.sublabel ||
          'Formal Architectural Decision Record registered in memory graph.',
        author: (node.metadata?.author as string) || 'Architecture Team',
        date: (node.metadata?.date as string) || (node.metadata?.timestamp as string) || node.createdAt,
        identifier: node.id,
        sourceUrl: node.sourceReference,
        classification: 'FACT',
        confidence: 1.0,
        node,
        connectedNodeIds: neighbors,
        connectedFiles: linkedFiles,
        isExplicitDecision: true,
      });
    });

    // B. Pull Request Nodes (historical design rationale & merged proposals)
    const prNodes = rawNodes.filter((n) => n.type === 'PULL_REQUEST');
    prNodes.forEach((node) => {
      const neighbors = Array.from(connMap.get(node.id) || []);
      const linkedFiles = neighbors
        .map((id) => nMap.get(id))
        .filter((n): n is GraphNode => n?.type === 'FILE')
        .map((n) => n.label);

      const num = node.metadata?.number || node.id.split(':').pop();
      const body = (node.metadata?.description as string) || '';
      const isExplicitFix = /(fix|fixes|closes|resolves)/i.test(body) || /(fix|feat|refactor)/i.test(node.label);

      items.push({
        id: node.id,
        kind: 'PULL_REQUEST',
        title: node.sublabel || node.label,
        subtitle: `PR #${num} • ${node.metadata?.state || 'MERGED'}`,
        description: body || `Pull Request #${num} merged into repository baseline.`,
        author: (node.metadata?.author as string) || 'Contributor',
        date: (node.metadata?.date as string) || node.createdAt,
        identifier: `PR #${num}`,
        sourceUrl: node.sourceReference,
        classification: isExplicitFix ? 'FACT' : 'INFERENCE',
        confidence: isExplicitFix ? 0.95 : 0.85,
        node,
        connectedNodeIds: neighbors,
        connectedFiles: linkedFiles,
        isExplicitDecision: false,
      });
    });

    // C. Issue Nodes (problem statements, architectural motivations & requirements)
    const issueNodes = rawNodes.filter((n) => n.type === 'ISSUE');
    issueNodes.forEach((node) => {
      const neighbors = Array.from(connMap.get(node.id) || []);
      const linkedFiles = neighbors
        .map((id) => nMap.get(id))
        .filter((n): n is GraphNode => n?.type === 'FILE')
        .map((n) => n.label);

      const num = node.metadata?.number || node.id.split(':').pop();
      const body = (node.metadata?.description as string) || '';

      items.push({
        id: node.id,
        kind: 'ISSUE',
        title: node.sublabel || node.label,
        subtitle: `Issue #${num} • ${node.metadata?.state || 'OPEN'}`,
        description: body || `Issue #${num} engineering context & discussion.`,
        author: (node.metadata?.author as string) || 'Reporter',
        date: (node.metadata?.date as string) || node.createdAt,
        identifier: `Issue #${num}`,
        sourceUrl: node.sourceReference,
        classification: 'FACT',
        confidence: 0.95,
        node,
        connectedNodeIds: neighbors,
        connectedFiles: linkedFiles,
        isExplicitDecision: false,
      });
    });

    // D. Architectural / Rationale Commits (commits that reference issues, PRs, or resolve tickets)
    const commitNodes = rawNodes.filter((n) => n.type === 'COMMIT');
    commitNodes.forEach((node) => {
      const neighbors = Array.from(connMap.get(node.id) || []);
      const msg = (node.metadata?.description as string) || node.sublabel || node.label;
      const isRationaleRelated =
        /#\d+/.test(msg) ||
        /(refactor|architecture|design|adr|rfc|breaking|feat|fix)/i.test(msg) ||
        neighbors.some((id) => id.includes('issue') || id.includes('pull_request'));

      if (isRationaleRelated) {
        const hash = (node.metadata?.hash as string) || node.id.split(':').pop() || '';
        const shortHash = hash.substring(0, 7);
        const linkedFiles = neighbors
          .map((id) => nMap.get(id))
          .filter((n): n is GraphNode => n?.type === 'FILE')
          .map((n) => n.label);

        const isFactCommit = /#\d+/.test(msg) && /(fix|resolve|close)/i.test(msg);

        items.push({
          id: node.id,
          kind: 'COMMIT',
          title: msg.split('\n')[0],
          subtitle: `Commit #${shortHash}`,
          description: msg,
          author: (node.metadata?.author as string) || 'Committer',
          date: (node.metadata?.date as string) || node.createdAt,
          identifier: shortHash ? `Commit #${shortHash}` : node.label,
          sourceUrl: node.sourceReference,
          classification: isFactCommit ? 'FACT' : 'INFERENCE',
          confidence: isFactCommit ? 0.95 : 0.85,
          node,
          connectedNodeIds: neighbors,
          connectedFiles: linkedFiles,
          isExplicitDecision: false,
        });
      }
    });

    // E. Normalized Evidence Records from Evidence Pipeline
    evidenceRecords.forEach((ev) => {
      // Avoid duplicate listing if the evidence points to an existing PR/issue node already listed
      const targetNode = nMap.get(ev.target);
      const sourceNode = nMap.get(ev.source);

      items.push({
        id: `ev-${ev.id}`,
        kind: 'EVIDENCE',
        title: ev.title,
        subtitle: `${ev.relationshipType} • Evidence Record`,
        description: ev.description || `Historical evidence connecting ${ev.source} to ${ev.target}.`,
        author: 'Evidence Normalizer',
        date: ev.timestamp,
        identifier: ev.id,
        sourceUrl: ev.sourceUrl,
        classification: ev.classification,
        confidence: ev.confidence,
        evidence: ev,
        connectedNodeIds: [ev.source, ev.target].filter(Boolean),
        connectedFiles: [targetNode, sourceNode]
          .filter((n): n is GraphNode => n?.type === 'FILE')
          .map((n) => n.label),
        isExplicitDecision: false,
      });
    });

    const explicit = items.filter((i) => i.isExplicitDecision);
    const historical = items.filter((i) => !i.isExplicitDecision);

    return {
      records: items,
      explicitDecisions: explicit,
      historicalEvidence: historical,
      nodeMap: nMap,
      edgeMap: eMap,
      connectedNodeMap: connMap,
    };
  }, [data?.nodes, data?.edges, evidenceRecords]);

  // Sync selected record with incoming selectedNodeId if applicable
  useEffect(() => {
    if (selectedNodeId && records.length > 0) {
      const match = records.find(
        (r) => r.id === selectedNodeId || (r.node && r.node.id === selectedNodeId)
      );
      if (match && match.id !== selectedRecordId) {
        setSelectedRecordId(match.id);
      }
    }
  }, [selectedNodeId, records, selectedRecordId]);

  // ── 3. Filtered & Sorted Rationale Records ───────────────────────────────────

  const filteredRecords = useMemo(() => {
    const q = activeSearch.toLowerCase();

    return records
      .filter((rec) => {
        // Search text matching
        const matchesQuery =
          !q ||
          rec.title.toLowerCase().includes(q) ||
          (rec.description && rec.description.toLowerCase().includes(q)) ||
          (rec.author && rec.author.toLowerCase().includes(q)) ||
          (rec.identifier && rec.identifier.toLowerCase().includes(q)) ||
          rec.connectedFiles.some((f) => f.toLowerCase().includes(q));

        // Kind filter
        const matchesKind =
          selectedKind === 'ALL' ||
          (selectedKind === 'DECISION' && rec.isExplicitDecision) ||
          rec.kind === selectedKind;

        // Classification filter
        const matchesCls =
          selectedClassification === 'ALL' || rec.classification === selectedClassification;

        return matchesQuery && matchesKind && matchesCls;
      })
      .sort((a, b) => {
        if (sortBy === 'CONNECTED') {
          return b.connectedNodeIds.length - a.connectedNodeIds.length;
        }
        if (sortBy === 'TITLE_ASC') {
          return a.title.localeCompare(b.title);
        }
        if (sortBy === 'DATE_DESC') {
          return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
        }
        if (sortBy === 'DATE_ASC') {
          return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
        }
        return 0;
      });
  }, [records, activeSearch, selectedKind, selectedClassification, sortBy]);

  // ── 4. Selected Record Object ────────────────────────────────────────────────

  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) {
      return filteredRecords.length > 0 ? filteredRecords[0] : null;
    }
    return records.find((r) => r.id === selectedRecordId) || null;
  }, [selectedRecordId, filteredRecords, records]);

  // Fetch WHY analysis when requested for selected record
  const handleExecuteWhyAnalysis = async (targetNode?: GraphNode) => {
    const activeNode = targetNode || selectedRecord?.node;
    if (!activeNode || !selectedRepoId) return;

    setWhyLoading(true);
    setWhyError(null);
    setActiveTab('WHY_EXPLORER');

    try {
      const result = await WhyService.executeWhyQuery(selectedRepoId, activeNode.id);
      if (result) {
        setWhyResult(result);
      } else {
        setWhyError('WHY Explorer returned no historical chain for this entity.');
      }
    } catch (err: any) {
      setWhyError(err?.message || 'Failed to execute WHY query.');
    } finally {
      setWhyLoading(false);
    }
  };

  const handleExecuteAiReasoning = async () => {
    const activeNode = selectedRecord?.node || whyResult?.target;
    if (!activeNode || !selectedRepoId) return;

    setAiAnalyzing(true);
    setActiveTab('AI_REASONING');

    try {
      const res = await WhyService.executeAiReasoning(selectedRepoId, activeNode.id);
      setAiResponse(res);
    } catch (err: any) {
      console.warn('[DecisionRationaleExplorer] AI Reasoning error:', err);
    } finally {
      setAiAnalyzing(false);
    }
  };

  // ── 5. Directed Historical Decision Relationship Graph Layout ─────────────────
  // Layout Sequence: File/Component (Left) → Commit → PR / Focal Record → Issue / Author (Right)

  const visualGraph = useMemo(() => {
    if (!selectedRecord) {
      return { nodes: [], edges: [] };
    }

    const vNodes: VisualGraphNode[] = [];
    const vEdges: VisualGraphEdge[] = [];
    const visitedNodes = new Set<string>();

    const targetWidth = 190;
    const targetHeight = 50;
    const standardWidth = 170;
    const standardHeight = 44;

    // Center focal point
    const focalX = 420;
    const focalY = 140;

    // 1. Add Selected Central Focal Node
    vNodes.push({
      id: selectedRecord.id,
      label: selectedRecord.identifier || selectedRecord.title,
      type: (selectedRecord.node?.type || (selectedRecord.kind === 'DECISION' ? 'DECISION' : 'PULL_REQUEST')) as NodeType,
      sublabel: selectedRecord.title.length > 20 ? `${selectedRecord.title.slice(0, 18)}…` : selectedRecord.title,
      x: focalX,
      y: focalY,
      width: targetWidth,
      height: targetHeight,
      isTarget: true,
      color:
        selectedRecord.kind === 'DECISION'
          ? '#c084fc'
          : selectedRecord.kind === 'PULL_REQUEST'
          ? '#818cf8'
          : selectedRecord.kind === 'ISSUE'
          ? '#f59e0b'
          : '#22d3ee',
      icon:
        selectedRecord.kind === 'DECISION'
          ? '🧠'
          : selectedRecord.kind === 'PULL_REQUEST'
          ? '🔀'
          : selectedRecord.kind === 'ISSUE'
          ? '⚠️'
          : '📦',
      originalNode: selectedRecord.node,
      record: selectedRecord,
    });
    visitedNodes.add(selectedRecord.id);

    // 2. Partition Connected Nodes into Upstream (Files, Commits) and Downstream (Issues, Authors)
    const connectedIds = selectedRecord.connectedNodeIds;
    const upstreamIds: string[] = [];
    const downstreamIds: string[] = [];

    connectedIds.forEach((id) => {
      const n = nodeMap.get(id);
      if (!n || visitedNodes.has(id)) return;
      if (n.type === 'FILE' || n.type === 'COMPONENT') {
        upstreamIds.push(id);
      } else if (n.type === 'COMMIT') {
        upstreamIds.push(id);
      } else {
        downstreamIds.push(id);
      }
    });

    // Upstream Column (Left: x = 140)
    const upCount = Math.max(1, upstreamIds.length);
    const upSpacing = Math.max(54, Math.min(74, 240 / upCount));
    const upStartY = (280 - (upCount - 1) * upSpacing) / 2;

    upstreamIds.slice(0, 5).forEach((id, idx) => {
      const n = nodeMap.get(id);
      if (!n) return;
      visitedNodes.add(id);

      const y = upStartY + idx * upSpacing;
      const x = 140;

      vNodes.push({
        id: n.id,
        label: n.label,
        type: n.type,
        sublabel: (n.metadata?.path as string) || n.sublabel,
        x,
        y,
        width: standardWidth,
        height: standardHeight,
        isTarget: false,
        color: n.type === 'FILE' ? '#10b981' : '#22d3ee',
        icon: n.type === 'FILE' ? '📄' : '💾',
        originalNode: n,
      });

      // Directed edge: Upstream (File / Commit) ──► Selected Record
      vEdges.push({
        id: `vis-edge-up-${id}`,
        sourceId: id,
        targetId: selectedRecord.id,
        relationshipType: n.type === 'FILE' ? 'MODIFIED' : 'IMPLEMENTED',
        classification: 'FACT',
        confidence: 0.95,
        evidence: `Traceable connection linking ${n.label} with ${selectedRecord.identifier || selectedRecord.title}`,
        sourceUrl: n.sourceReference,
        sourceX: x + standardWidth / 2,
        sourceY: y,
        targetX: focalX - targetWidth / 2,
        targetY: focalY,
      });
    });

    // Downstream Column (Right: x = 700)
    const downCount = Math.max(1, downstreamIds.length);
    const downSpacing = Math.max(54, Math.min(74, 240 / downCount));
    const downStartY = (280 - (downCount - 1) * downSpacing) / 2;

    downDownIdsSlice: downstreamIds.slice(0, 5).forEach((id, idx) => {
      const n = nodeMap.get(id);
      if (!n) return;
      visitedNodes.add(id);

      const y = downStartY + idx * downSpacing;
      const x = 700;

      vNodes.push({
        id: n.id,
        label: n.label,
        type: n.type,
        sublabel: n.sublabel,
        x,
        y,
        width: standardWidth,
        height: standardHeight,
        isTarget: false,
        color: n.type === 'ISSUE' ? '#f59e0b' : '#38bdf8',
        icon: n.type === 'ISSUE' ? '⚠️' : '👤',
        originalNode: n,
      });

      // Directed edge: Selected Record ──► Downstream (Issue / Author)
      vEdges.push({
        id: `vis-edge-down-${id}`,
        sourceId: selectedRecord.id,
        targetId: id,
        relationshipType: n.type === 'ISSUE' ? 'RESOLVES' : 'AUTHORED_BY',
        classification: 'FACT',
        confidence: 0.95,
        evidence: `Verified link from ${selectedRecord.identifier || selectedRecord.title} to ${n.label}`,
        sourceUrl: n.sourceReference,
        sourceX: focalX + targetWidth / 2,
        sourceY: focalY,
        targetX: x - standardWidth / 2,
        targetY: y,
      });
    });

    return { nodes: vNodes, edges: vEdges };
  }, [selectedRecord, nodeMap]);

  // ── 6. Automatic Bounds Calculation ──────────────────────────────────────────

  const bounds = useMemo(() => {
    if (visualGraph.nodes.length === 0) {
      return { minX: 0, maxX: 840, minY: 0, maxY: 280, width: 840, height: 280 };
    }
    const minX = Math.min(...visualGraph.nodes.map((n) => n.x - n.width / 2));
    const maxX = Math.max(...visualGraph.nodes.map((n) => n.x + n.width / 2));
    const minY = Math.min(...visualGraph.nodes.map((n) => n.y - n.height / 2));
    const maxY = Math.max(...visualGraph.nodes.map((n) => n.y + n.height / 2));
    const paddingX = 40;
    const paddingY = 30;
    return {
      minX: minX - paddingX,
      maxX: maxX + paddingX,
      minY: minY - paddingY,
      maxY: maxY + paddingY,
      width: Math.max(200, maxX - minX + paddingX * 2),
      height: Math.max(160, maxY - minY + paddingY * 2),
    };
  }, [visualGraph.nodes]);

  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;

  // Zoom & Pan handlers
  const handleZoomIn = () => setZoom((prev) => Math.min(2.5, Number((prev * 1.2).toFixed(2))));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.4, Number((prev / 1.2).toFixed(2))));
  const handleResetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const handleFitToView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'svg' || target.id === 'decision-canvas-bg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(2.5, Math.max(0.4, Number((prev * factor).toFixed(2)))));
  };

  // Helper icons and badges
  const getKindBadge = (kind: RationaleKind) => {
    switch (kind) {
      case 'DECISION':
        return <Badge variant="purple" className="text-[9px]">DECISION ADR</Badge>;
      case 'PULL_REQUEST':
        return <Badge variant="cyan" className="text-[9px]">PULL REQUEST</Badge>;
      case 'ISSUE':
        return <Badge variant="amber" className="text-[9px]">ISSUE / MOTIVATION</Badge>;
      case 'COMMIT':
        return <Badge variant="blue" className="text-[9px]">COMMIT RATIONALE</Badge>;
      case 'EVIDENCE':
      default:
        return <Badge variant="emerald" className="text-[9px]">EVIDENCE RECORD</Badge>;
    }
  };

  const getClassificationBadge = (cls: EvidenceClassification) => {
    switch (cls) {
      case 'FACT':
        return (
          <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded flex items-center gap-1">
            <ShieldCheck className="w-2.5 h-2.5" /> FACT
          </span>
        );
      case 'INFERENCE':
        return (
          <span className="text-[9px] font-mono text-amber-400 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.5 rounded flex items-center gap-1">
            <Zap className="w-2.5 h-2.5" /> INFERENCE
          </span>
        );
      case 'UNKNOWN':
      default:
        return (
          <span className="text-[9px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1">
            <HelpCircle className="w-2.5 h-2.5" /> UNKNOWN
          </span>
        );
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={`w-full h-full flex flex-col bg-[#05070C] font-mono text-slate-100 select-none overflow-hidden ${className}`}>

      {/* ── TOP: Decision & Rationale Overview Bar ──────────────────────────── */}
      <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <BrainCircuit className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Architectural Rationale & Historical Evidence Memory
          </span>
          {isDemoRepo && (
            <Badge variant="purple" className="text-[9px] py-0 px-1.5">
              Demo Dataset
            </Badge>
          )}
        </div>

        {/* Real repository-derived metrics */}
        <div className="flex items-center gap-2 text-[10px] font-mono flex-wrap">
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <span className="text-slate-400">Explicit ADRs:</span>
            <span className={`font-bold ${explicitDecisions.length > 0 ? 'text-purple-300' : 'text-slate-500'}`}>
              {explicitDecisions.length}
            </span>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <span className="text-slate-400">Linked PRs:</span>
            <span className="font-bold text-cyan-300">
              {records.filter((r) => r.kind === 'PULL_REQUEST').length}
            </span>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <span className="text-slate-400">Linked Issues:</span>
            <span className="font-bold text-amber-300">
              {records.filter((r) => r.kind === 'ISSUE').length}
            </span>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <span className="text-slate-400">Verified Evidence:</span>
            <span className="font-bold text-emerald-300">
              {records.filter((r) => r.classification === 'FACT').length}
            </span>
          </div>
        </div>
      </div>

      {/* ── MAIN WORKSPACE: Left Record List & Right Investigation Canvas ───── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80 overflow-hidden">

        {/* ── LEFT COLUMN: Search, Filters & Rationale List (4 cols) ────────── */}
        <div className="lg:col-span-4 flex flex-col min-h-0 bg-slate-950/40">

          {/* Search, Filter & Sort Controls */}
          <div className="p-3 bg-slate-900/60 border-b border-slate-800/60 space-y-2 flex-shrink-0">
            {/* Search Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider px-0.5">
                <span className="flex items-center gap-1 text-slate-300">
                  <Filter className="w-3 h-3 text-purple-400" />
                  Rationale Records Filter
                </span>
                <span>
                  {filteredRecords.length} of {records.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
                <Search className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search decisions, PRs, issues, commits..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="bg-transparent border-none text-slate-200 focus:outline-none w-full text-xs font-mono placeholder:text-slate-500"
                />
                {localSearch && (
                  <button
                    onClick={() => setLocalSearch('')}
                    className="p-0.5 hover:text-white text-slate-500 cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter and Sort row */}
            <div className="flex items-center justify-between gap-2 text-[10px] flex-wrap">
              {/* Type Filter */}
              <div className="flex items-center gap-1">
                <select
                  value={selectedKind}
                  onChange={(e) => setSelectedKind(e.target.value as FilterKind)}
                  className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 font-mono focus:outline-none focus:border-purple-500 text-[10px]"
                >
                  <option value="ALL">All Records ({records.length})</option>
                  {explicitDecisions.length > 0 && (
                    <option value="DECISION">Explicit Decisions ({explicitDecisions.length})</option>
                  )}
                  <option value="PULL_REQUEST">Pull Requests ({records.filter((r) => r.kind === 'PULL_REQUEST').length})</option>
                  <option value="ISSUE">Issues ({records.filter((r) => r.kind === 'ISSUE').length})</option>
                  <option value="COMMIT">Commits ({records.filter((r) => r.kind === 'COMMIT').length})</option>
                  <option value="EVIDENCE">Evidence Records ({records.filter((r) => r.kind === 'EVIDENCE').length})</option>
                </select>
              </div>

              {/* Classification Filter */}
              <div className="flex items-center gap-1">
                <select
                  value={selectedClassification}
                  onChange={(e) => setSelectedClassification(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 font-mono focus:outline-none focus:border-purple-500 text-[10px]"
                >
                  <option value="ALL">All Classifications</option>
                  <option value="FACT">FACT Only</option>
                  <option value="INFERENCE">INFERENCE Only</option>
                  <option value="UNKNOWN">UNKNOWN Only</option>
                </select>
              </div>

              {/* Sort Order */}
              <div className="flex items-center gap-1">
                {sortBy.includes('ASC') ? (
                  <ArrowDownAZ className="w-3 h-3 text-slate-500" />
                ) : (
                  <ArrowUpAZ className="w-3 h-3 text-slate-500" />
                )}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOrder)}
                  className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 font-mono focus:outline-none focus:border-purple-500 text-[10px]"
                >
                  <option value="CONNECTED">Most Connected</option>
                  <option value="DATE_DESC">Newest First</option>
                  <option value="DATE_ASC">Oldest First</option>
                  <option value="TITLE_ASC">Title (A → Z)</option>
                </select>
              </div>
            </div>

            {/* Active filters badge / Reset action */}
            {(localSearch || selectedKind !== 'ALL' || selectedClassification !== 'ALL') && (
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                <span>Filter active</span>
                <button
                  onClick={() => {
                    setLocalSearch('');
                    setSelectedKind('ALL');
                    setSelectedClassification('ALL');
                  }}
                  className="text-purple-400 hover:underline cursor-pointer"
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>

          {/* Scrollable Records List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">

            {/* Honest Architectural Decision Banner (Part 5 Case B) */}
            {explicitDecisions.length === 0 && (
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono space-y-1.5">
                <div className="flex items-center gap-1.5 text-slate-200 font-bold">
                  <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span>No Explicit Architectural Decisions Found</span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                  This repository does not currently contain structured architectural decision records (ADRs) in its Engineering Memory Graph.
                </p>
                <div className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-800/60">
                  Showing available Historical Rationale Evidence below (PRs, issues, and commits).
                </div>
              </div>
            )}

            {/* List Header */}
            <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              <span className="flex items-center gap-1 text-purple-300">
                <History className="w-3 h-3 text-purple-400" />
                Historical Evidence & Rationale ({filteredRecords.length})
              </span>
            </div>

            {filteredRecords.length > 0 ? (
              filteredRecords.map((item) => {
                const isSelected = selectedRecord?.id === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedRecordId(item.id);
                      setWhyResult(null);
                      setWhyError(null);
                      setAiResponse(null);
                      setActiveTab('CONTEXT');
                      if (onSelectNode && item.node) {
                        onSelectNode(item.node);
                      }
                    }}
                    className={`p-2.5 rounded-xl cursor-pointer transition text-xs font-mono border relative group ${
                      isSelected
                        ? 'bg-purple-950/40 border-purple-500/50 text-white shadow-md shadow-purple-950/20'
                        : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    {/* Active Left Indicator */}
                    {isSelected && (
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-purple-400 rounded-r" />
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.kind === 'DECISION' ? (
                          <BrainCircuit className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                        ) : item.kind === 'PULL_REQUEST' ? (
                          <GitPullRequest className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        ) : item.kind === 'ISSUE' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        ) : (
                          <GitCommit className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        )}
                        <span className="font-bold truncate text-slate-100 group-hover:text-purple-300">
                          {item.title}
                        </span>
                      </div>

                      {getClassificationBadge(item.classification)}
                    </div>

                    {item.subtitle && (
                      <p className="text-[10px] text-slate-400 mt-1 truncate">
                        {item.subtitle}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-2 text-[10px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        {item.author && (
                          <span className="flex items-center gap-0.5 truncate max-w-[110px]">
                            <User className="w-2.5 h-2.5" />
                            {item.author}
                          </span>
                        )}
                        {item.date && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(item.date).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-purple-300 font-bold bg-purple-950/20 px-1.5 py-0.5 rounded border border-purple-900/30">
                        <Boxes className="w-2.5 h-2.5" />
                        <span>{item.connectedNodeIds.length} connected</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs font-mono space-y-2.5">
                <BrainCircuit className="w-8 h-8 mx-auto text-slate-600" />
                <p className="font-bold text-slate-300">No Historical Rationale Evidence Available</p>
                <p className="text-[11px] text-slate-500 font-sans">
                  No records matched &ldquo;{activeSearch || selectedKind}&rdquo; in this repository.
                </p>
                <button
                  onClick={() => {
                    setLocalSearch('');
                    setSelectedKind('ALL');
                    setSelectedClassification('ALL');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/60 border border-purple-800 text-purple-300 text-[11px] font-mono cursor-pointer transition inline-flex items-center gap-1.5 mt-1"
                >
                  <X className="w-3 h-3" />
                  <span>Clear Search & Filters</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Selected Rationale Details & Investigation Panel ── */}
        <div className="lg:col-span-8 flex flex-col min-h-0 bg-slate-950/80 p-4 overflow-y-auto custom-scrollbar space-y-4">
          {selectedRecord ? (
            <div className="space-y-4">

              {/* Selected Record Header Card */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-purple-500/30 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-44 h-44 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getKindBadge(selectedRecord.kind)}
                      {getClassificationBadge(selectedRecord.classification)}
                      {selectedRecord.identifier && (
                        <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {selectedRecord.identifier}
                        </span>
                      )}
                      {selectedRecord.date && (
                        <span className="text-[10px] text-slate-500">
                          {new Date(selectedRecord.date).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-white font-display break-all pt-0.5">
                      {selectedRecord.title}
                    </h3>

                    {selectedRecord.author && (
                      <p className="text-xs text-purple-300 font-mono flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Authored / Created by {selectedRecord.author}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedRecord.sourceUrl && (
                      <a
                        href={selectedRecord.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                        title="Open original GitHub source"
                      >
                        <ExternalLink className="w-3 h-3 text-cyan-400" />
                        <span>Source Link</span>
                      </a>
                    )}

                    <button
                      onClick={() => setSelectedRecordId(null)}
                      className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                      title="Clear selection"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Description & Motivation text */}
                <div className="mt-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Recorded Motivation & Architectural Rationale:
                  </div>
                  <p className="text-xs text-slate-200 font-sans leading-relaxed whitespace-pre-wrap">
                    {selectedRecord.description || 'No written rationale recorded in repository metadata.'}
                  </p>
                  {!selectedRecord.description && (
                    <div className="text-[10px] text-amber-400/90 italic flex items-center gap-1 pt-1">
                      <HelpCircle className="w-3 h-3 flex-shrink-0" />
                      <span>Rationale was not explicitly documented in the commit message or PR description (Rationale: UNKNOWN).</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Directed SVG Historical Relationship Canvas ───────────────── */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-lg">
                <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                      Historical Decision & Evidence Lineage Graph
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>
                      {selectedRecord.connectedNodeIds.length} connected entities
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-purple-300 font-mono">Code → Commit → PR → Issue</span>
                  </div>
                </div>

                {/* SVG Canvas with Zoom & Pan */}
                <div className="relative bg-[#070A12] h-[260px] overflow-hidden">
                  <svg
                    ref={svgRef}
                    viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
                    preserveAspectRatio="xMidYMid meet"
                    className={`w-full h-full select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                  >
                    <defs>
                      <marker
                        id="dec-arrow"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#c084fc" />
                      </marker>

                      <marker
                        id="dec-arrow-cyan"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#22d3ee" />
                      </marker>

                      <filter id="focal-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#c084fc" floodOpacity="0.5" />
                      </filter>
                    </defs>

                    <rect
                      id="decision-canvas-bg"
                      x={bounds.minX - 500}
                      y={bounds.minY - 500}
                      width={bounds.width + 1000}
                      height={bounds.height + 1000}
                      fill="#070A12"
                    />

                    {/* Content Group with Zoom/Pan */}
                    <g transform={`translate(${centerX + pan.x}, ${centerY + pan.y}) scale(${zoom}) translate(${-centerX}, ${-centerY})`}>

                      {/* Edges */}
                      {visualGraph.edges.map((edge) => {
                        const isHovered = hoveredEdgeId === edge.id;
                        const isStraight = edge.sourceY === edge.targetY;
                        const dx = (edge.targetX - edge.sourceX) * 0.45;
                        const pathD = isStraight
                          ? `M ${edge.sourceX} ${edge.sourceY} L ${edge.targetX} ${edge.targetY}`
                          : `M ${edge.sourceX} ${edge.sourceY} C ${edge.sourceX + dx} ${edge.sourceY}, ${edge.targetX - dx} ${edge.targetY}, ${edge.targetX} ${edge.targetY}`;
                        const midX = (edge.sourceX + edge.targetX) / 2;
                        const midY = (edge.sourceY + edge.targetY) / 2;

                        return (
                          <g key={edge.id} className="transition-colors duration-200">
                            <path
                              d={pathD}
                              fill="none"
                              stroke={isHovered ? '#22d3ee' : '#c084fc'}
                              strokeWidth={isHovered ? 2.5 : 1.75}
                              strokeOpacity={isHovered ? 1 : 0.75}
                              markerEnd={isHovered ? 'url(#dec-arrow-cyan)' : 'url(#dec-arrow)'}
                              onMouseEnter={() => setHoveredEdgeId(edge.id)}
                              onMouseLeave={() => setHoveredEdgeId(null)}
                              onClick={() => {
                                if (onSelectEdge) {
                                  const real = data?.edges.find((e) => e.id === edge.id);
                                  if (real) onSelectEdge(real);
                                }
                              }}
                              className="cursor-pointer"
                            />

                            {/* Relationship Badge */}
                            <g
                              transform={`translate(${midX}, ${midY})`}
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredEdgeId(edge.id)}
                              onMouseLeave={() => setHoveredEdgeId(null)}
                              onClick={() => {
                                if (edge.sourceUrl && onInspectEvidence) {
                                  onInspectEvidence(edge.id);
                                }
                              }}
                            >
                              <rect
                                x="-36"
                                y="-9"
                                width="72"
                                height="18"
                                rx="4"
                                fill="#090d16"
                                stroke={isHovered ? '#22d3ee' : '#7c3aed'}
                                strokeWidth="1"
                              />
                              <text
                                textAnchor="middle"
                                y="3.5"
                                fill={isHovered ? '#22d3ee' : '#d8b4fe'}
                                fontSize="8"
                                fontFamily="monospace"
                                fontWeight="bold"
                              >
                                {edge.relationshipType}
                              </text>
                            </g>
                          </g>
                        );
                      })}

                      {/* Nodes */}
                      {visualGraph.nodes.map((node) => {
                        const isHovered = hoveredNodeId === node.id;
                        const isFocal = node.isTarget;
                        const halfW = node.width / 2;
                        const halfH = node.height / 2;

                        return (
                          <g
                            key={node.id}
                            transform={`translate(${node.x}, ${node.y})`}
                            onMouseEnter={() => setHoveredNodeId(node.id)}
                            onMouseLeave={() => setHoveredNodeId(null)}
                            onClick={() => {
                              if (node.record) {
                                setSelectedRecordId(node.record.id);
                              } else if (node.originalNode) {
                                const matchedRec = records.find((r) => r.id === node.id || (r.node && r.node.id === node.id));
                                if (matchedRec) {
                                  setSelectedRecordId(matchedRec.id);
                                }
                                if (onSelectNode) onSelectNode(node.originalNode);
                              }
                            }}
                            className="cursor-pointer"
                          >
                            <title>{node.label} {node.sublabel ? `(${node.sublabel})` : ''} - Click to inspect</title>
                            <g filter={isFocal ? 'url(#focal-glow)' : undefined}>
                              <rect
                                x={-halfW}
                                y={-halfH}
                                width={node.width}
                                height={node.height}
                                rx="8"
                                fill="#090d16"
                                stroke={isFocal ? node.color : isHovered ? '#22d3ee' : node.color}
                                strokeWidth={isFocal ? 2 : isHovered ? 2 : 1.25}
                                strokeOpacity={isFocal ? 1 : 0.85}
                              />
                              {/* Left icon badge */}
                              <circle
                                cx={-halfW + 20}
                                cy="0"
                                r="12"
                                fill={node.color}
                                fillOpacity="0.15"
                              />
                              <text
                                x={-halfW + 20}
                                y="4"
                                textAnchor="middle"
                                fill={node.color}
                                fontSize="10"
                              >
                                {node.icon}
                              </text>
                              {/* Node Label */}
                              <text
                                x={-halfW + 38}
                                y="-3"
                                fill="#f8fafc"
                                fontSize="11"
                                fontWeight="bold"
                                fontFamily="monospace"
                              >
                                {node.label.length > 15 ? `${node.label.slice(0, 13)}…` : node.label}
                              </text>
                              {/* Node Sublabel */}
                              <text
                                x={-halfW + 38}
                                y="11"
                                fill={node.color}
                                fontSize="9"
                                fontFamily="monospace"
                              >
                                {node.sublabel ? (node.sublabel.length > 18 ? `${node.sublabel.slice(0, 16)}…` : node.sublabel) : node.type}
                              </text>
                            </g>
                          </g>
                        );
                      })}
                    </g>
                  </svg>

                  {/* Compact Graph Controls (Working Zoom / Fit / Reset) */}
                  <div className="absolute bottom-3 right-3 bg-slate-950/90 backdrop-blur border border-slate-800 rounded-lg p-1 flex items-center gap-1 shadow-xl z-10 text-xs font-mono">
                    <button
                      onClick={handleZoomIn}
                      className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-300 transition cursor-pointer"
                      title="Zoom In (+)"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] text-slate-400 px-1 select-none min-w-[34px] text-center font-mono">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      onClick={handleZoomOut}
                      className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-300 transition cursor-pointer"
                      title="Zoom Out (-)"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-[1px] h-3 bg-slate-800 my-auto" />
                    <button
                      onClick={handleFitToView}
                      className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-300 transition cursor-pointer"
                      title="Fit to Content"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleResetView}
                      className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-300 transition cursor-pointer"
                      title="Reset View (100%)"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Hover tooltip */}
                  {hoveredEdgeId && (
                    <div className="absolute top-2 left-2 bg-slate-950/95 border border-purple-500/40 p-2 rounded-lg text-[10px] text-slate-300 pointer-events-none max-w-xs shadow-xl z-20">
                      <div className="font-bold text-purple-300 font-mono">
                        Evidence Statement:
                      </div>
                      <div className="text-slate-400 leading-tight mt-0.5 font-sans">
                        {visualGraph.edges.find((e) => e.id === hoveredEdgeId)?.evidence}
                      </div>
                    </div>
                  )}
                </div>

                {/* Graph Footer Legend */}
                <div className="px-3 py-1.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-400" />
                      <span>Decision Node</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      <span>Pull Request</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>Issue / Motivation</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span>Commit</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>Modified File</span>
                    </span>
                  </div>
                  <span className="text-slate-500 text-[9px] font-mono">Drag canvas to pan • Scroll to zoom</span>
                </div>
              </div>

              {/* ── Investigation Breakdown: Connected Files & Entities ─────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                {/* Affected Files */}
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-xs">
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      Affected Components / Files ({selectedRecord.connectedFiles.length})
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {selectedRecord.connectedFiles.length > 0 ? (
                      selectedRecord.connectedFiles.map((fileName, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            const fileNode = Array.from(nodeMap.values()).find((n) => n.label === fileName && n.type === 'FILE');
                            if (fileNode && onSelectNode) onSelectNode(fileNode);
                          }}
                          className="p-2 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800/80 hover:border-emerald-500/30 cursor-pointer transition flex items-center justify-between gap-2 text-xs group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileCode className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            <span className="font-bold text-slate-200 group-hover:text-emerald-300 truncate">
                              {fileName}
                            </span>
                          </div>
                          <span className="text-[9px] text-emerald-400 bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-900/30">
                            MODIFIED
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-2 text-slate-500 text-[11px] italic">
                        No direct file changes mapped to this record.
                      </div>
                    )}
                  </div>
                </div>

                {/* Connected PRs / Issues / Commits */}
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-xs">
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      Connected Historical Nodes ({selectedRecord.connectedNodeIds.length})
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {selectedRecord.connectedNodeIds.length > 0 ? (
                      selectedRecord.connectedNodeIds.map((nodeId, idx) => {
                        const n = nodeMap.get(nodeId);
                        if (!n) return null;

                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              const matched = records.find((r) => r.id === n.id || (r.node && r.node.id === n.id));
                              if (matched) setSelectedRecordId(matched.id);
                              if (onSelectNode) onSelectNode(n);
                            }}
                            className="p-2 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800/80 hover:border-purple-500/30 cursor-pointer transition flex items-center justify-between gap-2 text-xs group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-slate-200 group-hover:text-purple-300 truncate">
                                  {n.label}
                                </div>
                                <div className="text-[9px] text-slate-500 truncate">
                                  {n.type}
                                </div>
                              </div>
                            </div>

                            <span className="text-[9px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                              {n.type}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-2 text-slate-500 text-[11px] italic">
                        No connected graph nodes mapped.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Evidence Classification & WHY Explorer Actions ───────────── */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-indigo-500/30 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                        Evidence-Grounded Rationale Verification
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        Classified using EngiTrace Deterministic Verification Engine (FACT • INFERENCE • UNKNOWN)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {onNavigateToDecisionDebt && (
                      <button
                        onClick={onNavigateToDecisionDebt}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition flex items-center gap-1 border border-slate-700 cursor-pointer"
                        title="View Decision Debt Assessment"
                      >
                        <Compass className="w-3 h-3 text-amber-400" />
                        <span>Inspect Decision Debt →</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleExecuteWhyAnalysis()}
                      disabled={whyLoading}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs transition shadow-md shadow-purple-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className={`w-3 h-3 ${whyLoading ? 'animate-spin' : ''}`} />
                      <span>{whyLoading ? 'RECONSTRUCTING WHY...' : 'INVESTIGATE WITH WHY EXPLORER'}</span>
                    </button>
                  </div>
                </div>

                {/* Evidence Classification Definitions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-mono">
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-emerald-500/20 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>FACT</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans leading-tight">
                      Directly supported by repository commits, PR merge records, and verified tickets.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-amber-500/20 space-y-1">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                      <Zap className="w-3.5 h-3.5" />
                      <span>INFERENCE</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans leading-tight">
                      Plausible conclusion derived from co-evolution, referenced tickets, and descriptions.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-700/40 space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-400 font-bold">
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>UNKNOWN</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans leading-tight">
                      Insufficient repository evidence to establish the original trade-off reasoning.
                    </p>
                  </div>
                </div>

                {/* Inline Reconstructed WHY Explorer Results */}
                {whyLoading ? (
                  <div className="py-4 text-center text-slate-400 flex flex-col items-center justify-center gap-2 text-xs font-mono">
                    <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
                    <span>Reconstructing historical chain and retrieving verified statements...</span>
                  </div>
                ) : whyResult ? (
                  <div ref={whyResultRef} className="space-y-3 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-white uppercase">
                          Reconstructed WHY Analysis Result
                        </span>
                      </div>
                      <button
                        onClick={handleExecuteAiReasoning}
                        disabled={aiAnalyzing}
                        className="px-2.5 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-700 text-indigo-300 text-[10px] font-mono cursor-pointer flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-cyan-300" />
                        <span>{aiAnalyzing ? 'Synthesizing AI claims...' : 'Generate Grounded AI Explanation'}</span>
                      </button>
                    </div>

                    {/* Historical Chain Visualizer */}
                    {whyResult.historicalChain && whyResult.historicalChain.length > 0 && (
                      <HistoricalChainVisualizer
                        chain={whyResult.historicalChain}
                        onSelectStep={(step) => {
                          if (step.node && onSelectNode) onSelectNode(step.node);
                        }}
                      />
                    )}

                    {/* Statement Classification Cards */}
                    <ClassificationCards
                      facts={whyResult.facts}
                      inferences={whyResult.inferences}
                      unknowns={whyResult.unknowns}
                    />

                    {/* AI Grounded Explanation Panel (if requested) */}
                    {aiResponse && (
                      <AIExplanationPanel
                        aiResponse={aiResponse}
                        isAnalyzing={aiAnalyzing}
                        onOpenEvidence={(evId) => onInspectEvidence && onInspectEvidence(evId)}
                      />
                    )}
                  </div>
                ) : whyError ? (
                  <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-900 text-rose-300 text-xs">
                    {whyError}
                  </div>
                ) : null}
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
              <BrainCircuit className="w-8 h-8 text-slate-600 animate-pulse" />
              <p className="text-xs">
                Select an architectural decision or historical rationale record from the list on the left to inspect its engineering context and evidence graph.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Evidence Inspector Modal */}
      {inspectModalEvidence && (
        <EvidenceInspectorModal
          evidence={inspectModalEvidence}
          isOpen={Boolean(inspectModalEvidence)}
          onClose={() => setInspectModalEvidence(null)}
        />
      )}
    </div>
  );
};
