import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MOCK_HERO_GRAPH } from '../../data/mockGraph';
import { GraphNode, GraphEdge, NodeType, WhyGraphData } from '../../types/graph';

interface CanvasNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  targetX: number;
  targetY: number;
  phase: number;
  color: string;
  glowColor: string;
  active: boolean;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  vx: number;
  vy: number;
}

const TYPE_COLORS: Record<NodeType, { fill: string; glow: string; label: string }> = {
  REPOSITORY: { fill: '#6366F1', glow: 'rgba(99, 102, 241, 0.7)', label: 'REPO' },
  FILE: { fill: '#10B981', glow: 'rgba(16, 185, 129, 0.6)', label: 'FILE' },
  FUNCTION: { fill: '#14B8A6', glow: 'rgba(20, 184, 166, 0.6)', label: 'FUNC' },
  COMPONENT: { fill: '#06B6D4', glow: 'rgba(6, 182, 212, 0.6)', label: 'COMP' },
  COMMIT: { fill: '#3B82F6', glow: 'rgba(59, 130, 246, 0.6)', label: 'COMMIT' },
  PULL_REQUEST: { fill: '#8B5CF6', glow: 'rgba(139, 92, 246, 0.6)', label: 'PR' },
  ISSUE: { fill: '#F59E0B', glow: 'rgba(245, 158, 11, 0.6)', label: 'ISSUE' },
  DECISION: { fill: '#A855F7', glow: 'rgba(168, 85, 247, 0.6)', label: 'DECISION' },
  INCIDENT: { fill: '#EF4444', glow: 'rgba(239, 68, 68, 0.7)', label: 'INCIDENT' },
  DEPENDENCY: { fill: '#EC4899', glow: 'rgba(236, 72, 153, 0.6)', label: 'DEP' },
  OUTCOME: { fill: '#22C55E', glow: 'rgba(34, 197, 94, 0.6)', label: 'OUTCOME' },
  AUTHOR: { fill: '#38BDF8', glow: 'rgba(56, 189, 248, 0.6)', label: 'AUTHOR' }
};

interface HeroGraphCanvasProps {
  data?: WhyGraphData | null;
  onSelectNode?: (node: GraphNode | null) => void;
  onSelectEdge?: (edge: GraphEdge | null) => void;
  selectedNodeId?: string | null;
  highlightedNodeIds?: string[];
  
  // Phase 6 What-If Impact Highlight Props
  targetNodeId?: string | null;
  directImpactNodeIds?: string[];
  indirectImpactNodeIds?: string[];
  isImpactMode?: boolean;

  filterType?: string;
  searchQuery?: string;
  className?: string;

  // Architecture mode: settle and stop physics after 3s (no continuous jitter)
  settlePhysics?: boolean;
  // Disable ambient background particles (improves performance in Architecture mode)
  showParticles?: boolean;
}

