import React, {
  useRef,
  useState,
  useCallback,
  useMemo,
  useEffect,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { GraphNode, WhyGraphData } from '../../types/graph';

// ─── Constants & Design Tokens ────────────────────────────────────────────────

const NODE_R = 6;
const MERGE_R = 7;
const LANE_WIDTH = 28;         // px between branch lanes horizontally
const ROW_HEIGHT = 48;         // px between commit rows vertically
const MARGIN_TOP = 48;         // top margin for header row
const MARGIN_LEFT = 110;       // left margin for Date column

// Professional dark engineering branch color palette
const BRANCH_PALETTE = [
  '#22d3ee', // Cyan    (Main / Primary branch)
  '#a855f7', // Purple  (Feature 1)
  '#10b981', // Emerald (Feature 2)
  '#ec4899', // Pink    (Feature 3)
  '#3b82f6', // Blue    (Feature 4)
  '#f59e0b', // Amber   (Feature 5)
  '#14b8a6', // Teal    (Feature 6)
  '#8b5cf6', // Indigo  (Feature 7)
];

const MERGE_COLOR = '#f97316'; // Vibrant Orange for Merge commits & merge connectors

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LayoutCommit {
  node: GraphNode;
  row: number;
  lane: number;
  x: number;
  y: number;
  isMerge: boolean;
  parents: string[];   // Parent commit IDs present in current dataset
  children: string[];  // Child commit IDs present in current dataset
  shortHash: string;
  message: string;
  author: string;
  dateStr: string;
}

export interface LayoutEdge {
  id: string;
  fromId: string;
  toId: string;
  d: string;
  color: string;
  isMergeEdge: boolean;
  lane: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  commit: LayoutCommit | null;
}

interface GitHistoryGraphProps {
  data?: WhyGraphData | null;
  onSelectNode?: (node: GraphNode | null) => void;
  selectedNodeId?: string | null;
  highlightedNodeIds?: string[];
  // WHAT-IF props
  targetNodeId?: string | null;
  directImpactNodeIds?: string[];
  indirectImpactNodeIds?: string[];
  isImpactMode?: boolean;
  searchQuery?: string;
  className?: string;
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function getShortHash(node: GraphNode): string {
  const hash = (node.metadata?.hash as string) || node.sublabel || node.id;
  return hash.replace(/^commit:/, '').slice(0, 7);
}

function getCommitMessage(node: GraphNode): string {
  const msg = (node.sublabel || node.metadata?.description || node.label || '').split('\n')[0];
  return msg.trim() || 'No commit message';
}

function getFormattedDate(node: GraphNode): string {
  const raw =
    (node.metadata?.date as string) ||
    (node.metadata?.timestamp as string) ||
    node.createdAt || '';
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return '';
  }
}

// ─── Deterministic Git DAG Layout Engine ──────────────────────────────────────

function buildGitDagLayout(graphData?: WhyGraphData | null): {
  commits: LayoutCommit[];
  edges: LayoutEdge[];
  maxLane: number;
} {
  if (!graphData || !graphData.nodes) {
    return { commits: [], edges: [], maxLane: 0 };
  }

  // 1. Collect all COMMIT type nodes
  const commitNodes = graphData.nodes.filter((n) => n.type === 'COMMIT');
  if (commitNodes.length === 0) {
    return { commits: [], edges: [], maxLane: 0 };
  }

  // 2. Build fast lookup maps
  const nodeById: Record<string, GraphNode> = {};
  const nodeByHash: Record<string, GraphNode> = {};

  commitNodes.forEach((n) => {
    nodeById[n.id] = n;
    const fullHash = (n.metadata?.hash as string) || n.sublabel || '';
    const shortVal = fullHash.slice(0, 7) || n.id.replace(/^commit:/, '').slice(0, 7);
    if (fullHash) nodeByHash[fullHash] = n;
    if (shortVal) {
      nodeByHash[shortVal] = n;
      nodeByHash[`commit:${shortVal}`] = n;
    }
  });

  // 3. Parent-Child relationship tracking
  const childOf: Record<string, string[]> = {};  // childId -> parentIds
  const parentOf: Record<string, string[]> = {}; // parentId -> childIds

  const addRelation = (childId: string, parentId: string) => {
    if (!childId || !parentId || childId === parentId) return;
    if (!nodeById[childId] || !nodeById[parentId]) return;

    if (!childOf[childId]) childOf[childId] = [];
    if (!childOf[childId].includes(parentId)) childOf[childId].push(parentId);

    if (!parentOf[parentId]) parentOf[parentId] = [];
    if (!parentOf[parentId].includes(childId)) parentOf[parentId].push(childId);
  };

  const PARENT_RELATIONS = new Set([
    'PARENT_OF', 'PRECEDED_BY', 'FOLLOWED_BY', 'CHILD_OF',
    'NEXT_COMMIT', 'HAS_PARENT', 'COMMIT_PARENT',
  ]);

  // Extract from graph edges (e.source = parent, e.target = child in standard EngiTrace graph builder)
  (graphData.edges || []).forEach((e) => {
    const rel = (e.relationshipType || e.label || '').toUpperCase();
    if (PARENT_RELATIONS.has(rel)) {
      if (nodeById[e.source] && nodeById[e.target]) {
        addRelation(e.target, e.source);
      }
    }
  });

  // Extract from node metadata.parents
  commitNodes.forEach((n) => {
    const parentList = (n.metadata?.parents as string[]) || [];
    parentList.forEach((pHash) => {
      const parentNode =
        nodeByHash[pHash] ||
        nodeByHash[pHash.slice(0, 7)] ||
        nodeById[`commit:${pHash.slice(0, 7)}`];
      if (parentNode) {
        addRelation(n.id, parentNode.id);
      }
    });
  });

  // 4. Topological & Chronological Sorting
  // Children strictly ABOVE Parents (row 0 = newest child, row N-1 = oldest parent)
  const depths: Record<string, number> = {};
  const getDepth = (id: string, visited = new Set<string>()): number => {
    if (depths[id] !== undefined) return depths[id];
    if (visited.has(id)) return 0;
    visited.add(id);

    const children = parentOf[id] || [];
    if (children.length === 0) {
      depths[id] = 0;
      return 0;
    }
    const maxChildDepth = Math.max(...children.map((c) => getDepth(c, new Set(visited))));
    depths[id] = maxChildDepth + 1;
    return depths[id];
  };

  commitNodes.forEach((n) => getDepth(n.id));

  // Sort commits: lower depth first (child above parent), fallback to timestamp descending
  const sorted = [...commitNodes].sort((a, b) => {
    const depthA = depths[a.id] ?? 0;
    const depthB = depths[b.id] ?? 0;
    if (depthA !== depthB) return depthA - depthB;

    const dateA = new Date(
      (a.metadata?.date as string) || (a.metadata?.timestamp as string) || a.createdAt || 0
    ).getTime();
    const dateB = new Date(
      (b.metadata?.date as string) || (b.metadata?.timestamp as string) || b.createdAt || 0
    ).getTime();
    return dateB - dateA;
  });

  // 5. Deterministic Sweep-Line Lane Assignment
  const laneMap: Record<string, number> = {};
  const activeLanes: (string | null)[] = []; // index -> target commit ID

  sorted.forEach((commit) => {
    const commitId = commit.id;
    const parents = childOf[commitId] || [];

    // Check if an active lane is already targeting this commit
    let assignedLane = -1;
    for (let l = 0; l < activeLanes.length; l++) {
      if (activeLanes[l] === commitId) {
        if (assignedLane === -1) {
          assignedLane = l;
        } else {
          // Other lanes targeting this commit are branch merge-ins that end here
          activeLanes[l] = null;
        }
      }
    }

    // If no active lane targeted this commit, find the lowest free lane
    if (assignedLane === -1) {
      assignedLane = 0;
      while (activeLanes[assignedLane] !== null && activeLanes[assignedLane] !== undefined) {
        assignedLane++;
      }
    }

    laneMap[commitId] = assignedLane;

    // Allocate lane targets for parents
    if (parents.length > 0) {
      // Primary parent continues straight down in assignedLane
      const primaryParent = parents[0];
      activeLanes[assignedLane] = primaryParent;

      // Secondary parents (merge parents) get new active lanes if not already targeted
      for (let m = 1; m < parents.length; m++) {
        const mergeParent = parents[m];
        if (!activeLanes.includes(mergeParent)) {
          let freeLane = 0;
          while (
            freeLane === assignedLane ||
            (activeLanes[freeLane] !== null && activeLanes[freeLane] !== undefined)
          ) {
            freeLane++;
          }
          activeLanes[freeLane] = mergeParent;
        }
      }
    } else {
      // Root commit (no parents in dataset): free up this lane
      activeLanes[assignedLane] = null;
    }
  });

  // Calculate max lane count
  let maxLane = 0;
  Object.values(laneMap).forEach((l) => {
    if (l > maxLane) maxLane = l;
  });

  // 6. Construct LayoutCommits
  const layoutCommits: LayoutCommit[] = sorted.map((node, row) => {
    const lane = laneMap[node.id] ?? 0;
    const parents = childOf[node.id] || [];
    const children = parentOf[node.id] || [];
    const parentMetaCount = ((node.metadata?.parents as string[]) || []).length;
    const isMerge = parents.length > 1 || parentMetaCount > 1 || Boolean(node.metadata?.isMerge);

    return {
      node,
      row,
      lane,
      x: MARGIN_LEFT + lane * LANE_WIDTH,
      y: MARGIN_TOP + row * ROW_HEIGHT,
      isMerge,
      parents,
      children,
      shortHash: getShortHash(node),
      message: getCommitMessage(node),
      author: (node.metadata?.author as string) || 'Developer',
      dateStr: getFormattedDate(node),
    };
  });

  const commitById: Record<string, LayoutCommit> = {};
  layoutCommits.forEach((c) => { commitById[c.node.id] = c; });

  // 7. Construct LayoutEdges (SVG Bezier curves)
  const layoutEdges: LayoutEdge[] = [];

  layoutCommits.forEach((child) => {
    child.parents.forEach((parentId, pIdx) => {
      const parent = commitById[parentId];
      if (!parent) return;

      const isMergeEdge = child.isMerge && pIdx > 0;
      const color = isMergeEdge
        ? MERGE_COLOR
        : BRANCH_PALETTE[child.lane % BRANCH_PALETTE.length];

      const x1 = child.x;
      const y1 = child.y;
      const x2 = parent.x;
      const y2 = parent.y;

      let d = '';
      if (x1 === x2) {
        d = `M ${x1} ${y1} L ${x2} ${y2}`;
      } else {
        if (isMergeEdge) {
          // Merge curve: leaves merge commit at (x1, y1), curves into parent lane x2
          const curveR = Math.min(20, (y2 - y1) / 2);
          const midY = y1 + curveR;
          d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y1 + curveR * 2} L ${x2} ${y2}`;
        } else {
          // Branch split curve: straight down lane x1, curves into parent at (x2, y2)
          const curveR = Math.min(20, (y2 - y1) / 2);
          const midY = y2 - curveR;
          d = `M ${x1} ${y1} L ${x1} ${y2 - curveR * 2} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
        }
      }

      layoutEdges.push({
        id: `edge-${child.node.id}-${parentId}`,
        fromId: child.node.id,
        toId: parentId,
        d,
        color,
        isMergeEdge,
        lane: child.lane,
      });
    });
  });

  return { commits: layoutCommits, edges: layoutEdges, maxLane };
}

