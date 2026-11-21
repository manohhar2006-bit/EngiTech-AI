/**
 * FocusedWhyGraph — Dedicated Focused Historical Graph Visualizer for EngiTrace.
 *
 * Renders ONLY the selected target node and its relevant historical relationships
 * (Commits, Pull Requests, Issues, Authors, ADRs) derived from WhyResult and Graph-RAG evidence.
 *
 * Features:
 * - Deterministic, non-jittery 2D visual layout of historical chain nodes and edges.
 * - Visual distinction of FACT (Emerald solid), INFERENCE (Amber dashed), UNKNOWN (Rose dotted).
 * - Interactive node selection, edge inspector, and direct GitHub source link triggers.
 * - Honest presentation of documented history vs. undocumented rationale areas.
 */

import React, { useMemo, useState } from 'react';
import { WhyResult, HistoricalChainStep, FactItem, InferenceItem, UnknownItem } from '../../types/why';
import { GraphNode, GraphEdge, WhyGraphData, NodeType, EvidenceClassification } from '../../types/graph';
import { GraphService } from '../../services/graphService';
import {
  FileCode,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  Package,
  User,
  ShieldCheck,
  Zap,
  HelpCircle,
  ArrowRight,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  X,
  Sparkles
} from 'lucide-react';

export interface FocusedWhyGraphProps {
  whyResult: WhyResult | null;
  fullGraph?: WhyGraphData | null;
  onSelectNode?: (node: GraphNode | null) => void;
  onSelectEdge?: (edge: GraphEdge | null) => void;
  onInspectEvidence?: (evidenceId: string) => void;
  selectedNodeId?: string | null;
  className?: string;
  onCloseFocus?: () => void;
}

interface GraphVisualNode {
  id: string;
  label: string;
  type: NodeType | 'UNKNOWN_AREA';
  sublabel?: string;
  x: number;
  y: number;
  isTarget: boolean;
  stepNumber?: number;
  classification?: EvidenceClassification;
  confidence?: number;
  sourceUrl?: string;
  eventDescription?: string;
  originalNode?: GraphNode;
  unknownReason?: string;
}

interface GraphVisualEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  classification: EvidenceClassification;
  confidence: number;
  evidenceText?: string;
  sourceUrl?: string;
}