export const HeroGraphCanvas: React.FC<HeroGraphCanvasProps> = ({
  data,
  onSelectNode,
  onSelectEdge,
  selectedNodeId,
  highlightedNodeIds = [],
  targetNodeId = null,
  directImpactNodeIds = [],
  indirectImpactNodeIds = [],
  isImpactMode = false,
  filterType = 'ALL',
  searchQuery = '',
  className = '',
  settlePhysics = false,
  showParticles = true,
}) => {
  const physicsSettledRef = useRef<boolean>(false);
  const physicsStartTimeRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<CanvasNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });
  const hoveredNodeRef = useRef<CanvasNode | null>(null);
  const hoveredEdgeRef = useRef<GraphEdge | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<GraphEdge | null>(null);

  // Initialize Canvas layout and positions
  const initGraph = useCallback((width: number, height: number) => {
    const rawGraphNodes = data?.nodes && data.nodes.length > 0 ? data.nodes : MOCK_HERO_GRAPH.nodes;
    const rawGraphEdges = data?.edges && data.edges.length > 0 ? data.edges : MOCK_HERO_GRAPH.edges;

    // Filter nodes if filterType is set
    let filteredNodes = rawGraphNodes;
    if (filterType && filterType !== 'ALL') {
      filteredNodes = rawGraphNodes.filter((n) => n.type === filterType.toUpperCase());
    }

    // Filter by search query if provided
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter(
        (n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || (n.sublabel && n.sublabel.toLowerCase().includes(q))
      );
    }

    const validNodeIdSet = new Set(filteredNodes.map((n) => n.id));
    edgesRef.current = rawGraphEdges.filter((e) => validNodeIdSet.has(e.source) && validNodeIdSet.has(e.target));

    const centerX = width / 2;
    const centerY = height / 2;
    const count = filteredNodes.length;

    nodesRef.current = filteredNodes.map((node, idx) => {
      const ring = idx % 3;
      const ringRadius = Math.min(width, height) * (0.2 + ring * 0.12);
      const angle = (idx / Math.max(count, 1)) * Math.PI * 2 + (idx % 2 === 0 ? 0 : Math.PI / count);
      const distOffset = (Math.random() - 0.5) * 40;

      const initialX = centerX + Math.cos(angle) * (ringRadius + distOffset);
      const initialY = centerY + Math.sin(angle) * (ringRadius + distOffset);

      const typeConfig = TYPE_COLORS[node.type] || TYPE_COLORS.FILE;
      const baseRadius =
        node.type === 'REPOSITORY'
          ? 12
          : node.type === 'INCIDENT' || node.type === 'DECISION'
          ? 9
          : node.type === 'COMMIT' || node.type === 'PULL_REQUEST'
          ? 7
          : 6;

      return {
        ...node,
        x: initialX,
        y: initialY,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: baseRadius,
        baseRadius,
        targetX: initialX,
        targetY: initialY,
        phase: Math.random() * Math.PI * 2,
        color: typeConfig.fill,
        glowColor: typeConfig.glow,
        active: false
      };
    });

    // Generate ambient background particles
    const particles: Particle[] = [];
    const particleCount = Math.floor((width * height) / 14000);
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.35 + 0.1,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15
      });
    }
    particlesRef.current = particles;
  }, [data, filterType, searchQuery]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = container.clientWidth;
    let height = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      if (!container || !canvas) return;
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      initGraph(width, height);
    };

    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
      hoveredNodeRef.current = null;
      hoveredEdgeRef.current = null;
      setHoveredNode(null);
      setHoveredEdge(null);
    };

    const handleClick = () => {
      if (hoveredNodeRef.current) {
        if (onSelectNode) onSelectNode(hoveredNodeRef.current);
      } else if (hoveredEdgeRef.current) {
        if (onSelectEdge) onSelectEdge(hoveredEdgeRef.current);
      } else {
        if (onSelectNode) onSelectNode(null);
        if (onSelectEdge) onSelectEdge(null);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('click', handleClick);

    let time = 0;
    physicsSettledRef.current = false;
    physicsStartTimeRef.current = performance.now();

    const render = () => {
      time += 0.015;
      const physicsActive = !settlePhysics || !physicsSettledRef.current;
      // Check if settle time has elapsed
      if (settlePhysics && !physicsSettledRef.current) {
        if (performance.now() - physicsStartTimeRef.current > 3000) {
          physicsSettledRef.current = true;
        }
      }
      ctx.clearRect(0, 0, width, height);

      const mouse = mouseRef.current;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const particles = particlesRef.current;

      // 1. Grid background
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 2. Ambient particles (skip when showParticles=false)
      if (showParticles) {
        particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          ctx.fillStyle = `rgba(148, 163, 184, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Hover check
      let currentHovered: CanvasNode | null = null;
      if (mouse.active) {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const dx = n.x - mouse.x;
          const dy = n.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < n.radius + 12) {
            currentHovered = n;
            break;
          }
        }
      }

      if (currentHovered !== hoveredNodeRef.current) {
        hoveredNodeRef.current = currentHovered;
        setHoveredNode(currentHovered);
      }

      const activeNodeId = currentHovered?.id || selectedNodeId || targetNodeId;

      // Update node physics (skip movement when physics is settled)
      nodes.forEach((n) => {
        if (physicsActive) {
          n.phase += 0.02;
          const floatX = Math.cos(n.phase) * 0.3;
          const floatY = Math.sin(n.phase * 0.8) * 0.3;

          n.x += n.vx + floatX;
          n.y += n.vy + floatY;

          const margin = 50;
          if (n.x < margin || n.x > width - margin) n.vx *= -1;
          if (n.y < margin || n.y > height - margin) n.vy *= -1;

          if (mouse.active) {
            const mdx = mouse.x - n.x;
            const mdy = mouse.y - n.y;
            const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
            if (mdist < 160 && mdist > 5) {
              const force = ((160 - mdist) / 160) * 0.3;
              n.x -= (mdx / mdist) * force;
              n.y -= (mdy / mdist) * force;
            }
          }
        }

        const isHovered = currentHovered?.id === n.id;
        const isSelected = selectedNodeId === n.id || targetNodeId === n.id;
        const isDirect = directImpactNodeIds.includes(n.id);
        const isIndirect = indirectImpactNodeIds.includes(n.id);

        const targetRadius = isHovered || isSelected ? n.baseRadius * 1.5 : isDirect ? n.baseRadius * 1.3 : n.baseRadius;
        n.radius += (targetRadius - n.radius) * 0.15;
      });

      const nodeMap = new Map<string, CanvasNode>();
      nodes.forEach((n) => nodeMap.set(n.id, n));

      // 3. Draw Edges
      let foundHoveredEdge: GraphEdge | null = null;

      edges.forEach((edge, i) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return;

        const isConnectedToActive = activeNodeId && (activeNodeId === source.id || activeNodeId === target.id);
        const isInChain =
          highlightedNodeIds.length > 0 &&
          highlightedNodeIds.includes(source.id) &&
          highlightedNodeIds.includes(target.id);
        const isImpactEdge =
          isImpactMode &&
          (directImpactNodeIds.includes(source.id) || directImpactNodeIds.includes(target.id) ||
           indirectImpactNodeIds.includes(source.id) || indirectImpactNodeIds.includes(target.id));

        if (mouse.active && !currentHovered) {
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          const distToMid = Math.sqrt((mouse.x - midX) ** 2 + (mouse.y - midY) ** 2);
          if (distToMid < 20) {
            foundHoveredEdge = edge;
          }
        }

        const isEdgeHovered = hoveredEdgeRef.current?.id === edge.id;
        const isHighlighted = isConnectedToActive || isEdgeHovered || isInChain || isImpactEdge;

        const classification = edge.classification || 'FACT';
        if (classification === 'INFERENCE') {
          ctx.setLineDash([4, 4]);
        } else if (classification === 'UNKNOWN') {
          ctx.setLineDash([2, 4]);
        } else {
          ctx.setLineDash([]);
        }

        if (isImpactMode && isImpactEdge) {
          ctx.strokeStyle = directImpactNodeIds.includes(source.id) || directImpactNodeIds.includes(target.id)
            ? 'rgba(239, 68, 68, 0.85)'
            : 'rgba(245, 158, 11, 0.85)';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = 8;
        } else if (isHighlighted) {
          ctx.strokeStyle =
            classification === 'FACT'
              ? 'rgba(56, 189, 248, 0.9)'
              : classification === 'INFERENCE'
              ? 'rgba(245, 158, 11, 0.85)'
              : 'rgba(148, 163, 184, 0.6)';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = 10;
        } else {
          ctx.strokeStyle =
            activeNodeId || isImpactMode
              ? 'rgba(255, 255, 255, 0.03)'
              : classification === 'FACT'
              ? 'rgba(255, 255, 255, 0.12)'
              : classification === 'INFERENCE'
              ? 'rgba(245, 158, 11, 0.25)'
              : 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 1;
        }

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        // Animated pulse
        const pulsePos = (time * 0.35 + i * 0.2) % 1;
        const px = source.x + (target.x - source.x) * pulsePos;
        const py = source.y + (target.y - source.y) * pulsePos;

        ctx.fillStyle = isImpactMode && isImpactEdge ? '#EF4444' : isHighlighted ? '#38BDF8' : 'rgba(99, 102, 241, 0.5)';
        ctx.beginPath();
        ctx.arc(px, py, isHighlighted ? 2.5 : 1.2, 0, Math.PI * 2);
        ctx.fill();
      });

      if (foundHoveredEdge !== hoveredEdgeRef.current) {
        hoveredEdgeRef.current = foundHoveredEdge;
        setHoveredEdge(foundHoveredEdge);
      }

      // 4. Draw Nodes
      nodes.forEach((n) => {
        const isHovered = currentHovered?.id === n.id;
        const isTargetNode = targetNodeId === n.id || selectedNodeId === n.id;
        const isDirect = directImpactNodeIds.includes(n.id);
        const isIndirect = indirectImpactNodeIds.includes(n.id);

        const isInChain = highlightedNodeIds.length > 0 && highlightedNodeIds.includes(n.id);
        const isConnected =
          activeNodeId &&
          edges.some(
            (e) =>
              (e.source === activeNodeId && e.target === n.id) ||
              (e.target === activeNodeId && e.source === n.id)
          );

        let nodeColor = n.color;
        let nodeGlow = n.glowColor;

        if (isImpactMode) {
          if (isTargetNode) {
            nodeColor = '#F97316';
            nodeGlow = 'rgba(249, 115, 22, 0.9)';
          } else if (isDirect) {
            nodeColor = '#EF4444';
            nodeGlow = 'rgba(239, 68, 68, 0.85)';
          } else if (isIndirect) {
            nodeColor = '#F59E0B';
            nodeGlow = 'rgba(245, 158, 11, 0.85)';
          }
        }

        const isDimmed =
          (isImpactMode || activeNodeId || highlightedNodeIds.length > 0) &&
          !isHovered &&
          !isTargetNode &&
          !isDirect &&
          !isIndirect &&
          !isConnected &&
          !isInChain;

        const alpha = isDimmed ? 0.15 : 1.0;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Glow ring
        ctx.shadowColor = nodeGlow;
        ctx.shadowBlur = isHovered || isTargetNode || isDirect || isConnected ? 22 : 8;

        // Target Ring Pulse for What-If Target Node
        if (isTargetNode && isImpactMode) {
          ctx.strokeStyle = '#F97316';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 6 + Math.sin(time * 4) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Outer ring for REPOSITORY, INCIDENT, DECISION
        if (n.type === 'REPOSITORY' || n.type === 'INCIDENT' || n.type === 'DECISION') {
          ctx.strokeStyle = nodeColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Node body
        ctx.fillStyle = nodeColor;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Core dot
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Node Label
        ctx.font = isHovered || isTargetNode ? '600 11px "Fira Code", monospace' : '500 10px "Fira Code", monospace';
        ctx.fillStyle = isHovered || isTargetNode ? '#F8FAFC' : isDimmed ? 'rgba(148, 163, 184, 0.4)' : 'rgba(226, 232, 240, 0.85)';
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y + n.radius + 14);

        if ((isHovered || isTargetNode) && n.sublabel) {
          ctx.font = '400 9px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
          ctx.fillText(n.sublabel, n.x, n.y + n.radius + 25);
        }

        ctx.restore();
      });

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('click', handleClick);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [initGraph, onSelectNode, onSelectEdge, selectedNodeId, targetNodeId, directImpactNodeIds, indirectImpactNodeIds, isImpactMode, highlightedNodeIds]);

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-[480px] overflow-hidden rounded-2xl ${className}`}>
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />

      {/* Floating Tooltip for Hovered Edge */}
      {hoveredEdge && !hoveredNode && (
        <div className="absolute bottom-4 left-4 z-20 glass-panel border border-amber-500/40 rounded-xl p-3 shadow-2xl max-w-sm pointer-events-none animate-float">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono tracking-wider font-semibold text-amber-400 uppercase">
              {hoveredEdge.relationshipType || 'RELATIONSHIP'}
            </span>
            <span className="text-[10px] font-mono text-slate-400 ml-auto">{hoveredEdge.classification || 'FACT'}</span>
          </div>
          <p className="text-xs font-mono text-slate-200">{hoveredEdge.source} ➔ {hoveredEdge.target}</p>
          {hoveredEdge.evidence && (
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{hoveredEdge.evidence}</p>
          )}
        </div>
      )}

      {/* Floating Tooltip for Hovered Node */}
      {hoveredNode && (
        <div className="absolute bottom-4 left-4 z-20 glass-panel border border-cyan-500/30 rounded-xl p-3 shadow-2xl max-w-sm pointer-events-none animate-float">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: isImpactMode && targetNodeId === hoveredNode.id ? '#F97316' : (TYPE_COLORS[hoveredNode.type] || TYPE_COLORS.FILE).fill }}
            />
            <span className="text-[10px] font-mono tracking-wider font-semibold text-cyan-400 uppercase">
              {(TYPE_COLORS[hoveredNode.type] || TYPE_COLORS.FILE).label}
            </span>
            <span className="text-[10px] font-mono text-slate-400 ml-auto">{hoveredNode.id}</span>
          </div>
          <p className="text-sm font-semibold text-slate-100">{hoveredNode.label}</p>
          {hoveredNode.sublabel && (
            <p className="text-xs text-slate-400 font-mono mt-0.5">{hoveredNode.sublabel}</p>
          )}
        </div>
      )}
    </div>
  );
};