// ─── Main GitHistoryGraph Component ───────────────────────────────────────────

export const GitHistoryGraph: React.FC<GitHistoryGraphProps> = ({
  data,
  onSelectNode,
  selectedNodeId,
  highlightedNodeIds = [],
  targetNodeId = null,
  directImpactNodeIds = [],
  indirectImpactNodeIds = [],
  isImpactMode = false,
  searchQuery = '',
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan / Zoom transform state
  const [transform, setTransform] = useState({ x: 16, y: 16, scale: 1 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Hover state
  const [hoveredCommitId, setHoveredCommitId] = useState<string | null>(null);

  // Tooltip state
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, commit: null,
  });

  // Compute Layout (memoised & deterministic)
  const layout = useMemo(() => buildGitDagLayout(data), [data]);

  const commitById = useMemo(() => {
    const m: Record<string, LayoutCommit> = {};
    layout.commits.forEach((c) => { m[c.node.id] = c; });
    return m;
  }, [layout]);

  // Dimensions
  const contentWidth = useMemo(() => {
    return MARGIN_LEFT + (layout.maxLane + 1) * LANE_WIDTH + 720;
  }, [layout.maxLane]);

  const contentHeight = useMemo(() => {
    return MARGIN_TOP + layout.commits.length * ROW_HEIGHT + 60;
  }, [layout.commits.length]);

  // Fit to view calculation
  const calculateFitTransform = useCallback(() => {
    if (!containerRef.current || layout.commits.length === 0) return { x: 16, y: 16, scale: 1 };
    const cw = containerRef.current.clientWidth || 800;
    const ch = containerRef.current.clientHeight || 500;

    const contentW = MARGIN_LEFT + (layout.maxLane + 1) * LANE_WIDTH + 720;
    const contentH = MARGIN_TOP + layout.commits.length * ROW_HEIGHT + 40;

    const scaleX = (cw - 32) / contentW;
    const scaleY = (ch - 32) / contentH;
    const fitScale = Math.min(1.05, Math.max(0.4, Math.min(scaleX, scaleY)));

    const tx = Math.max(12, (cw - contentW * fitScale) / 2);
    const ty = 16; // Align nicely to top for chronological reading

    return { x: tx, y: ty, scale: fitScale };
  }, [layout]);

  // Auto-fit view when layout changes
  useEffect(() => {
    setTransform(calculateFitTransform());
  }, [calculateFitTransform]);

  // Non-passive wheel listener to prevent entire page scrolling during zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setTransform((t) => ({
        ...t,
        scale: Math.min(2.5, Math.max(0.4, t.scale * delta)),
      }));
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheelNative);
    };
  }, []);

  // Search Hits
  const searchHits = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      layout.commits
        .filter(
          (c) =>
            c.node.label.toLowerCase().includes(q) ||
            c.node.id.toLowerCase().includes(q) ||
            c.shortHash.toLowerCase().includes(q) ||
            c.message.toLowerCase().includes(q) ||
            c.author.toLowerCase().includes(q),
        )
        .map((c) => c.node.id),
    );
  }, [layout.commits, searchQuery]);

  const hasSearch = searchHits.size > 0;

  // Node Color Resolution
  const getNodeColor = useCallback(
    (commit: LayoutCommit) => {
      const id = commit.node.id;
      if (isImpactMode) {
        if (id === targetNodeId) return '#f97316';   // Orange target
        if (directImpactNodeIds.includes(id)) return '#ef4444';   // Red direct impact
        if (indirectImpactNodeIds.includes(id)) return '#f59e0b'; // Amber indirect impact
        return '#1e293b'; // Dimmed slate
      }
      if (highlightedNodeIds.length > 0) {
        if (highlightedNodeIds.includes(id)) return commit.isMerge ? MERGE_COLOR : '#22d3ee';
        return '#1e293b';
      }
      if (hasSearch) {
        if (searchHits.has(id)) return commit.isMerge ? MERGE_COLOR : '#22d3ee';
        return '#1e293b';
      }
      if (id === selectedNodeId) return '#6366f1'; // Indigo selection
      if (commit.isMerge) return MERGE_COLOR; // Orange for Merge commit
      return BRANCH_PALETTE[commit.lane % BRANCH_PALETTE.length];
    },
    [
      isImpactMode, targetNodeId, directImpactNodeIds, indirectImpactNodeIds,
      highlightedNodeIds, hasSearch, searchHits, selectedNodeId,
    ],
  );

  const isNodeDimmed = useCallback(
    (id: string) => {
      if (isImpactMode) {
        return id !== targetNodeId &&
          !directImpactNodeIds.includes(id) &&
          !indirectImpactNodeIds.includes(id);
      }
      if (highlightedNodeIds.length > 0) return !highlightedNodeIds.includes(id);
      if (hasSearch) return !searchHits.has(id);
      if (hoveredCommitId) {
        if (id === hoveredCommitId) return false;
        const hCommit = commitById[hoveredCommitId];
        if (hCommit && (hCommit.parents.includes(id) || hCommit.children.includes(id))) {
          return false;
        }
        return true;
      }
      return false;
    },
    [isImpactMode, targetNodeId, directImpactNodeIds, indirectImpactNodeIds, highlightedNodeIds, hasSearch, searchHits, hoveredCommitId, commitById],
  );

  // ── Pan Handlers ──────────────────────────────────────────────────────────

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[data-commit]')) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    e.preventDefault();
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setTransform((t) => ({ ...t, x: panStart.current.tx + dx, y: panStart.current.ty + dy }));
  };

  const handleMouseUp = () => { isPanning.current = false; };

  const handleReset = () => {
    setTransform(calculateFitTransform());
  };

  // ── Tooltip Handlers ──────────────────────────────────────────────────────

  const showTooltip = (e: ReactMouseEvent, commit: LayoutCommit) => {
    setHoveredCommitId(commit.node.id);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      visible: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      commit,
    });
  };

  const hideTooltip = () => {
    setHoveredCommitId(null);
    setTooltip((t) => ({ ...t, visible: false }));
  };

  const handleCommitClick = (commit: LayoutCommit, e: ReactMouseEvent) => {
    e.stopPropagation();
    if (onSelectNode) onSelectNode(commit.node);
  };

  const handleCanvasClick = () => {
    if (onSelectNode) onSelectNode(null);
  };

  // ── Render SVG Lane Lines & Edges ─────────────────────────────────────────

  const renderLaneGuides = () => {
    const lines: React.ReactNode[] = [];
    for (let lane = 0; lane <= layout.maxLane; lane++) {
      lines.push(
        <line
          key={`lane-guide-${lane}`}
          x1={MARGIN_LEFT + lane * LANE_WIDTH}
          y1={MARGIN_TOP - 16}
          x2={MARGIN_LEFT + lane * LANE_WIDTH}
          y2={contentHeight - 20}
          stroke={BRANCH_PALETTE[lane % BRANCH_PALETTE.length]}
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity={0.08}
        />
      );
    }
    return lines;
  };

  const renderEdges = () => {
    return layout.edges.map((edge) => {
      const isHoveredEdge = hoveredCommitId === edge.fromId || hoveredCommitId === edge.toId;
      const isDimmed = (hoveredCommitId && !isHoveredEdge) || isNodeDimmed(edge.fromId) || isNodeDimmed(edge.toId);
      const isHighlighted =
        !isDimmed && (
          isHoveredEdge ||
          highlightedNodeIds.includes(edge.fromId) ||
          highlightedNodeIds.includes(edge.toId) ||
          edge.fromId === selectedNodeId ||
          edge.toId === selectedNodeId
        );

      let stroke = edge.color;
      let opacity = isDimmed ? 0.12 : 0.8;
      let strokeWidth = isHighlighted ? 3.0 : edge.isMergeEdge ? 2.4 : 2.0;

      if (isImpactMode) {
        const srcDirect = directImpactNodeIds.includes(edge.toId);
        const tgtDirect = directImpactNodeIds.includes(edge.fromId);
        const srcIndirect = indirectImpactNodeIds.includes(edge.toId);
        const tgtIndirect = indirectImpactNodeIds.includes(edge.fromId);
        if (srcDirect || tgtDirect) { stroke = '#ef4444'; strokeWidth = 2.8; opacity = 1.0; }
        else if (srcIndirect || tgtIndirect) { stroke = '#f59e0b'; strokeWidth = 2.2; opacity = 0.9; }
        else { opacity = 0.1; }
      } else if (highlightedNodeIds.length > 0) {
        if (isHighlighted) { stroke = '#22d3ee'; strokeWidth = 3.0; opacity = 1.0; }
        else { opacity = 0.1; }
      } else if (isHoveredEdge) {
        stroke = '#22d3ee';
        opacity = 1.0;
      }

      return (
        <path
          key={edge.id}
          d={edge.d}
          stroke={stroke}
          strokeWidth={strokeWidth}
          opacity={opacity}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: 'stroke 0.2s, stroke-width 0.2s, opacity 0.2s' }}
        />
      );
    });
  };

  // ── Render Commit Nodes & Metadata Rows ───────────────────────────────────

  const renderCommitRows = () => {
    const textX = MARGIN_LEFT + (layout.maxLane + 1) * LANE_WIDTH + 20;

    return layout.commits.map((commit) => {
      const { x, y, node, isMerge, lane, shortHash, message, author, dateStr } = commit;
      const id = node.id;
      const isSelected = id === selectedNodeId;
      const isTarget = id === targetNodeId;
      const isHovered = id === hoveredCommitId;
      const color = getNodeColor(commit);
      const dimmed = isNodeDimmed(id);
      const laneColor = BRANCH_PALETTE[lane % BRANCH_PALETTE.length];

      return (
        <g
          key={id}
          data-commit={id}
          style={{ cursor: 'pointer', opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.2s' }}
          onClick={(e) => handleCommitClick(commit, e)}
          onMouseEnter={(e) => showTooltip(e, commit)}
          onMouseLeave={hideTooltip}
        >
          {/* Commit Row Background (Hover & Selected Highlights) */}
          <rect
            x={12}
            y={y - ROW_HEIGHT / 2 + 2}
            width={contentWidth - 24}
            height={ROW_HEIGHT - 4}
            fill={isSelected ? 'rgba(99,102,241,0.12)' : isHovered ? 'rgba(255,255,255,0.035)' : 'transparent'}
            stroke={isSelected ? 'rgba(99,102,241,0.4)' : 'transparent'}
            strokeWidth={1}
            rx={8}
          />

          {/* Date Column */}
          <text
            x={20}
            y={y + 4}
            fontSize="10"
            fontFamily="'Fira Code', monospace"
            fill={dimmed ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.7)'}
            textAnchor="start"
          >
            {dateStr || '—'}
          </text>

          {/* Connection Dot helper to topology */}
          <line
            x1={92}
            y1={y}
            x2={MARGIN_LEFT - 8}
            y2={y}
            stroke="rgba(51,65,85,0.2)"
            strokeWidth={1}
            strokeDasharray="2 2"
          />

          {/* Selected / Target Ring */}
          {(isSelected || isTarget) && (
            <circle
              cx={x}
              cy={y}
              r={NODE_R + 6}
              fill="none"
              stroke={isTarget ? MERGE_COLOR : '#6366f1'}
              strokeWidth={2.0}
              opacity={0.9}
              className="animate-pulse"
            />
          )}

          {/* Merge Commit Diamond Shape */}
          {isMerge ? (
            <g>
              {/* Outer diamond drop-shadow glow */}
              <polygon
                points={`${x},${y - MERGE_R - 3} ${x + MERGE_R + 3},${y} ${x},${y + MERGE_R + 3} ${x - MERGE_R - 3},${y}`}
                fill="rgba(249, 115, 22, 0.25)"
                stroke={isSelected ? '#ffffff' : MERGE_COLOR}
                strokeWidth={isSelected ? 2 : 1.4}
                style={{ filter: 'drop-shadow(0 0 5px rgba(249, 115, 22, 0.5))' }}
              />
              {/* Core diamond */}
              <polygon
                points={`${x},${y - MERGE_R} ${x + MERGE_R},${y} ${x},${y + MERGE_R} ${x - MERGE_R},${y}`}
                fill={color}
                stroke="#ffffff"
                strokeWidth={1.2}
              />
              {/* Inner white core point */}
              <polygon
                points={`${x},${y - 2.5} ${x + 2.5},${y} ${x},${y + 2.5} ${x - 2.5},${y}`}
                fill="#ffffff"
              />
            </g>
          ) : (
            /* Normal Commit Circle Shape */
            <g>
              <circle
                cx={x}
                cy={y}
                r={NODE_R}
                fill={color}
                stroke={isSelected ? '#ffffff' : laneColor}
                strokeWidth={isSelected ? 2.2 : 1.5}
                style={{ filter: isHovered ? `drop-shadow(0 0 4px ${laneColor})` : 'none' }}
              />
              {/* White core dot */}
              <circle cx={x} cy={y} r={2.2} fill="#ffffff" />
            </g>
          )}

          {/* Hash Column */}
          <text
            x={textX}
            y={y + 4}
            fontSize="10"
            fontFamily="'Fira Code', monospace"
            fill={isSelected ? '#22d3ee' : isMerge ? MERGE_COLOR : laneColor}
            fontWeight="bold"
            textAnchor="start"
          >
            {shortHash}
          </text>

          {/* Message Column */}
          <text
            x={textX + 72}
            y={y + 4}
            fontSize="11"
            fontFamily="'Inter', sans-serif"
            fill={isSelected ? '#ffffff' : dimmed ? 'rgba(241,245,249,0.3)' : 'rgba(241,245,249,0.85)'}
            fontWeight={isSelected ? '600' : '400'}
            textAnchor="start"
          >
            {message.length > 58 ? message.slice(0, 56) + '…' : message}
          </text>

          {/* Author Column */}
          <text
            x={textX + 480}
            y={y + 4}
            fontSize="10"
            fontFamily="'Inter', sans-serif"
            fill={dimmed ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.5)'}
            textAnchor="start"
          >
            {author}
          </text>
        </g>
      );
    });
  };

  // ── Render Header Timeline Axis ───────────────────────────────────────────

  const renderHeader = () => {
    const textX = MARGIN_LEFT + (layout.maxLane + 1) * LANE_WIDTH + 20;
    const y = 20;

    return (
      <g opacity={0.75}>
        <text x={20} y={y} fontSize="8.5" fontFamily="'Fira Code', monospace" fill="#94a3b8" fontWeight="bold">
          DATE
        </text>
        <text x={MARGIN_LEFT} y={y} fontSize="8.5" fontFamily="'Fira Code', monospace" fill="#94a3b8" fontWeight="bold">
          GIT HISTORY DAG TOPOLOGY
        </text>
        <text x={textX} y={y} fontSize="8.5" fontFamily="'Fira Code', monospace" fill="#94a3b8" fontWeight="bold">
          SHA
        </text>
        <text x={textX + 72} y={y} fontSize="8.5" fontFamily="'Fira Code', monospace" fill="#94a3b8" fontWeight="bold">
          COMMIT MESSAGE
        </text>
        <text x={textX + 480} y={y} fontSize="8.5" fontFamily="'Fira Code', monospace" fill="#94a3b8" fontWeight="bold">
          AUTHOR
        </text>
        <line x1={12} y1={y + 8} x2={contentWidth - 12} y2={y + 8} stroke="rgba(51,65,85,0.4)" strokeWidth={1} />
      </g>
    );
  };

  // ── Empty State Handling ──────────────────────────────────────────────────

  if (!data || layout.commits.length === 0) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-slate-400 font-mono text-sm p-8 ${className}`}>
        <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-3 text-cyan-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <p className="font-semibold text-slate-300">No Git Commits Ingested</p>
        <p className="text-xs text-slate-500 mt-1">Select an analyzed repository with Git commit history to render the DAG.</p>
      </div>
    );
  }

  // ── Render Main Canvas ────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none ${className}`}
      style={{ background: 'transparent', cursor: isPanning.current ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleCanvasClick}
    >
      {/* Engineering Background Grid */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <defs>
          <pattern id="git-grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.018)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#git-grid-pattern)" />
      </svg>

      {/* Main Interactive Graph SVG */}
      <svg
        ref={svgRef}
        className="w-full h-full block"
        onClick={(e) => e.stopPropagation()}
      >
        <rect width="100%" height="100%" fill="transparent" onClick={handleCanvasClick} />

        <g
          className="graph-world"
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
          style={{ transition: isPanning.current ? 'none' : 'transform 0.05s ease-out' }}
        >
          {/* Header Row */}
          {renderHeader()}

          {/* Lane Guide Lines */}
          {renderLaneGuides()}

          {/* SVG Edges (Bezier curves) */}
          <g>{renderEdges()}</g>

          {/* Commit Rows & Nodes */}
          <g>{renderCommitRows()}</g>
        </g>
      </svg>

      {/* Hover Tooltip Modal */}
      {tooltip.visible && tooltip.commit && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 16, (containerRef.current?.clientWidth ?? 800) - 260),
            top: Math.max(tooltip.y - 12, 12),
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >
          <div
            className="rounded-xl border border-slate-700/80 shadow-2xl p-3.5 font-mono text-xs"
            style={{ background: 'rgba(7,10,18,0.97)', backdropFilter: 'blur(12px)', minWidth: '240px' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  background: tooltip.commit.isMerge
                    ? MERGE_COLOR
                    : BRANCH_PALETTE[tooltip.commit.lane % BRANCH_PALETTE.length],
                }}
              />
              <span
                className="font-bold text-[10px] uppercase tracking-wider"
                style={{ color: tooltip.commit.isMerge ? MERGE_COLOR : '#22d3ee' }}
              >
                {tooltip.commit.isMerge
                  ? 'MERGE COMMIT'
                  : tooltip.commit.lane > 0
                  ? `BRANCH LANE ${tooltip.commit.lane}`
                  : 'MAIN COMMIT'}
              </span>
              <span className="text-slate-400 ml-auto text-[10px] font-bold">
                {tooltip.commit.shortHash}
              </span>
            </div>

            <p className="text-slate-100 text-[11.5px] leading-snug mb-2 font-sans font-medium">
              {tooltip.commit.node.label || tooltip.commit.message}
            </p>

            <div className="space-y-1 text-[10px] text-slate-400 border-t border-slate-800/80 pt-2">
              {tooltip.commit.author && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Author:</span>
                  <span className="text-slate-200">{tooltip.commit.author}</span>
                </div>
              )}
              {tooltip.commit.dateStr && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span className="text-slate-200">{tooltip.commit.dateStr}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Parents:</span>
                <span className="text-slate-200">{tooltip.commit.parents.length} parent(s)</span>
              </div>
            </div>

            {tooltip.commit.isMerge && (
              <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-orange-400 flex items-center gap-1 font-bold">
                <span>⊕ Real Git Topology Merge Point</span>
              </div>
            )}
            <div className="mt-2 pt-1.5 border-t border-slate-800/80 text-[9.5px] text-slate-500">
              Click commit to inspect Node Details / WHY / WHAT-IF
            </div>
          </div>
        </div>
      )}

      {/* Floating Zoom / Pan Toolbar */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1.5 pointer-events-auto z-20">
        <button
          onClick={() => setTransform((t) => ({ ...t, scale: Math.min(2.5, t.scale * 1.25) }))}
          className="w-8 h-8 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-500 flex items-center justify-center text-base transition cursor-pointer shadow-lg"
          title="Zoom in"
        >+</button>
        <button
          onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.4, t.scale / 1.25) }))}
          className="w-8 h-8 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-500 flex items-center justify-center text-base transition cursor-pointer shadow-lg"
          title="Zoom out"
        >−</button>
        <button
          onClick={handleReset}
          className="px-3 h-8 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-500 text-[11px] font-mono transition cursor-pointer font-bold shadow-lg"
          title="Fit graph to viewport"
        >FIT</button>
      </div>

      {/* Floating Commit Count Badge */}
      <div className="absolute top-3 right-4 pointer-events-none z-10">
        <span className="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800/80 text-[10px] font-mono text-slate-300 shadow-md">
          {layout.commits.length} commits ({layout.maxLane + 1} lane{layout.maxLane > 0 ? 's' : ''})
        </span>
      </div>
    </div>
  );
};
