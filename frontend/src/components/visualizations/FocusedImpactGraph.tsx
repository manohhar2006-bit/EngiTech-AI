/**
 * FocusedImpactGraph — Dedicated Focused WHAT-IF Impact Graph Visualizer for EngiTrace.
 *
 * Renders ONLY the target node being considered for removal/change, its direct dependents (Depth 1),
 * indirect downstream consumers (Depth 2+), affected APIs, and affected test suites.
 *
 * Features:
 * - Deterministic, non-jittery 2D visual layout grouped by impact depth.
 * - Visual distinction of Target (Red), Direct Impact (Orange), Indirect Impact (Yellow), APIs (Emerald), Tests (Indigo).
 * - Interactive node selection, edge inspector, and direct GitHub source link triggers.
 * - Honest presentation of impact score (0-100), risk level, warnings, and confidence rating.
 */

import React, { useMemo, useState } from 'react';
import { ImpactResult, ImpactEvidenceItem } from '../../types/impact';
import { GraphNode, GraphEdge, WhyGraphData, NodeType, EvidenceClassification } from '../../types/graph';
import { GraphService } from '../../services/graphService';
import {
  Zap,
  AlertTriangle,
  FileCode,
  Layers,
  Package,
  ShieldCheck,
  ExternalLink,
  Info,
  CheckCircle2,
  X,
  Sparkles,
  ArrowRight,
  Code,
  Box
} from 'lucide-react';

export interface FocusedImpactGraphProps {
  impactResult: ImpactResult | null;
  fullGraph?: WhyGraphData | null;
  onSelectNode?: (node: GraphNode | null) => void;
  onSelectEdge?: (edge: GraphEdge | null) => void;
  onInspectEvidence?: (evidenceId: string) => void;
  selectedNodeId?: string | null;
  className?: string;
  onCloseFocus?: () => void;
}

type ImpactRole = 'TARGET' | 'DIRECT' | 'INDIRECT' | 'API' | 'TEST' | 'DEPENDENCY';

interface VisualImpactNode {
  id: string;
  label: string;
  type: NodeType;
  sublabel?: string;
  x: number;
  y: number;
  role: ImpactRole;
  depth: number;
  sourceUrl?: string;
  originalNode: GraphNode;
}

interface VisualImpactEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  classification: EvidenceClassification;
  confidence: number;
  evidenceText?: string;
  sourceUrl?: string;
}

