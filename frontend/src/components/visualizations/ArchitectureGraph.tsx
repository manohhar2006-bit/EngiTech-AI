/**
 * ArchitectureGraph — Structured Architecture Explorer for EngiTrace.
 *
 * Replaces radial force-directed graph with:
 *  1. Project Tree: Hierarchical codebase explorer (Repository → Directory → File → Component → Function/Dep).
 *  2. Focused Local Relationship Diagram: Local SVG/Card graph for selected entity (Used By / Depends On, max 15-20 nodes).
 *
 * Deterministic presentation with 0 physics jitter.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { GraphNode, GraphEdge, WhyGraphData, NodeType } from '../../types/graph';
import {
  Folder,
  FolderOpen,
  FileCode,
  Layers,
  Package,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  HelpCircle,
  Zap,
  Info,
  Box,
  Code,
  ShieldCheck,
  ExternalLink,
  Search,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArchitectureGraphProps {
  data?: WhyGraphData | null;
  onSelectNode?: (node: GraphNode | null) => void;
  onSelectEdge?: (edge: GraphEdge | null) => void;
  selectedNodeId?: string | null;
  highlightedNodeIds?: string[];
  targetNodeId?: string | null;
  directImpactNodeIds?: string[];
  indirectImpactNodeIds?: string[];
  isImpactMode?: boolean;
  searchQuery?: string;
  className?: string;
}

interface TreeNode {
  id: string; // unique tree path ID (e.g., "dir:packages/react" or node.id)
  name: string; // display label
  fullPath: string; // normalized path
  isDir: boolean;
  nodeType?: NodeType;
  graphNode?: GraphNode;
  children: TreeNode[];
}

const STRUCTURAL_TYPES = new Set<NodeType>([
  'FILE',
  'COMPONENT',
  'DEPENDENCY',
  'FUNCTION',
  'REPOSITORY',
]);

// Helper icon for node types
const getNodeTypeIcon = (type?: NodeType, isDir = false, expanded = false) => {
  if (isDir) {
    return expanded ? (
      <FolderOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
    ) : (
      <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
    );
  }
  switch (type) {
    case 'FILE':
      return <FileCode className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
    case 'COMPONENT':
      return <Layers className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />;
    case 'DEPENDENCY':
      return <Package className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />;
    case 'FUNCTION':
      return <Code className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
    case 'REPOSITORY':
      return <Box className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />;
    default:
      return <FileCode className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />;
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

export const ArchitectureGraph: React.FC<ArchitectureGraphProps> = ({
  data,
  onSelectNode,
  onSelectEdge,
  selectedNodeId,
  highlightedNodeIds = [],
  searchQuery = '',
  className = '',
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [localSearch, setLocalSearch] = useState<string>('');

  const activeSearch = searchQuery || localSearch;

  // ── Build Hierarchical Project Tree ─────────────────────────────────────────

  const { treeRoot, allNodesMap, nodePathMap } = useMemo(() => {
    if (!data) return { treeRoot: null, allNodesMap: new Map(), nodePathMap: new Map() };

    const nodesMap = new Map<string, GraphNode>();
    data.nodes.forEach((n) => nodesMap.set(n.id, n));

    const pathMap = new Map<string, string>();
    const rootChildren: TreeNode[] = [];
    const dirMap = new Map<string, TreeNode>();

    const getOrCreateDir = (dirPath: string): TreeNode => {
      if (dirMap.has(dirPath)) return dirMap.get(dirPath)!;

      const parts = dirPath.split('/');
      const name = parts[parts.length - 1];
      const dirNode: TreeNode = {
        id: `dir:${dirPath}`,
        name,
        fullPath: dirPath,
        isDir: true,
        graphNode: {
          id: `dir:${dirPath}`,
          type: 'FILE',
          label: name,
          sublabel: dirPath,
          metadata: {
            path: dirPath,
            description: `Directory: ${dirPath}`,
          },
        },
        children: [],
      };
      dirMap.set(dirPath, dirNode);

      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join('/');
        const parentDir = getOrCreateDir(parentPath);
        if (!parentDir.children.some((c) => c.id === dirNode.id)) {
          parentDir.children.push(dirNode);
        }
      } else {
        if (!rootChildren.some((c) => c.id === dirNode.id)) {
          rootChildren.push(dirNode);
        }
      }
      return dirNode;
    };

    // Process structural nodes
    const structNodes = data.nodes.filter((n) => STRUCTURAL_TYPES.has(n.type));

    structNodes.forEach((node) => {
      if (node.type === 'REPOSITORY') return;

      let normPath =
        (node.metadata?.path as string) ||
        (node.sublabel && node.sublabel.includes('/') ? node.sublabel : '') ||
        node.label;

      // Clean up path
      normPath = normPath.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!normPath) normPath = node.label;

      pathMap.set(node.id, normPath);

      const pathParts = normPath.split('/');
      const fileName = pathParts.pop() || node.label;
      const dirPath = pathParts.join('/');

      const leafTreeNode: TreeNode = {
        id: node.id,
        name: fileName,
        fullPath: normPath,
        isDir: false,
        nodeType: node.type,
        graphNode: node,
        children: [],
      };

      if (dirPath) {
        const parentDir = getOrCreateDir(dirPath);
        parentDir.children.push(leafTreeNode);
      } else {
        rootChildren.push(leafTreeNode);
      }
    });

    // Handle function nodes attached to files
    data.nodes
      .filter((n) => n.type === 'FUNCTION')
      .forEach((fnNode) => {
        if (rootChildren.some((c) => c.id === fnNode.id)) return;
        const parentFileName = fnNode.sublabel || '';
        if (parentFileName) {
          // Find matching file in tree
          for (const dirNode of dirMap.values()) {
            const matchFile = dirNode.children.find(
              (c) => c.name.toLowerCase() === parentFileName.toLowerCase() || c.fullPath.toLowerCase().endsWith(parentFileName.toLowerCase())
            );
            if (matchFile) {
              matchFile.children.push({
                id: fnNode.id,
                name: fnNode.label,
                fullPath: `${matchFile.fullPath} -> ${fnNode.label}`,
                isDir: false,
                nodeType: 'FUNCTION',
                graphNode: fnNode,
                children: [],
              });
              return;
            }
          }
        }
      });

    // Recursive sort: dirs first, then files
    const sortTree = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      nodes.forEach((n) => {
        if (n.children.length > 0) sortTree(n.children);
      });
    };

    sortTree(rootChildren);

    const rootNode: TreeNode = {
      id: 'root',
      name: 'Repository',
      fullPath: '',
      isDir: true,
      children: rootChildren,
    };

    return { treeRoot: rootNode, allNodesMap: nodesMap, nodePathMap: pathMap };
  }, [data]);

  // Auto-expand initial paths
  useEffect(() => {
    if (treeRoot && treeRoot.children.length > 0) {
      const initial = new Set<string>();
      treeRoot.children.forEach((c) => {
        if (c.isDir) initial.add(c.id);
      });
      setExpandedPaths(initial);
    }
  }, [treeRoot]);

  // Auto-expand parent directories of selected node
  useEffect(() => {
    if (!selectedNodeId || !nodePathMap.has(selectedNodeId)) return;
    const filePath = nodePathMap.get(selectedNodeId);
    if (!filePath) return;
    const parts = filePath.split('/');
    if (parts.length <= 1) return;

    setExpandedPaths((prev) => {
      const next = new Set(prev);
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        next.add(`dir:${currentPath}`);
      }
      return next;
    });
  }, [selectedNodeId, nodePathMap]);

  // Toggle tree expansion
  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Currently focused graph node
  const activeNode = useMemo(() => {
    if (selectedNodeId) {
      if (allNodesMap.has(selectedNodeId)) {
        return allNodesMap.get(selectedNodeId)!;
      }
      if (selectedNodeId.startsWith('dir:')) {
        const dirPath = selectedNodeId.replace(/^dir:/, '');
        return {
          id: selectedNodeId,
          type: 'FILE' as NodeType,
          label: dirPath.split('/').pop() || dirPath,
          sublabel: dirPath,
          metadata: {
            path: dirPath,
            description: `Directory: ${dirPath}`,
          },
        };
      }
    }
    return null;
  }, [selectedNodeId, allNodesMap]);

  // ── Compute Focused Local Relationship Map (Used By / Depends On) ───────────

  const focusedNeighborhood = useMemo(() => {
    if (!activeNode || !data) return { incoming: [], outgoing: [] };

    const nodeId = activeNode.id;

    const incomingEdges = data.edges.filter((e) => e.target === nodeId);
    const outgoingEdges = data.edges.filter((e) => e.source === nodeId);

    const incoming = incomingEdges
      .map((e) => ({
        edge: e,
        node: allNodesMap.get(e.source),
      }))
      .filter((item): item is { edge: GraphEdge; node: GraphNode } => Boolean(item.node))
      .slice(0, 10);

    const outgoing = outgoingEdges
      .map((e) => ({
        edge: e,
        node: allNodesMap.get(e.target),
      }))
      .filter((item): item is { edge: GraphEdge; node: GraphNode } => Boolean(item.node))
      .slice(0, 10);

    return { incoming, outgoing };
  }, [activeNode, data, allNodesMap]);

  // ── Render Tree Rows Recursively ───────────────────────────────────────────

  const renderTreeItem = (item: TreeNode, depth = 0): React.ReactNode => {
    const isExpanded = expandedPaths.has(item.id);
    const isSelected = item.graphNode && selectedNodeId === item.graphNode.id;
    const isHighlighted = item.graphNode && highlightedNodeIds.includes(item.graphNode.id);

    // Search filter check
    if (activeSearch) {
      const query = activeSearch.toLowerCase();
      const matchesSelf = item.name.toLowerCase().includes(query) || item.fullPath.toLowerCase().includes(query);
      const matchesChild = (nodes: TreeNode[]): boolean =>
        nodes.some((c) => c.name.toLowerCase().includes(query) || c.fullPath.toLowerCase().includes(query) || matchesChild(c.children));

      if (!matchesSelf && !matchesChild(item.children)) {
        return null;
      }
    }

    return (
      <div key={item.id} className="select-none">
        <div
          onClick={(e) => {
            if (item.isDir) {
              toggleExpand(item.id, e);
              if (item.graphNode && onSelectNode) {
                if (isSelected) {
                  onSelectNode(null);
                } else {
                  onSelectNode(item.graphNode);
                }
              }
            } else if (item.graphNode && onSelectNode) {
              if (isSelected) {
                onSelectNode(null);
              } else {
                onSelectNode(item.graphNode);
              }
            }
          }}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer text-xs font-mono transition group ${
            isSelected
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-sm'
              : isHighlighted
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'hover:bg-slate-900/80 text-slate-300 hover:text-white'
          }`}
        >
          {/* Caret icon for dir / expandable leaf */}
          {item.isDir || item.children.length > 0 ? (
            <button
              onClick={(e) => toggleExpand(item.id, e)}
              className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>
          ) : (
            <span className="w-3.5 h-3.5 flex-shrink-0" />
          )}

          {/* Node Icon */}
          {getNodeTypeIcon(item.nodeType, item.isDir, isExpanded)}

          {/* Label */}
          <span className="truncate flex-1">{item.name}</span>

          {/* Type badge for leaf items */}
          {!item.isDir && item.nodeType && (
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 flex-shrink-0 group-hover:border-slate-700">
              {item.nodeType}
            </span>
          )}
        </div>

        {/* Render children if expanded */}
        {(isExpanded || Boolean(activeSearch)) && item.children.length > 0 && (
          <div className="border-l border-slate-800/60 ml-3">
            {item.children.map((child) => renderTreeItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER SPLIT EXPLORER VIEW
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={`w-full h-full flex flex-col bg-[#05070C] font-mono text-slate-100 ${className}`}>
      {/* ── Explorer Header & Search ────────────────────────────────────────── */}
      <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Structured Architecture Explorer</span>
        </div>

        <div className="flex items-center gap-2">
          {!searchQuery && (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
              <Search className="w-3 h-3 text-slate-500" />
              <input
                type="text"
                placeholder="Filter tree..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="bg-transparent border-none text-slate-200 focus:outline-none w-28 text-xs font-mono"
              />
            </div>
          )}
          <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {data?.nodes.filter((n) => STRUCTURAL_TYPES.has(n.type)).length || 0} Entities
          </span>
        </div>
      </div>

      {/* ── Main Split View ─────────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 divide-y md:divide-y-0 md:divide-x divide-slate-800/80 overflow-hidden">

        {/* ── Left Column: Project Tree ────────────────────────────────────── */}
        <div className="md:col-span-5 flex flex-col min-h-0 bg-slate-950/40">
          <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-800/60 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Project File Hierarchy</span>
            <button
              onClick={() => {
                if (treeRoot) {
                  const all = new Set<string>();
                  const collect = (nodes: TreeNode[]) => {
                    nodes.forEach((n) => {
                      if (n.isDir) all.add(n.id);
                      if (n.children.length > 0) collect(n.children);
                    });
                  };
                  collect(treeRoot.children);
                  setExpandedPaths(expandedPaths.size > 0 ? new Set() : all);
                }
              }}
              className="text-[10px] text-cyan-400 hover:underline"
            >
              {expandedPaths.size > 0 ? 'Collapse All' : 'Expand All'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {treeRoot && treeRoot.children.length > 0 ? (
              treeRoot.children.map((child) => renderTreeItem(child, 0))
            ) : (
              <div className="p-4 text-center text-slate-500 text-xs">
                No structural entity data available in graph.
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column: Focused Local Relationship Diagram ────────────── */}
        <div className="md:col-span-7 flex flex-col min-h-0 bg-slate-950/80 p-4 overflow-y-auto custom-scrollbar">
          {activeNode ? (
            <div className="space-y-4">

              {/* Selected Entity Card */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getNodeTypeIcon(activeNode.type)}
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {activeNode.type}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate max-w-[200px]">
                        ID: {activeNode.id}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white font-display break-all">
                      {activeNode.label}
                    </h3>

                    {(activeNode.sublabel || activeNode.metadata?.path) && (
                      <p className="text-xs text-slate-400 font-mono break-all">
                        {(activeNode.metadata?.path as string) || activeNode.sublabel}
                      </p>
                    )}
                  </div>
                </div>

                {activeNode.metadata?.description && (
                  <p className="mt-3 text-xs text-slate-300 font-sans leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    {activeNode.metadata.description as string}
                  </p>
                )}
              </div>

              {/* Local Focused Relationship Canvas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Focused Relationship Map
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Local neighborhood (Max {focusedNeighborhood.incoming.length + focusedNeighborhood.outgoing.length} connections)
                  </span>
                </div>

                {/* INCOMING / CONSUMERS ("Used by") */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span>Used By / Consumers ({focusedNeighborhood.incoming.length})</span>
                  </div>

                  {focusedNeighborhood.incoming.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {focusedNeighborhood.incoming.map(({ edge, node }) => (
                        <div
                          key={edge.id}
                          onClick={() => onSelectNode && onSelectNode(node)}
                          className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/40 cursor-pointer transition group"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                              {edge.relationshipType || 'USES'}
                            </span>
                            <span className="text-[9px] text-slate-500">
                              {edge.classification || 'FACT'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getNodeTypeIcon(node.type)}
                            <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                              {node.label}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-[11px] text-slate-500 italic">
                      No direct incoming consumers found for this entity.
                    </div>
                  )}
                </div>

                {/* CENTER FOCUS DIVIDER */}
                <div className="flex items-center gap-2 py-1">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 uppercase tracking-widest">
                    Selected Focus
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
                </div>

                {/* OUTGOING / DEPENDENCIES ("Depends on") */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    <span>Depends On / Imports ({focusedNeighborhood.outgoing.length})</span>
                  </div>

                  {focusedNeighborhood.outgoing.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {focusedNeighborhood.outgoing.map(({ edge, node }) => (
                        <div
                          key={edge.id}
                          onClick={() => onSelectNode && onSelectNode(node)}
                          className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/40 cursor-pointer transition group"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                              {edge.relationshipType || 'DEPENDS_ON'}
                            </span>
                            <span className="text-[9px] text-slate-500">
                              {edge.classification || 'FACT'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getNodeTypeIcon(node.type)}
                            <span className="text-xs font-bold text-slate-200 group-hover:text-purple-300 truncate">
                              {node.label}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-[11px] text-slate-500 italic">
                      No direct outgoing dependencies found for this entity.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
              <Box className="w-8 h-8 text-slate-600 animate-pulse" />
              <p className="text-xs">Select any file, component, or module from the Project Tree on the left to view its structured relationship map.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