export const FocusedWhyGraph: React.FC<FocusedWhyGraphProps> = ({
  whyResult,
  fullGraph,
  onSelectNode,
  onSelectEdge,
  onInspectEvidence,
  selectedNodeId,
  className = '',
  onCloseFocus
}) => {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // 1. Build focused graph data structure deterministically
  const focusedGraphData = useMemo(() => {
    if (!whyResult || !whyResult.target) {
      return { visualNodes: [], visualEdges: [], targetNode: null };
    }

    const focusedGraph = GraphService.createFocusedWhySubgraph(fullGraph || null, whyResult);
    const targetNode = whyResult.target;

    const visualNodes: GraphVisualNode[] = [];
    const visualEdges: GraphVisualEdge[] = [];
    const addedNodeIds = new Set<string>();

    const chainSteps = whyResult.historicalChain || [];

    // Canvas size parameters
    const CANVAS_WIDTH = 760;
    const CANVAS_HEIGHT = 440;
    const centerX = CANVAS_WIDTH / 2;

    // A. Target Node (Placed prominently at top center)
    addedNodeIds.add(targetNode.id);
    visualNodes.push({
      id: targetNode.id,
      label: targetNode.label,
      type: targetNode.type,
      sublabel: targetNode.sublabel || targetNode.id,
      x: centerX,
      y: 65,
      isTarget: true,
      stepNumber: 1,
      classification: 'FACT',
      confidence: 1.0,
      sourceUrl: targetNode.sourceReference || (targetNode.metadata?.url as string),
      eventDescription: `Target entity under historical investigation`,
      originalNode: targetNode
    });

    // B. Historical Chain Nodes (Arranged in structured sequence rows below target)
    const otherSteps = chainSteps.filter((s) => s.node && s.node.id !== targetNode.id);
    const totalOtherSteps = otherSteps.length;
    
    otherSteps.forEach((step, idx) => {
      const node = step.node;
      if (!addedNodeIds.has(node.id)) {
        addedNodeIds.add(node.id);

        let x = centerX;
        let y = 160 + idx * 95;

        // Spread nodes horizontally if multiple steps or specific types
        if (totalOtherSteps > 1) {
          if (idx === 0) x = centerX - 160;
          else if (idx === 1) x = centerX + 160;
          else if (idx === 2) x = centerX - 210;
          else if (idx === 3) x = centerX + 210;
        }

        visualNodes.push({
          id: node.id,
          label: node.label,
          type: node.type,
          sublabel: node.sublabel || (node.metadata?.hash ? `Commit ${String(node.metadata.hash).slice(0, 7)}` : undefined),
          x: Math.max(120, Math.min(CANVAS_WIDTH - 120, x)),
          y: Math.max(140, Math.min(CANVAS_HEIGHT - 60, y)),
          isTarget: false,
          stepNumber: step.stepNumber,
          classification: step.classification || 'FACT',
          confidence: step.confidence || 0.9,
          sourceUrl: step.sourceUrl,
          eventDescription: step.event,
          originalNode: node
        });
      }
    });

    // C. Add Unknown Rationale Warning Nodes if explicit documentation is missing
    if (Array.isArray(whyResult.unknowns) && whyResult.unknowns.length > 0) {
      whyResult.unknowns.slice(0, 2).forEach((unk, idx) => {
        const unkId = `unk-node-${unk.id}`;
        if (!addedNodeIds.has(unkId)) {
          addedNodeIds.add(unkId);
          visualNodes.push({
            id: unkId,
            label: unk.area,
            type: 'UNKNOWN_AREA',
            sublabel: 'Undocumented Rationale',
            x: idx === 0 ? 110 : CANVAS_WIDTH - 110,
            y: CANVAS_HEIGHT - 60,
            isTarget: false,
            classification: 'UNKNOWN',
            confidence: 0.1,
            unknownReason: unk.reason,
            eventDescription: `Undocumented area: ${unk.reason}`
          });

          // Connect unknown node to target node
          visualEdges.push({
            id: `edge-unk-${unk.id}`,
            sourceId: targetNode.id,
            targetId: unkId,
            relationshipType: 'MISSING_LINKAGE',
            classification: 'UNKNOWN',
            confidence: 0.1,
            evidenceText: unk.reason
          });
        }
      });
    }

    // D. Visual Edges from focusedGraph
    const nodeMap = new Map(visualNodes.map((n) => [n.id, n]));

    if (focusedGraph && Array.isArray(focusedGraph.edges)) {
      focusedGraph.edges.forEach((edge) => {
        if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
          visualEdges.push({
            id: edge.id,
            sourceId: edge.source,
            targetId: edge.target,
            relationshipType: edge.relationshipType || edge.label || 'RELATED_TO',
            classification: edge.classification || 'FACT',
            confidence: edge.confidence || 0.9,
            evidenceText: edge.evidence,
            sourceUrl: edge.sourceUrl
          });
        }
      });
    }

    // Ensure edges between sequential steps exist visually
    for (let i = 0; i < visualNodes.length - 1; i++) {
      const src = visualNodes[i];
      const tgt = visualNodes[i + 1];

      if (src && tgt && src.type !== 'UNKNOWN_AREA' && tgt.type !== 'UNKNOWN_AREA') {
        const existing = visualEdges.find(
          (e) => (e.sourceId === src.id && e.targetId === tgt.id) || (e.sourceId === tgt.id && e.targetId === src.id)
        );

        if (!existing) {
          const stepMatch = chainSteps.find((s) => s.node && s.node.id === tgt.id);
          visualEdges.push({
            id: `synth-edge-${src.id}-${tgt.id}`,
            sourceId: src.id,
            targetId: tgt.id,
            relationshipType: stepMatch?.relationship || 'HISTORICAL_CHAIN',
            classification: stepMatch?.classification || 'FACT',
            confidence: stepMatch?.confidence || 0.9,
            evidenceText: stepMatch?.event,
            sourceUrl: stepMatch?.sourceUrl
          });
        }
      }
    }

    return { visualNodes, visualEdges, targetNode };
  }, [whyResult, fullGraph]);

  if (!whyResult || !whyResult.target) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-3 p-8 font-mono text-xs text-slate-500">
        <Sparkles className="w-8 h-8 text-slate-600 animate-pulse" />
        <p>Select a node and click <strong className="text-cyan-400">WHY?</strong> to inspect its focused historical chain.</p>
      </div>
    );
  }

  const { visualNodes, visualEdges, targetNode } = focusedGraphData;

  // Node type styling helpers
  const getNodeTypeBadge = (type: string, isTarget = false) => {
    if (isTarget) return 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60 shadow-cyan-500/20';
    switch (type) {
      case 'FILE': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'COMMIT': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'PULL_REQUEST': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'ISSUE': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'AUTHOR': return 'bg-teal-500/10 text-teal-400 border-teal-500/30';
      case 'DECISION': return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'UNKNOWN_AREA': return 'bg-rose-950/40 text-rose-300 border-rose-800/80 border-dashed';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'FILE': return <FileCode className="w-3.5 h-3.5 text-emerald-400" />;
      case 'COMMIT': return <GitCommit className="w-3.5 h-3.5 text-purple-400" />;
      case 'PULL_REQUEST': return <GitPullRequest className="w-3.5 h-3.5 text-indigo-400" />;
      case 'ISSUE': return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
      case 'AUTHOR': return <User className="w-3.5 h-3.5 text-teal-400" />;
      case 'DECISION': return <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />;
      case 'UNKNOWN_AREA': return <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />;
      default: return <Layers className="w-3.5 h-3.5 text-cyan-400" />;
    }
  };

  const getEdgeStrokeColor = (classification: EvidenceClassification, isHovered = false) => {
    if (isHovered) return '#38bdf8'; // Bright cyan on hover
    switch (classification) {
      case 'FACT': return '#10b981'; // Emerald solid
      case 'INFERENCE': return '#f59e0b'; // Amber dashed
      case 'UNKNOWN': return '#f43f5e'; // Rose dotted
      default: return '#64748b';
    }
  };

  return (
    <div className={`relative w-full h-full bg-[#05070C] overflow-hidden flex flex-col font-mono select-none ${className}`}>
      
      {/* ── Visual Subgraph Header Toolbar ────────────────────────────────────── */}
      <div className="px-4 py-2.5 bg-[#070A12]/90 border-b border-slate-800/80 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider font-display">
                FOCUSED WHY GRAPH
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {visualNodes.length} HISTORICAL NODES
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Showing exact historical origin & rationale connections for <strong className="text-cyan-300">{targetNode.label}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[10px] text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Confidence: <strong className="text-emerald-300">{Math.round(whyResult.confidence.score * 100)}% ({whyResult.confidence.level})</strong></span>
          </div>

          {onCloseFocus && (
            <button
              onClick={onCloseFocus}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-[11px] transition flex items-center gap-1 cursor-pointer"
              title="Return to repository graph"
            >
              <X className="w-3 h-3" />
              <span>EXIT FOCUS</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Interactive SVG & Node Canvas ───────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 w-full overflow-auto">
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <defs>
            <marker id="arrow-fact" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
            </marker>
            <marker id="arrow-inference" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
            </marker>
            <marker id="arrow-unknown" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f43f5e" />
            </marker>
            <marker id="arrow-hover" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
            </marker>
          </defs>

          {/* Render Visual Edges */}
          {visualEdges.map((edge) => {
            const srcNode = visualNodes.find((n) => n.id === edge.sourceId);
            const tgtNode = visualNodes.find((n) => n.id === edge.targetId);
            if (!srcNode || !tgtNode) return null;

            const isHovered = hoveredEdgeId === edge.id || hoveredNodeId === edge.sourceId || hoveredNodeId === edge.targetId;
            const strokeColor = getEdgeStrokeColor(edge.classification, isHovered);

            // Compute smooth cubic bezier path
            const dx = tgtNode.x - srcNode.x;
            const dy = tgtNode.y - srcNode.y;
            const cy1 = srcNode.y + dy * 0.5;
            const cy2 = tgtNode.y - dy * 0.5;
            const pathD = `M ${srcNode.x} ${srcNode.y} C ${srcNode.x + dx * 0.2} ${cy1}, ${tgtNode.x - dx * 0.2} ${cy2}, ${tgtNode.x} ${tgtNode.y}`;

            const midX = (srcNode.x + tgtNode.x) / 2;
            const midY = (srcNode.y + tgtNode.y) / 2;

            const markerId = isHovered
              ? 'url(#arrow-hover)'
              : edge.classification === 'FACT'
              ? 'url(#arrow-fact)'
              : edge.classification === 'INFERENCE'
              ? 'url(#arrow-inference)'
              : 'url(#arrow-unknown)';

            return (
              <g key={edge.id} className="transition-all duration-200">
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  strokeDasharray={
                    edge.classification === 'INFERENCE'
                      ? '6,4'
                      : edge.classification === 'UNKNOWN'
                      ? '3,3'
                      : 'none'
                  }
                  markerEnd={markerId}
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                  onClick={() => onInspectEvidence && onInspectEvidence(edge.id)}
                />

                {/* Edge Label Pill */}
                <g
                  transform={`translate(${midX}, ${midY})`}
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => onInspectEvidence && onInspectEvidence(edge.id)}
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                >
                  <rect
                    x="-45"
                    y="-9"
                    width="90"
                    height="18"
                    rx="9"
                    fill="#070A12"
                    stroke={strokeColor}
                    strokeWidth="1"
                    className="opacity-90 hover:opacity-100 transition-opacity"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fill={isHovered ? '#38bdf8' : '#94a3b8'}
                    fontSize="9"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {edge.relationshipType.length > 14 ? `${edge.relationshipType.slice(0, 12)}…` : edge.relationshipType}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* Render Focused Nodes as HTML Cards over Canvas */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {visualNodes.map((vNode) => {
            const isSelected = selectedNodeId === vNode.id;
            const isHovered = hoveredNodeId === vNode.id;
            const badgeStyle = getNodeTypeBadge(vNode.type, vNode.isTarget);

            return (
              <div
                key={vNode.id}
                style={{
                  left: `${vNode.x}px`,
                  top: `${vNode.y}px`,
                  transform: 'translate(-50%, -50%)'
                }}
                className={`absolute pointer-events-auto transition-all duration-200 cursor-pointer group ${
                  vNode.isTarget ? 'z-30' : isSelected || isHovered ? 'z-20 scale-105' : 'z-10'
                }`}
                onMouseEnter={() => setHoveredNodeId(vNode.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                onClick={() => {
                  if (vNode.originalNode && onSelectNode) {
                    onSelectNode(vNode.originalNode);
                  }
                }}
              >
                <div
                  className={`p-3 rounded-2xl border bg-[#070A12]/95 backdrop-blur shadow-xl min-w-[180px] max-w-[240px] transition-all ${
                    vNode.isTarget
                      ? 'border-cyan-400 ring-4 ring-cyan-500/20 shadow-cyan-500/30'
                      : isSelected
                      ? 'border-indigo-400 ring-2 ring-indigo-500/30'
                      : vNode.type === 'UNKNOWN_AREA'
                      ? 'border-rose-800/80 border-dashed bg-rose-950/20'
                      : 'border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      {getNodeIcon(vNode.type)}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border truncate ${badgeStyle}`}>
                        {vNode.type}
                      </span>
                    </div>

                    {vNode.stepNumber && (
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[9px] font-bold border border-slate-700">
                        {vNode.stepNumber}
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-white truncate font-display" title={vNode.label}>
                    {vNode.label}
                  </h4>

                  {vNode.sublabel && (
                    <p className="text-[10px] text-slate-400 truncate mt-0.5" title={vNode.sublabel}>
                      {vNode.sublabel}
                    </p>
                  )}

                  {vNode.eventDescription && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80 text-[10px] text-slate-300 leading-snug line-clamp-2">
                      {vNode.eventDescription}
                    </div>
                  )}

                  {/* Classification Tag / Source Link */}
                  <div className="mt-2 pt-1.5 flex items-center justify-between text-[9px] text-slate-400">
                    <span className={`font-bold ${
                      vNode.classification === 'FACT' ? 'text-emerald-400' : vNode.classification === 'INFERENCE' ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {vNode.classification || 'FACT'}
                    </span>

                    {vNode.sourceUrl && (
                      <a
                        href={vNode.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-cyan-400 hover:underline flex items-center gap-0.5"
                        title="Open Source Link"
                      >
                        <span>Link</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Visual Subgraph Footer Legend ───────────────────────────────────── */}
      <div className="px-4 py-2 bg-[#070A12]/95 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 ring-2 ring-cyan-500/30"></span>
            <span className="text-slate-200 font-bold">Target Entity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-500"></span>
            <span>FACT (Verified)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-500 stroke-dasharray"></span>
            <span>INFERENCE (Plausible)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-rose-500 border-dashed"></span>
            <span>UNKNOWN (Undocumented)</span>
          </div>
        </div>

        <div>
          <span>Click any node to inspect details • Click edge to view evidence</span>
        </div>
      </div>
    </div>
  );
};