export const FocusedImpactGraph: React.FC<FocusedImpactGraphProps> = ({
  impactResult,
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

  // Build focused graph layout deterministically
  const focusedData = useMemo(() => {
    if (!impactResult || !impactResult.target) {
      return { visualNodes: [], visualEdges: [], targetNode: null };
    }

    const focusedGraph = GraphService.createFocusedImpactSubgraph(fullGraph || null, impactResult);
    const targetNode = impactResult.target;

    const visualNodes: VisualImpactNode[] = [];
    const visualEdges: VisualImpactEdge[] = [];
    const addedNodeIds = new Set<string>();

    const CANVAS_WIDTH = 760;
    const CANVAS_HEIGHT = 440;

    // A. Target Node (Placed on left column or top center)
    const targetId = targetNode.id;
    addedNodeIds.add(targetId);
    visualNodes.push({
      id: targetId,
      label: targetNode.label,
      type: targetNode.type,
      sublabel: targetNode.sublabel || targetNode.id,
      x: 120,
      y: CANVAS_HEIGHT / 2,
      role: 'TARGET',
      depth: 0,
      sourceUrl: targetNode.sourceReference || (targetNode.metadata?.url as string),
      originalNode: targetNode
    });

    // B. Direct Impact Nodes (Depth 1 - Placed in middle column)
    const directNodes = impactResult.directImpact || [];
    const directCount = directNodes.length;

    directNodes.forEach((node, idx) => {
      if (!addedNodeIds.has(node.id)) {
        addedNodeIds.add(node.id);
        const ySpacing = Math.min(90, (CANVAS_HEIGHT - 100) / Math.max(1, directCount));
        const startY = (CANVAS_HEIGHT - (directCount - 1) * ySpacing) / 2;

        visualNodes.push({
          id: node.id,
          label: node.label,
          type: node.type,
          sublabel: node.sublabel || node.id.split(':').pop(),
          x: 380,
          y: startY + idx * ySpacing,
          role: 'DIRECT',
          depth: 1,
          sourceUrl: node.sourceReference || (node.metadata?.url as string),
          originalNode: node
        });
      }
    });

    // C. Indirect Impact Nodes (Depth 2+ - Placed in right column)
    const indirectNodes = impactResult.indirectImpact || [];
    const indirectCount = indirectNodes.length;

    indirectNodes.forEach((node, idx) => {
      if (!addedNodeIds.has(node.id)) {
        addedNodeIds.add(node.id);
        const ySpacing = Math.min(80, (CANVAS_HEIGHT - 100) / Math.max(1, indirectCount));
        const startY = (CANVAS_HEIGHT - (indirectCount - 1) * ySpacing) / 2;

        visualNodes.push({
          id: node.id,
          label: node.label,
          type: node.type,
          sublabel: node.sublabel || node.id.split(':').pop(),
          x: 630,
          y: startY + idx * ySpacing,
          role: 'INDIRECT',
          depth: 2,
          sourceUrl: node.sourceReference || (node.metadata?.url as string),
          originalNode: node
        });
      }
    });

    // D. Affected APIs & Tests (Positioned dynamically if not already added)
    const affectedAPIs = impactResult.affectedAPIs || [];
    affectedAPIs.forEach((apiNode, idx) => {
      if (!addedNodeIds.has(apiNode.id)) {
        addedNodeIds.add(apiNode.id);
        visualNodes.push({
          id: apiNode.id,
          label: apiNode.label,
          type: apiNode.type,
          sublabel: 'Affected API Route',
          x: 520,
          y: 70 + idx * 75,
          role: 'API',
          depth: 2,
          sourceUrl: apiNode.sourceReference,
          originalNode: apiNode
        });
      }
    });

    const affectedTests = impactResult.affectedTests || [];
    affectedTests.forEach((testNode, idx) => {
      if (!addedNodeIds.has(testNode.id)) {
        addedNodeIds.add(testNode.id);
        visualNodes.push({
          id: testNode.id,
          label: testNode.label,
          type: testNode.type,
          sublabel: 'Affected Test Suite',
          x: 520,
          y: CANVAS_HEIGHT - 70 - idx * 75,
          role: 'TEST',
          depth: 2,
          sourceUrl: testNode.sourceReference,
          originalNode: testNode
        });
      }
    });

    // E. Visual Edges from focusedGraph
    const nodeMap = new Map(visualNodes.map((n) => [n.id, n]));

    if (focusedGraph && Array.isArray(focusedGraph.edges)) {
      focusedGraph.edges.forEach((edge) => {
        if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
          visualEdges.push({
            id: edge.id,
            sourceId: edge.source,
            targetId: edge.target,
            relationshipType: edge.relationshipType || edge.label || 'DEPENDS_ON',
            classification: edge.classification || 'FACT',
            confidence: edge.confidence || 0.9,
            evidenceText: edge.evidence,
            sourceUrl: edge.sourceUrl
          });
        }
      });
    }

    // Ensure edges between Target -> Direct Impact and Direct -> Indirect exist visually
    directNodes.forEach((dNode) => {
      if (nodeMap.has(dNode.id)) {
        const edgeKey = `synth-imp-target-${dNode.id}`;
        const existing = visualEdges.find(
          (e) => (e.sourceId === targetId && e.targetId === dNode.id) || (e.sourceId === dNode.id && e.targetId === targetId)
        );

        if (!existing) {
          visualEdges.push({
            id: edgeKey,
            sourceId: dNode.id, // Dependent points to Target or Target points to Dependent
            targetId: targetId,
            relationshipType: 'DEPENDS_ON',
            classification: 'FACT',
            confidence: 0.95,
            evidenceText: `${dNode.label} depends on ${targetNode.label}`
          });
        }
      }
    });

    indirectNodes.forEach((iNode) => {
      if (nodeMap.has(iNode.id)) {
        const matchingDirect = directNodes.find((d) => d.id !== iNode.id);
        const parentId = matchingDirect ? matchingDirect.id : targetId;
        const edgeKey = `synth-imp-ind-${iNode.id}`;

        const existing = visualEdges.find(
          (e) => (e.sourceId === iNode.id && e.targetId === parentId) || (e.sourceId === parentId && e.targetId === iNode.id)
        );

        if (!existing) {
          visualEdges.push({
            id: edgeKey,
            sourceId: iNode.id,
            targetId: parentId,
            relationshipType: 'DEPENDS_ON',
            classification: 'FACT',
            confidence: 0.85,
            evidenceText: `${iNode.label} relies transitively on ${targetNode.label}`
          });
        }
      }
    });

    return { visualNodes, visualEdges, targetNode };
  }, [impactResult, fullGraph]);

  if (!impactResult || !impactResult.target) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-3 p-8 font-mono text-xs text-slate-500">
        <Zap className="w-8 h-8 text-amber-500/60 animate-pulse" />
        <p>Select a node and click <strong className="text-amber-400">WHAT IF?</strong> to inspect downstream impact.</p>
      </div>
    );
  }

  const { visualNodes, visualEdges, targetNode } = focusedData;

  const getRoleBadge = (role: ImpactRole) => {
    switch (role) {
      case 'TARGET':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/50 ring-rose-500/20';
      case 'DIRECT':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/50';
      case 'INDIRECT':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'API':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'TEST':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getImpactLevelColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
      case 'HIGH':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'LOW':
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  return (
    <div className={`relative w-full h-full bg-[#05070C] overflow-hidden flex flex-col font-mono select-none ${className}`}>
      
      {/* ── Visual Subgraph Header Toolbar ────────────────────────────────────── */}
      <div className="px-4 py-2.5 bg-[#070A12]/90 border-b border-slate-800/80 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <Zap className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider font-display">
                FOCUSED WHAT-IF IMPACT GRAPH
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getImpactLevelColor(impactResult.impactLevel)}`}>
                IMPACT: {impactResult.impactLevel} (Score: {impactResult.impactScore}/100)
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Downstream consumer analysis if <strong className="text-rose-300">{targetNode.label}</strong> is {impactResult.operation === 'REMOVE' ? 'removed' : 'modified'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[10px] text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Confidence: <strong className="text-emerald-300">{Math.round(impactResult.confidence.score * 100)}% ({impactResult.confidence.rating})</strong></span>
          </div>

          {onCloseFocus && (
            <button
              onClick={onCloseFocus}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-[11px] transition flex items-center gap-1 cursor-pointer"
              title="Return to full graph"
            >
              <X className="w-3 h-3" />
              <span>EXIT FOCUS</span>
            </button>
          )}
        </div>
      </div>

      {/* Warnings alert banner if present */}
      {impactResult.warnings && impactResult.warnings.length > 0 && (
        <div className="px-4 py-1.5 bg-rose-950/30 border-b border-rose-900/40 text-[10px] text-rose-300 flex items-center gap-2 z-10">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
          <span className="truncate">{impactResult.warnings[0]}</span>
        </div>
      )}

      {/* ── Interactive SVG & Node Canvas ───────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 w-full overflow-auto">
        {visualNodes.length === 1 ? (
          /* Empty / Isolated result notice */
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 p-8">
            <ShieldCheck className="w-10 h-10 text-emerald-400/80 mb-1" />
            <h3 className="text-sm font-bold text-white uppercase font-display">NO DOWNSTREAM DEPENDENTS DETECTED</h3>
            <p className="text-xs text-slate-400 max-w-md font-sans">
              EngiTrace analyzed the Engineering Memory Graph for <strong className="text-cyan-300">{targetNode.label}</strong>. No downstream components, API routes, or test suites depend on this component. Removing it presents LOW architectural risk inside the repository graph.
            </p>
          </div>
        ) : (
          <>
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <defs>
                <marker id="arrow-imp-direct" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
                </marker>
                <marker id="arrow-imp-indirect" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
                <marker id="arrow-imp-hover" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                </marker>
              </defs>

              {/* Render Visual Edges */}
              {visualEdges.map((edge) => {
                const srcNode = visualNodes.find((n) => n.id === edge.sourceId);
                const tgtNode = visualNodes.find((n) => n.id === edge.targetId);
                if (!srcNode || !tgtNode) return null;

                const isHovered = hoveredEdgeId === edge.id || hoveredNodeId === edge.sourceId || hoveredNodeId === edge.targetId;
                const strokeColor = isHovered
                  ? '#ef4444'
                  : srcNode.role === 'DIRECT' || tgtNode.role === 'DIRECT'
                  ? '#f97316'
                  : '#f59e0b';

                const dx = tgtNode.x - srcNode.x;
                const dy = tgtNode.y - srcNode.y;
                const cy1 = srcNode.y + dy * 0.3;
                const cy2 = tgtNode.y - dy * 0.3;
                const pathD = `M ${srcNode.x} ${srcNode.y} C ${srcNode.x + dx * 0.3} ${cy1}, ${tgtNode.x - dx * 0.3} ${cy2}, ${tgtNode.x} ${tgtNode.y}`;

                const midX = (srcNode.x + tgtNode.x) / 2;
                const midY = (srcNode.y + tgtNode.y) / 2;

                return (
                  <g key={edge.id} className="transition-all duration-200">
                    <path
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeDasharray={srcNode.role === 'INDIRECT' ? '6,4' : 'none'}
                      markerEnd={isHovered ? 'url(#arrow-imp-hover)' : 'url(#arrow-imp-direct)'}
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
                        x="-40"
                        y="-9"
                        width="80"
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
                        fill={isHovered ? '#ef4444' : '#fb923c'}
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {edge.relationshipType.length > 12 ? `${edge.relationshipType.slice(0, 10)}…` : edge.relationshipType}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>

            {/* Render Nodes as HTML Cards over Canvas */}
            <div className="absolute inset-0 pointer-events-none z-10">
              {visualNodes.map((vNode) => {
                const isSelected = selectedNodeId === vNode.id;
                const isHovered = hoveredNodeId === vNode.id;
                const roleBadge = getRoleBadge(vNode.role);

                return (
                  <div
                    key={vNode.id}
                    style={{
                      left: `${vNode.x}px`,
                      top: `${vNode.y}px`,
                      transform: 'translate(-50%, -50%)'
                    }}
                    className={`absolute pointer-events-auto transition-all duration-200 cursor-pointer group ${
                      vNode.role === 'TARGET' ? 'z-30' : isSelected || isHovered ? 'z-20 scale-105' : 'z-10'
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
                      className={`p-3 rounded-2xl border bg-[#070A12]/95 backdrop-blur shadow-xl min-w-[180px] max-w-[230px] transition-all ${
                        vNode.role === 'TARGET'
                          ? 'border-rose-500 ring-4 ring-rose-500/20 shadow-rose-500/30'
                          : vNode.role === 'DIRECT'
                          ? 'border-orange-500/80 ring-2 ring-orange-500/20 shadow-orange-500/20'
                          : vNode.role === 'INDIRECT'
                          ? 'border-amber-400/80 ring-1 ring-amber-400/20'
                          : vNode.role === 'API'
                          ? 'border-emerald-500/70'
                          : 'border-indigo-500/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border truncate ${roleBadge}`}>
                          {vNode.role === 'TARGET'
                            ? 'TARGET (REMOVAL)'
                            : vNode.role === 'DIRECT'
                            ? 'DIRECT IMPACT'
                            : vNode.role === 'INDIRECT'
                            ? 'INDIRECT IMPACT'
                            : vNode.role === 'API'
                            ? 'AFFECTED API'
                            : 'AFFECTED TEST'}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">Depth {vNode.depth}</span>
                      </div>

                      <h4 className="text-xs font-bold text-white truncate font-display" title={vNode.label}>
                        {vNode.label}
                      </h4>

                      {vNode.sublabel && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5" title={vNode.sublabel}>
                          {vNode.sublabel}
                        </p>
                      )}

                      <div className="mt-2 pt-1.5 flex items-center justify-between text-[9px] text-slate-400 border-t border-slate-800">
                        <span className="text-slate-400">{vNode.type}</span>
                        {vNode.sourceUrl && (
                          <a
                            href={vNode.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-cyan-400 hover:underline flex items-center gap-0.5"
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
          </>
        )}
      </div>

      {/* ── Visual Subgraph Footer Legend ───────────────────────────────────── */}
      <div className="px-4 py-2 bg-[#070A12]/95 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/30"></span>
            <span className="text-rose-300 font-bold">Target Node (Removal)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
            <span className="text-orange-300">Direct Impact (Depth 1)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span className="text-amber-300">Indirect Impact (Depth 2+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="text-emerald-300">Affected APIs / Tests</span>
          </div>
        </div>

        <div>
          <span>Click affected node to inspect details • Graph estimate based on AST edges</span>
        </div>
      </div>
    </div>
  );
};
