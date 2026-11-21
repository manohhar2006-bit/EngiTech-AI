/**
 * DependencyExplorer — Integrated Dependency Intelligence Workspace for EngiTrace.
 *
 * Provides deep exploration of package dependencies directly within the Engineering Graph:
 *  1. Dependency Overview: Repository-derived metrics (node counts, relationships, distinct dependents).
 *  2. Search & Filters: Package name search, ecosystem filtering, multi-criteria sorting.
 *  3. Dependency List: Package registry identity, declared versions, dependents count, source manifests.
 *  4. Relationship Visualization: Deterministic SVG directed graph of dependency lineage with automatic
 *     bounds calculation, fit-to-content, zoom & pan controls, and File -> DEPENDS_ON -> Dependency direction.
 *  5. Dependency Investigation: Package details, direct/indirect connections, traceable evidence.
 *  6. What-If Impact Integration: On-demand impact analysis calculation via ImpactService with honest
 *     graph reachability presentation and clear initial/loading/results/error state separation.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GraphNode, GraphEdge, WhyGraphData, NodeType } from '../../types/graph';
import { ImpactService } from '../../services/impactService';
import { ImpactResult } from '../../types/impact';
import { Badge } from '../ui/Badge';
import {
  Package,
  Layers,
  FileCode,
  Search,
  X,
  ExternalLink,
  ShieldCheck,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Info,
  ArrowRight,
  Filter,
  ArrowDownAZ,
  ArrowUpAZ,
  RefreshCw,
  Maximize2,
  Box,
  Code,
  Users,
  Compass,
  CornerDownRight,
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DependencyExplorerProps {
  data?: WhyGraphData | null;
  selectedRepoId?: string | null;
  isDemoRepo?: boolean;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode | null) => void;
  onSelectEdge?: (edge: GraphEdge | null) => void;
  onAnalyzeImpact?: (node: GraphNode) => void;
  onInspectEvidence?: (evidenceId: string) => void;
  onSwitchToArchitecture?: () => void;
  searchQuery?: string;
  className?: string;
}

type SortOrder = 'NAME_ASC' | 'NAME_DESC' | 'MOST_DEPENDENTS' | 'LEAST_DEPENDENTS';

interface VisualDepNode {
  id: string;
  label: string;
  type: NodeType;
  sublabel?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isTarget: boolean;
  role: 'SELECTED_DEP' | 'DIRECT_FILE' | 'COMPONENT' | 'INDIRECT_FILE';
  originalNode: GraphNode;
}

interface VisualDepEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  classification?: string;
  confidence?: number;
  evidence?: string;
  sourceUrl?: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DependencyExplorer: React.FC<DependencyExplorerProps> = ({
  data,
  selectedRepoId,
  isDemoRepo = false,
  selectedNodeId,
  onSelectNode,
  onSelectEdge,
  onAnalyzeImpact,
  onInspectEvidence,
  onSwitchToArchitecture,
  searchQuery = '',
  className = '',
}) => {
  // Search, Filter & Selection state
  const [localSearch, setLocalSearch] = useState<string>('');
  const [selectedEcosystem, setSelectedEcosystem] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortOrder>('MOST_DEPENDENTS');
  const [selectedDepId, setSelectedDepId] = useState<string | null>(null);

  // What-If Impact analysis state for selected dependency
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [hasExecutedImpact, setHasExecutedImpact] = useState<boolean>(false);
  const [impactLoading, setImpactLoading] = useState<boolean>(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  // SVG hover states
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Graph Canvas Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Dependency-specific search query (localSearch has dedicated precedence; searchQuery acts as fallback)
  const activeSearch = (localSearch || searchQuery || '').trim();

  // Reset local selection & impact results when repository changes to prevent stale data
  useEffect(() => {
    setSelectedDepId(null);
    setLocalSearch('');
    setSelectedEcosystem('ALL');
    setImpactResult(null);
    setHasExecutedImpact(false);
    setImpactLoading(false);
    setImpactError(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [selectedRepoId]);

  // Sync with selectedNodeId if incoming node is a DEPENDENCY
  useEffect(() => {
    if (selectedNodeId && data?.nodes) {
      const match = data.nodes.find((n) => n.id === selectedNodeId && n.type === 'DEPENDENCY');
      if (match && match.id !== selectedDepId) {
        setSelectedDepId(match.id);
        setImpactResult(null);
        setHasExecutedImpact(false);
        setImpactLoading(false);
        setImpactError(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    }
  }, [selectedNodeId, data?.nodes, selectedDepId]);

  // Handle explicit selection of a dependency node
  const handleSelectDependency = (depId: string | null) => {
    if (depId !== selectedDepId) {
      setSelectedDepId(depId);
      // Reset impact state: do NOT show stale scores from previous package
      setImpactResult(null);
      setHasExecutedImpact(false);
      setImpactLoading(false);
      setImpactError(null);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      if (onSelectNode) {
        const depNode = depId ? dependencyNodes.find((d) => d.id === depId) || null : null;
        onSelectNode(depNode);
      }
    }
  };

  // ── 1. Extract Real Dependency Nodes & Edges from Graph Data ─────────────────

  const { dependencyNodes, dependencyEdges, dependentsByDepId, dependentEntities, directDepCount } = useMemo(() => {
    if (!data?.nodes || !Array.isArray(data.nodes)) {
      return {
        dependencyNodes: [],
        dependencyEdges: [],
        dependentsByDepId: new Map<string, { node: GraphNode; edge: GraphEdge }[]>(),
        dependentEntities: new Map<string, GraphNode>(),
        directDepCount: 0,
      };
    }

    // A. Actual Dependency Nodes
    const depNodes = data.nodes.filter((n) => n.type === 'DEPENDENCY');
    const depIdSet = new Set(depNodes.map((d) => d.id));
    const nodeMap = new Map<string, GraphNode>(data.nodes.map((n) => [n.id, n]));

    // B. Connected Edges & Dependents Mapping
    const depEdges: GraphEdge[] = [];
    const depMap = new Map<string, { node: GraphNode; edge: GraphEdge }[]>();
    const depEntities = new Map<string, GraphNode>();
    let manifestDeclaredCount = 0;

    depNodes.forEach((d) => depMap.set(d.id, []));

    if (Array.isArray(data.edges)) {
      data.edges.forEach((edge) => {
        // Standard graph convention: File / Manifest / Component --DEPENDS_ON--> Dependency
        if (depIdSet.has(edge.target)) {
          depEdges.push(edge);
          const sourceNode = nodeMap.get(edge.source);
          if (sourceNode) {
            depMap.get(edge.target)?.push({ node: sourceNode, edge });
            depEntities.set(sourceNode.id, sourceNode);
            const sourcePath = (sourceNode.metadata?.path as string) || sourceNode.label;
            if (
              sourcePath.endsWith('package.json') ||
              sourcePath.endsWith('requirements.txt') ||
              /requirements[-_.].+\.txt$/i.test(sourcePath) ||
              sourcePath.endsWith('pyproject.toml') ||
              sourcePath.endsWith('go.mod') ||
              sourcePath.endsWith('Cargo.toml') ||
              sourcePath.endsWith('pom.xml')
            ) {
              manifestDeclaredCount++;
            }
          }
        }
        // Inverted representation fallback if ingested inversely: Dependency --[relationship]--> Node
        else if (depIdSet.has(edge.source)) {
          depEdges.push(edge);
          const targetNode = nodeMap.get(edge.target);
          if (targetNode) {
            depMap.get(edge.source)?.push({ node: targetNode, edge });
            depEntities.set(targetNode.id, targetNode);
          }
        }
      });
    }

    return {
      dependencyNodes: depNodes,
      dependencyEdges: depEdges,
      dependentsByDepId: depMap,
      dependentEntities: depEntities,
      directDepCount: manifestDeclaredCount > 0 ? manifestDeclaredCount : depNodes.length,
    };
  }, [data?.nodes, data?.edges]);

  // ── 2. Derive Unique Ecosystems with Package Counts ─────────────────────────

  const ecosystems = useMemo(() => {
    const counts = new Map<string, number>();
    dependencyNodes.forEach((n) => {
      const eco = (n.metadata?.ecosystem as string) || '';
      if (eco) {
        const lower = eco.toLowerCase();
        counts.set(lower, (counts.get(lower) || 0) + 1);
      }
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [dependencyNodes]);

  // ── 3. Filtered & Sorted Dependency List ────────────────────────────────────

  const filteredDependencies = useMemo(() => {
    return dependencyNodes
      .filter((dep) => {
        const query = activeSearch.toLowerCase();
        const matchesSearch =
          !query ||
          dep.label.toLowerCase().includes(query) ||
          dep.id.toLowerCase().includes(query) ||
          (typeof dep.metadata?.description === 'string' &&
            dep.metadata.description.toLowerCase().includes(query));

        const depEco = ((dep.metadata?.ecosystem as string) || '').toLowerCase();
        const matchesEco =
          selectedEcosystem === 'ALL' ||
          depEco === selectedEcosystem.toLowerCase();

        return matchesSearch && matchesEco;
      })
      .sort((a, b) => {
        if (sortBy === 'NAME_ASC') return a.label.localeCompare(b.label);
        if (sortBy === 'NAME_DESC') return b.label.localeCompare(a.label);
        const aDeps = dependentsByDepId.get(a.id)?.length || 0;
        const bDeps = dependentsByDepId.get(b.id)?.length || 0;
        if (sortBy === 'MOST_DEPENDENTS') return bDeps - aDeps;
        if (sortBy === 'LEAST_DEPENDENTS') return aDeps - bDeps;
        return 0;
      });
  }, [dependencyNodes, activeSearch, selectedEcosystem, sortBy, dependentsByDepId]);

  // ── 4. Selected Dependency Object & Investigation Data ──────────────────────

  const selectedDependency = useMemo(() => {
    if (!selectedDepId) {
      return filteredDependencies.length > 0 ? filteredDependencies[0] : null;
    }
    return dependencyNodes.find((d) => d.id === selectedDepId) || null;
  }, [selectedDepId, filteredDependencies, dependencyNodes]);

  // Direct connected dependents for the selected package
  const selectedDependents = useMemo(() => {
    if (!selectedDependency) return [];
    return dependentsByDepId.get(selectedDependency.id) || [];
  }, [selectedDependency, dependentsByDepId]);

  // Indirect dependents: files that depend on the direct dependent files
  const indirectDependents = useMemo(() => {
    if (!selectedDependency || !data?.edges || !data?.nodes) return [];
    const directFileIds = new Set(selectedDependents.map((d) => d.node.id));
    const indirectMap = new Map<string, { node: GraphNode; edge: GraphEdge }>();
    const nodeMap = new Map<string, GraphNode>(data.nodes.map((n) => [n.id, n]));

    data.edges.forEach((edge) => {
      if (directFileIds.has(edge.target) && !directFileIds.has(edge.source) && edge.source !== selectedDependency.id) {
        const sourceNode = nodeMap.get(edge.source);
        if (sourceNode && sourceNode.type !== 'REPOSITORY') {
          indirectMap.set(sourceNode.id, { node: sourceNode, edge });
        }
      }
    });

    return Array.from(indirectMap.values());
  }, [selectedDependency, selectedDependents, data?.edges, data?.nodes]);

  // Commits modifying dependent files or manifest
  const relatedCommits = useMemo(() => {
    if (!selectedDependency || !data?.edges || !data?.nodes) return [];
    const connectedFileIds = new Set(selectedDependents.map((d) => d.node.id));
    const nodeMap = new Map<string, GraphNode>(data.nodes.map((n) => [n.id, n]));
    const commits: GraphNode[] = [];

    data.edges.forEach((edge) => {
      if (
        (edge.relationshipType === 'MODIFIED' || edge.relationshipType === 'CHANGED') &&
        connectedFileIds.has(edge.target)
      ) {
        const commitNode = nodeMap.get(edge.source);
        if (commitNode && commitNode.type === 'COMMIT' && !commits.some((c) => c.id === commitNode.id)) {
          commits.push(commitNode);
        }
      }
    });

    return commits.slice(0, 5);
  }, [selectedDependency, selectedDependents, data?.edges, data?.nodes]);

  // Check URL parameter for automated analysis trigger (e.g. from deep links or testing)
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedDependency && !hasExecutedImpact && !impactLoading) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('analyze') === 'true' || params.get('action') === 'analyze') {
        handleExecuteImpactAnalysis();
      }
    }
  }, [selectedDependency?.id, hasExecutedImpact, impactLoading]);

  const handleExecuteImpactAnalysis = async () => {
    if (!selectedDependency || impactLoading) return;
    const repoId = selectedRepoId || 'demo-repo';
    setImpactLoading(true);
    setImpactError(null);

    try {
      const res = await ImpactService.executeImpactQuery(repoId, selectedDependency.id, 'REMOVE');
      if (res) {
        setImpactResult(res);
        setHasExecutedImpact(true);
      } else {
        setImpactError('Impact analysis returned no reachability data.');
        setHasExecutedImpact(false);
      }
    } catch (err: any) {
      setImpactError(err?.message || 'Failed to compute dependency impact.');
      setHasExecutedImpact(false);
      setImpactResult(null);
    } finally {
      setImpactLoading(false);
    }
  };

  // ── 6. Deterministic Layout for Dependency Relationship Diagram ──────────────
  // Direction: File / Manifest (Source) ──DEPENDS_ON──► Dependency (Target)

  const visualGraph = useMemo(() => {
    if (!selectedDependency) {
      return { nodes: [], edges: [] };
    }

    const vNodes: VisualDepNode[] = [];
    const vEdges: VisualDepEdge[] = [];

    // Target Dependency Node dimensions
    const targetWidth = 200;
    const targetHeight = 52;

    // Dependent File/Component dimensions
    const depWidth = 180;
    const depHeight = 44;

    const count = selectedDependents.length;

    if (count === 0) {
      // Orphan dependency: Center in canvas
      vNodes.push({
        id: selectedDependency.id,
        label: selectedDependency.label,
        type: 'DEPENDENCY',
        sublabel:
          (selectedDependency.metadata?.version as string) ||
          selectedDependency.sublabel ||
          (selectedDependency.metadata?.ecosystem as string),
        x: 360,
        y: 130,
        width: targetWidth,
        height: targetHeight,
        isTarget: true,
        role: 'SELECTED_DEP',
        originalNode: selectedDependency,
      });
      return { nodes: vNodes, edges: vEdges };
    }

    // Geometry layout:
    // Left side: Dependent files/manifests (x = 160)
    // Right side: Target Dependency (x = 520)
    // Distance between inner edges: (520 - 100) - (160 + 90) = 420 - 250 = 170px.
    const depX = 160;
    const targetX = 520;

    // Vertical spacing calculation ensuring nodes never overlap
    const verticalGap = count === 1 ? 0 : Math.max(58, Math.min(80, 240 / (count - 1)));
    const totalHeight = Math.max(260, (count - 1) * verticalGap + 80);
    const startY = (totalHeight - (count - 1) * verticalGap) / 2;
    const targetY = totalHeight / 2;

    // Add target dependency node
    vNodes.push({
      id: selectedDependency.id,
      label: selectedDependency.label,
      type: 'DEPENDENCY',
      sublabel:
        (selectedDependency.metadata?.version as string) ||
        selectedDependency.sublabel ||
        (selectedDependency.metadata?.ecosystem as string),
      x: targetX,
      y: targetY,
      width: targetWidth,
      height: targetHeight,
      isTarget: true,
      role: 'SELECTED_DEP',
      originalNode: selectedDependency,
    });

    // Add dependent nodes and directional edges
    selectedDependents.forEach(({ node, edge }, idx) => {
      let x = depX;
      const y = count === 1 ? targetY : startY + idx * verticalGap;

      // Subtle curved stagger if more than 4 items for visual elegance
      if (count > 4) {
        const offset = Math.sin((idx / (count - 1)) * Math.PI) * 16;
        x = depX - offset;
      }

      const role = node.type === 'COMPONENT' ? 'COMPONENT' : 'DIRECT_FILE';

      vNodes.push({
        id: node.id,
        label: node.label,
        type: node.type,
        sublabel: (node.metadata?.path as string) || node.sublabel,
        x,
        y,
        width: depWidth,
        height: depHeight,
        isTarget: false,
        role,
        originalNode: node,
      });

      // Direction: File / Manifest (Source) -> Dependency (Target)
      const sourceX = x + depWidth / 2;
      const sourceY = y;
      const tX = targetX - targetWidth / 2;
      const tY = targetY;

      vEdges.push({
        id: edge.id,
        sourceId: node.id,
        targetId: selectedDependency.id,
        relationshipType: edge.relationshipType || 'DEPENDS_ON',
        classification: edge.classification || 'FACT',
        confidence: edge.confidence || 1.0,
        evidence: edge.evidence || `Direct dependency declared in ${node.label}`,
        sourceUrl: edge.sourceUrl,
        sourceX,
        sourceY,
        targetX: tX,
        targetY: tY,
      });
    });

    return { nodes: vNodes, edges: vEdges };
  }, [selectedDependency, selectedDependents]);

  // ── 7. Automatic Graph Bounds Calculation ────────────────────────────────────

  const bounds = useMemo(() => {
    if (visualGraph.nodes.length === 0) {
      return { minX: 0, maxX: 700, minY: 0, maxY: 260, width: 700, height: 260 };
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
      width: Math.max(100, maxX - minX + paddingX * 2),
      height: Math.max(100, maxY - minY + paddingY * 2),
    };
  }, [visualGraph.nodes]);

  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;

  // ── 8. Zoom & Pan Controls ──────────────────────────────────────────────────

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(2.5, Number((prev * 1.2).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.4, Number((prev / 1.2).toFixed(2))));
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFitToView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'svg' || target.id === 'dep-canvas-bg') {
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

  // ─────────────────────────────────────────────────────────────────────────
  // EMPTY STATE: No dependencies in repository
  // ─────────────────────────────────────────────────────────────────────────

  if (!dependencyNodes || dependencyNodes.length === 0) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center p-8 bg-[#05070C] font-mono text-slate-100 ${className}`}>
        <div className="max-w-md w-full p-8 rounded-2xl bg-slate-950/80 border border-slate-800 text-center space-y-4 shadow-2xl">
          <div className="inline-flex p-4 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Package className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-white tracking-wide">
              No dependency relationships found
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Dependencies will appear here when they are extracted and connected to the Engineering Memory Graph.
            </p>
          </div>
          {onSwitchToArchitecture && (
            <button
              onClick={onSwitchToArchitecture}
              className="mt-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-lg shadow-cyan-600/30 inline-flex items-center gap-2 cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Switch to Architecture View</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER DEPENDENCY EXPLORER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={`w-full h-full flex flex-col bg-[#05070C] font-mono text-slate-100 select-none overflow-hidden ${className}`}>

      {/* ── TOP: Dependency Overview Metrics Bar ────────────────────────────── */}
      <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Package className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Dependency Memory Graph
          </span>
          {isDemoRepo && (
            <Badge variant="purple" className="text-[9px] py-0 px-1.5">
              Demo Dataset
            </Badge>
          )}
        </div>

        {/* Real Repository Statistics derived from Graph */}
        <div className="flex items-center gap-2 text-[10px] font-mono flex-wrap">
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <span className="text-slate-400">Total Packages:</span>
            <span className="font-bold text-purple-300">{dependencyNodes.length}</span>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <span className="text-slate-400">Total Relationships:</span>
            <span className="font-bold text-cyan-300">{dependencyEdges.length}</span>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <span className="text-slate-400">Distinct Dependent Files:</span>
            <span className="font-bold text-emerald-300">{dependentEntities.size}</span>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <span className="text-slate-400">Direct Manifest Declarations:</span>
            <span className="font-bold text-slate-200">{directDepCount}</span>
          </div>
        </div>
      </div>

      {/* ── MAIN AREA: Left Searchable List & Right Visualization/Details ─────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80 overflow-hidden">

        {/* ── LEFT COLUMN: Search, Filters & Dependency List (4 cols) ────────── */}
        <div className="lg:col-span-4 flex flex-col min-h-0 bg-slate-950/40">

          {/* Search, Filter & Sort Controls */}
          <div className="p-3 bg-slate-900/60 border-b border-slate-800/60 space-y-2 flex-shrink-0">
            {/* Dependency-Specific Search Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider px-0.5">
                <span className="flex items-center gap-1 text-slate-300">
                  <Filter className="w-3 h-3 text-purple-400" />
                  Dependency Filter
                </span>
                <span>
                  {filteredDependencies.length} of {dependencyNodes.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
                <Search className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search dependencies by package name..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="bg-transparent border-none text-slate-200 focus:outline-none w-full text-xs font-mono placeholder:text-slate-500"
                />
                {localSearch && (
                  <button
                    onClick={() => setLocalSearch('')}
                    className="p-0.5 hover:text-white text-slate-500 cursor-pointer"
                    title="Clear dependency search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter and Sort row */}
            <div className="flex items-center justify-between gap-2 text-[10px]">
              {/* Ecosystem filter */}
              <div className="flex items-center gap-1">
                <select
                  value={selectedEcosystem}
                  onChange={(e) => setSelectedEcosystem(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 font-mono focus:outline-none focus:border-purple-500 text-[10px]"
                >
                  <option value="ALL">All Ecosystems ({dependencyNodes.length})</option>
                  {ecosystems.map(({ name, count }) => (
                    <option key={name} value={name}>
                      {name.toUpperCase()} ({count})
                    </option>
                  ))}
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
                  <option value="MOST_DEPENDENTS">Most Dependents</option>
                  <option value="LEAST_DEPENDENTS">Fewest Dependents</option>
                  <option value="NAME_ASC">Name (A → Z)</option>
                  <option value="NAME_DESC">Name (Z → A)</option>
                </select>
              </div>
            </div>

            {/* Active filter summary / Reset action */}
            {(localSearch || selectedEcosystem !== 'ALL') && (
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                <span>Filtering active</span>
                <button
                  onClick={() => {
                    setLocalSearch('');
                    setSelectedEcosystem('ALL');
                  }}
                  className="text-purple-400 hover:underline cursor-pointer"
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>

          {/* Scrollable Package List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
            {filteredDependencies.length > 0 ? (
              filteredDependencies.map((dep) => {
                const isSelected = selectedDependency?.id === dep.id;
                const depList = dependentsByDepId.get(dep.id) || [];
                const dependentsCount = depList.length;
                const version =
                  (dep.metadata?.version as string) ||
                  (dep.sublabel ? dep.sublabel.split(' ')[0] : null);
                const ecosystem = (dep.metadata?.ecosystem as string) || null;

                return (
                  <div
                    key={dep.id}
                    onClick={() => handleSelectDependency(dep.id)}
                    className={`p-2.5 rounded-xl cursor-pointer transition text-xs font-mono border relative group ${
                      isSelected
                        ? 'bg-purple-950/40 border-purple-500/50 text-white shadow-md shadow-purple-950/20'
                        : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    {/* Left Active Indicator */}
                    {isSelected && (
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-purple-400 rounded-r" />
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Package className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-purple-400' : 'text-slate-400'}`} />
                        <span className="font-bold truncate text-slate-100 group-hover:text-purple-300">
                          {dep.label}
                        </span>
                      </div>

                      {version && (
                        <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded flex-shrink-0">
                          {version}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2 text-[10px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        {ecosystem && (
                          <span className="uppercase text-[9px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-slate-400">
                            {ecosystem}
                          </span>
                        )}
                        <span className="truncate max-w-[140px] text-slate-500" title={dep.id}>
                          {dep.id}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 font-bold text-purple-400 bg-purple-950/20 px-1.5 py-0.5 rounded border border-purple-900/30">
                        <Users className="w-2.5 h-2.5" />
                        <span>{dependentsCount} {dependentsCount === 1 ? 'dependent' : 'dependents'}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs font-mono space-y-2.5">
                <Package className="w-8 h-8 mx-auto text-slate-600" />
                <p className="font-bold text-slate-300">No matching dependencies</p>
                <p className="text-[11px] text-slate-500 font-sans">
                  No packages matched &ldquo;{localSearch || selectedEcosystem}&rdquo;.
                </p>
                <button
                  onClick={() => {
                    setLocalSearch('');
                    setSelectedEcosystem('ALL');
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

        {/* ── RIGHT COLUMN: Selected Dependency Visualization & Details (8 cols) ── */}
        <div className="lg:col-span-8 flex flex-col min-h-0 bg-slate-950/80 p-4 overflow-y-auto custom-scrollbar space-y-4">
          {selectedDependency ? (
            <div className="space-y-4">

              {/* Package Header Card */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-purple-500/30 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-36 h-36 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Package className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                        DEPENDENCY
                      </span>
                      {selectedDependency.metadata?.ecosystem && (
                        <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {selectedDependency.metadata.ecosystem as string}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 truncate max-w-[240px]">
                        ID: {selectedDependency.id}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-white font-display break-all pt-0.5">
                      {selectedDependency.label}
                    </h3>

                    {(selectedDependency.metadata?.version || selectedDependency.sublabel) && (
                      <p className="text-xs text-cyan-300 font-mono">
                        Declared version: {(selectedDependency.metadata?.version as string) || selectedDependency.sublabel}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedDependency.sourceReference && (
                      <a
                        href={selectedDependency.sourceReference}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono transition flex items-center gap-1.5 border border-slate-700"
                        title="Open package source / registry"
                      >
                        <ExternalLink className="w-3 h-3 text-cyan-400" />
                        <span>Package Reference</span>
                      </a>
                    )}

                    <button
                      onClick={() => handleSelectDependency(null)}
                      className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                      title="Clear selection"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {selectedDependency.metadata?.description && (
                  <p className="mt-2.5 text-xs text-slate-300 font-sans leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    {selectedDependency.metadata.description as string}
                  </p>
                )}
              </div>

              {/* ── Directed SVG Dependency Relationship Visualization ────────── */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-lg">
                <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                      Directed Relationship Lineage Map
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>
                      {selectedDependents.length} incoming dependent {selectedDependents.length === 1 ? 'connection' : 'connections'}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-purple-300 font-mono">File → DEPENDS_ON → Dependency</span>
                  </div>
                </div>

                {/* SVG Canvas Container with Zoom & Pan Controls */}
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
                      {/* Arrowhead marker: Points INTO the Target Dependency */}
                      <marker
                        id="dep-arrow"
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
                        id="dep-arrow-cyan"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#22d3ee" />
                      </marker>

                      {/* Radial Glow Filters */}
                      <filter id="cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#22d3ee" floodOpacity="0.5" />
                      </filter>

                      <filter id="purple-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#c084fc" floodOpacity="0.5" />
                      </filter>
                    </defs>

                    {/* Canvas Background for Pan Dragging */}
                    <rect
                      id="dep-canvas-bg"
                      x={bounds.minX - 500}
                      y={bounds.minY - 500}
                      width={bounds.width + 1000}
                      height={bounds.height + 1000}
                      fill="#070A12"
                    />

                    {/* Transformed Content Group */}
                    <g transform={`translate(${centerX + pan.x}, ${centerY + pan.y}) scale(${zoom}) translate(${-centerX}, ${-centerY})`}>

                      {/* Directed Edge Lines: File/Manifest (Source) ──► Dependency (Target) */}
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
                              stroke={isHovered ? '#22d3ee' : '#a855f7'}
                              strokeWidth={isHovered ? 2.5 : 1.75}
                              strokeOpacity={isHovered ? 1 : 0.75}
                              markerEnd={isHovered ? 'url(#dep-arrow-cyan)' : 'url(#dep-arrow)'}
                              onMouseEnter={() => setHoveredEdgeId(edge.id)}
                              onMouseLeave={() => setHoveredEdgeId(null)}
                              onClick={() => {
                                if (onSelectEdge) {
                                  const realEdge = dependencyEdges.find((e) => e.id === edge.id);
                                  if (realEdge) onSelectEdge(realEdge);
                                }
                              }}
                              className="cursor-pointer"
                            />

                            {/* Relationship Badge on Line */}
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

                      {/* Visual Graph Nodes */}
                      {visualGraph.nodes.map((node) => {
                        const isHovered = hoveredNodeId === node.id;
                        const isSelectedTarget = node.isTarget;
                        const halfW = node.width / 2;
                        const halfH = node.height / 2;

                        return (
                          <g
                            key={node.id}
                            transform={`translate(${node.x}, ${node.y})`}
                            onMouseEnter={() => setHoveredNodeId(node.id)}
                            onMouseLeave={() => setHoveredNodeId(null)}
                            onClick={() => {
                              if (onSelectNode) onSelectNode(node.originalNode);
                              if (node.type === 'DEPENDENCY') handleSelectDependency(node.id);
                            }}
                            className="cursor-pointer"
                          >
                            <title>{node.label} {node.sublabel ? `(${node.sublabel})` : ''} - Click to inspect</title>
                            {isSelectedTarget ? (
                              /* Center/Right Selected Package Card (Cyan Glow) */
                              <g filter="url(#cyan-glow)">
                                <rect
                                  x={-halfW}
                                  y={-halfH}
                                  width={node.width}
                                  height={node.height}
                                  rx="10"
                                  fill="#090d16"
                                  stroke="#22d3ee"
                                  strokeWidth="2"
                                />
                                <circle cx={-halfW + 24} cy="0" r="14" fill="#22d3ee" fillOpacity="0.15" />
                                <text
                                  x={-halfW + 24}
                                  y="4"
                                  textAnchor="middle"
                                  fill="#22d3ee"
                                  fontSize="11"
                                  fontWeight="bold"
                                >
                                  📦
                                </text>
                                <text
                                  x={-halfW + 46}
                                  y="-3"
                                  fill="#ffffff"
                                  fontSize="12"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                >
                                  {node.label.length > 15 ? `${node.label.slice(0, 13)}…` : node.label}
                                </text>
                                <text
                                  x={-halfW + 46}
                                  y="12"
                                  fill="#67e8f9"
                                  fontSize="10"
                                  fontFamily="monospace"
                                >
                                  {node.sublabel
                                    ? node.sublabel.length > 18
                                      ? `${node.sublabel.slice(0, 16)}…`
                                      : node.sublabel
                                    : 'Target Dependency'}
                                </text>
                              </g>
                            ) : (
                              /* Left Dependent File / Component Card */
                              <g>
                                <rect
                                  x={-halfW}
                                  y={-halfH}
                                  width={node.width}
                                  height={node.height}
                                  rx="8"
                                  fill={node.type === 'COMPONENT' ? '#0e0d1d' : '#071510'}
                                  stroke={node.type === 'COMPONENT' ? '#818cf8' : '#10b981'}
                                  strokeWidth={isHovered ? 2.2 : 1.5}
                                  strokeOpacity={isHovered ? 1 : 0.85}
                                />
                                <circle
                                  cx={-halfW + 22}
                                  cy="0"
                                  r="12"
                                  fill={node.type === 'COMPONENT' ? '#818cf8' : '#10b981'}
                                  fillOpacity="0.15"
                                />
                                <text
                                  x={-halfW + 22}
                                  y="4"
                                  textAnchor="middle"
                                  fill={node.type === 'COMPONENT' ? '#818cf8' : '#10b981'}
                                  fontSize="10"
                                >
                                  {node.type === 'COMPONENT' ? '❖' : '📄'}
                                </text>
                                <text
                                  x={-halfW + 42}
                                  y="-3"
                                  fill="#f1f5f9"
                                  fontSize="11"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                >
                                  {node.label.length > 14 ? `${node.label.slice(0, 12)}…` : node.label}
                                </text>
                                <text
                                  x={-halfW + 42}
                                  y="11"
                                  fill={node.type === 'COMPONENT' ? '#a5b4fc' : '#6ee7b7'}
                                  fontSize="9"
                                  fontFamily="monospace"
                                >
                                  {node.sublabel
                                    ? node.sublabel.length > 18
                                      ? `${node.sublabel.slice(0, 16)}…`
                                      : node.sublabel
                                    : node.type}
                                </text>
                              </g>
                            )}
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

                  {/* SVG Tooltip on Hover */}
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

                {/* SVG Graph Footer Legend */}
                <div className="px-3 py-1.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span>Selected Package</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>Dependent File</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      <span>Component</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-0.5 bg-purple-400" />
                      <span>DEPENDS_ON Edge</span>
                    </span>
                  </div>
                  <span className="text-slate-500 text-[9px] font-mono">Drag canvas to pan • Scroll to zoom</span>
                </div>
              </div>

              {/* ── Investigation Breakdown: Direct Dependents & Evidence ──────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                {/* Direct Dependents List */}
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-xs">
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      Direct Dependents ({selectedDependents.length})
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {selectedDependents.length > 0 ? (
                      selectedDependents.map(({ node, edge }) => (
                        <div
                          key={edge.id}
                          onClick={() => onSelectNode && onSelectNode(node)}
                          className="p-2 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800/80 hover:border-emerald-500/30 cursor-pointer transition flex items-center justify-between gap-2 text-xs group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {node.type === 'COMPONENT' ? (
                              <Layers className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                            ) : (
                              <FileCode className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-200 group-hover:text-emerald-300 truncate">
                                {node.label}
                              </div>
                              {node.metadata?.path && (
                                <div className="text-[9px] text-slate-500 truncate">
                                  {node.metadata.path as string}
                                </div>
                              )}
                            </div>
                          </div>

                          <span className="text-[9px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 flex-shrink-0 font-mono">
                            {edge.classification || 'FACT'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-2 text-slate-500 text-[11px] italic">
                        No direct dependent files connected in graph.
                      </div>
                    )}
                  </div>
                </div>

                {/* Indirect Reachability & Related Commits */}
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-xs">
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <CornerDownRight className="w-3.5 h-3.5 text-cyan-400" />
                      Indirect Downstream ({indirectDependents.length})
                    </span>
                    {relatedCommits.length > 0 && (
                      <span className="text-[9px] text-slate-500 font-mono">
                        {relatedCommits.length} related commits
                      </span>
                    )}
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {indirectDependents.length > 0 ? (
                      indirectDependents.map(({ node, edge }) => (
                        <div
                          key={edge.id}
                          onClick={() => onSelectNode && onSelectNode(node)}
                          className="p-2 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800/80 hover:border-cyan-500/30 cursor-pointer transition flex items-center justify-between gap-2 text-xs group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                                {node.label}
                              </div>
                              <div className="text-[9px] text-slate-500 truncate">
                                Via {edge.target.split(':').pop()}
                              </div>
                            </div>
                          </div>
                          <span className="text-[9px] text-cyan-400 bg-cyan-950/20 px-1.5 py-0.5 rounded border border-cyan-900/30 font-mono">
                            Depth 2
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-2 text-slate-500 text-[11px] italic">
                        {selectedDependents.length > 0
                          ? 'No second-tier indirect dependents reached in graph topology.'
                          : 'Select a package to inspect downstream reachability.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── What-If Impact Analysis Integration Section ────────────────── */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-rose-500/30 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                          What-If Dependency Removal Impact
                        </h4>
                        {hasExecutedImpact && impactResult && (
                          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            ANALYSIS COMPLETE
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Evaluate the potential consequences of removing this dependency.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleExecuteImpactAnalysis}
                    disabled={impactLoading}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs transition shadow-md shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${impactLoading ? 'animate-spin' : ''}`} />
                    <span>
                      {impactLoading
                        ? 'ANALYZING IMPACT...'
                        : hasExecutedImpact
                        ? 'RE-ANALYZE IMPACT'
                        : 'ANALYZE DEPENDENCY IMPACT'}
                    </span>
                  </button>
                </div>

                {/* State A: Loading State */}
                {impactLoading ? (
                  <div className="py-5 text-center text-slate-400 flex flex-col items-center justify-center gap-2.5 text-xs font-mono bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
                    <span className="text-slate-200 font-bold">
                      Tracing dependency relationships and calculating potential downstream impact...
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Traversing Engineering Memory Graph for {selectedDependency.label}
                    </span>
                  </div>
                ) : hasExecutedImpact && impactResult ? (
                  /* State B: Results State — After Successful Genuine Analysis */
                  <div className="space-y-3">
                    {/* Score & Risk Classification Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
                        <div className="text-[9px] text-slate-400 uppercase font-mono">Impact Score</div>
                        <div className="text-lg font-bold text-white mt-0.5 font-display">
                          {impactResult.impactScore} <span className="text-[10px] text-slate-500 font-mono">/ 100</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
                        <div className="text-[9px] text-slate-400 uppercase font-mono">Risk Level</div>
                        <div
                          className={`text-base font-bold mt-0.5 font-display ${
                            impactResult.impactLevel === 'CRITICAL' || impactResult.impactLevel === 'HIGH'
                              ? 'text-rose-400'
                              : impactResult.impactLevel === 'MEDIUM'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {impactResult.impactLevel}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
                        <div className="text-[9px] text-slate-400 uppercase font-mono">Direct Files</div>
                        <div className="text-lg font-bold text-cyan-400 mt-0.5 font-display">
                          {impactResult.directImpact.length}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
                        <div className="text-[9px] text-slate-400 uppercase font-mono">Downstream Nodes</div>
                        <div className="text-lg font-bold text-purple-400 mt-0.5 font-display">
                          {impactResult.indirectImpact.length}
                        </div>
                      </div>
                    </div>

                    {/* Reachability Disclaimer */}
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-cyan-500/20 text-[11px] text-slate-300 font-sans leading-relaxed flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="text-slate-200 font-bold font-mono">Graph Reachability: </span>
                        {impactResult.summary ||
                          `Removing ${selectedDependency.label} potentially impacts ${impactResult.directImpact.length} direct files and ${impactResult.indirectImpact.length} downstream components.`}
                        <div className="text-[10px] text-slate-400 mt-1 italic">
                          Impact represents potential dependency reachability based on the available Engineering Memory Graph. It does not guarantee runtime failure.
                        </div>
                      </div>
                    </div>

                    {/* Action to launch full WhyGraph What-If Workspace */}
                    {onAnalyzeImpact && (
                      <button
                        onClick={() => onAnalyzeImpact(selectedDependency)}
                        className="w-full py-2 bg-gradient-to-r from-cyan-950/60 to-purple-950/60 hover:from-cyan-900/60 hover:to-purple-900/60 border border-cyan-800/60 rounded-xl text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-md"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                        <span>Open Deep AI What-If Investigation Workspace →</span>
                      </button>
                    )}
                  </div>
                ) : impactError ? (
                  /* State C: Error Handling State */
                  <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/60 text-rose-300 text-xs font-mono space-y-2">
                    <div className="flex items-center gap-2 font-bold text-rose-200">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>Impact Analysis Failed</span>
                    </div>
                    <p className="text-[11px] text-rose-300/90 leading-relaxed font-sans">{impactError}</p>
                    <button
                      onClick={handleExecuteImpactAnalysis}
                      className="px-3 py-1 rounded bg-rose-900/50 hover:bg-rose-800/50 border border-rose-700 text-rose-200 text-[10px] font-bold cursor-pointer transition inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Retry Analysis</span>
                    </button>
                  </div>
                ) : (
                  /* State D: Initial State — Before Analysis (No stale or mock scores) */
                  <div className="p-3.5 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs font-mono space-y-2">
                    <div className="flex items-center gap-2 text-slate-300 font-bold">
                      <Info className="w-3.5 h-3.5 text-amber-400" />
                      <span>Analysis Not Yet Executed</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                      Impact analysis has not been executed yet for this package. Click &ldquo;Analyze Dependency Impact&rdquo; above to calculate potential downstream reachability across files, components, and APIs in the Engineering Memory Graph.
                    </p>
                    <div className="text-[10px] text-slate-500 italic">
                      No impact score has been calculated yet for this dependency.
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
              <Box className="w-8 h-8 text-slate-600 animate-pulse" />
              <p className="text-xs">
                Select a package from the list on the left to inspect its dependency relationships and potential impact.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
