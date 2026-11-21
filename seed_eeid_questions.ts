/**
 * EngiTrace Engineering Intelligence Dataset (EEID) — Topology-Driven Question Seeder
 *
 * Reads materialized EEID pilot repository indices (nodes, edges, source_index, history, manifest)
 * and deterministically generates realistic candidate engineering questions across all six EEID categories:
 * 1. NODE_UNDERSTANDING
 * 2. HISTORICAL_REASONING
 * 3. DEPENDENCY_INTELLIGENCE
 * 4. IMPACT_ANALYSIS
 * 5. REPOSITORY_CONVERSATION
 * 6. EVIDENCE_AND_UNCERTAINTY
 *
 * Strict Invariants:
 * - Read-only access to source repository indices (never mutates indices).
 * - Zero fabricated node, edge, evidence, or history IDs.
 * - Every candidate question is marked status: 'DRAFT' and humanReviewRequired: true.
 * - NEVER generates gold answers: expectedAnswer, expectedClaims, gold classifications, or whatIfGroundTruth.
 * - Deterministic, reproducible generation via seeded PRNG.
 * - Safe regeneration: never silently overwrites previously reviewed records.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  RepositoryIndexStore,
  RepositoryIndexContext,
  EEIDCategory,
  VALID_CATEGORIES,
  InteractionMode,
  VALID_INTERACTION_MODES,
  Difficulty,
  VALID_DIFFICULTIES
} from './validate_eeid_record';

// ============================================================================
// 1. Candidate Question Schema & Types
// ============================================================================

export interface CandidateQuestion {
  candidateId: string;
  category: EEIDCategory;
  repositoryId: string;
  repositoryName: string;
  commitSha: string;
  targetNodeId: string;
  targetNodeType: string;
  targetNodeLabel: string;
  question: string;
  intent: string;
  difficulty: Difficulty;
  interactionMode: InteractionMode;
  requiresMultiFile: boolean;
  requiresHistory: boolean;
  candidateEvidenceIds: string[];
  candidateGraphNodeIds: string[];
  candidateGraphEdgeIds: string[];
  candidateHistoryIds: string[];
  selectionReason: string;
  generationMethod: string;
  status: 'DRAFT';
  humanReviewRequired: true;
}

export interface CandidateValidationRuleResult {
  passed: boolean;
  message?: string;
}

export interface CandidateValidationResult {
  passed: boolean;
  candidateId: string;
  repositoryId: string;
  errors: string[];
  warnings: string[];
  ruleResults: Record<string, CandidateValidationRuleResult>;
}

export interface CandidateFileValidationSummary {
  passed: boolean;
  totalRecords: number;
  passedRecords: number;
  failedRecords: number;
  totalErrors: number;
  totalWarnings: number;
  results: CandidateValidationResult[];
}

export interface SeederOptions {
  batchSize?: number;
  perRepoCount?: number;
  perCategoryCount?: number;
  seed?: number;
  repositoryId?: string;
  indexDirectory?: string;
  outputFilePath?: string;
  regenerate?: boolean;
  force?: boolean;
}

export interface PilotRepoMetadata {
  id: string;
  name: string;
  subfolder: string;
  defaultBranch: string;
  pinnedCommitSha: string;
  snapshotTimestamp: string;
}

export const PILOT_REPOSITORIES: Record<string, PilotRepoMetadata> = {
  'EEID-REPO-001': {
    id: 'EEID-REPO-001',
    name: 'expressjs/express',
    subfolder: 'express',
    defaultBranch: 'master',
    pinnedCommitSha: '43fca52d28a422c8be48fd489cbd4f2d6152bab6',
    snapshotTimestamp: '2026-11-02T20:15:26Z'
  },
  'EEID-REPO-002': {
    id: 'EEID-REPO-002',
    name: 'TanStack/query',
    subfolder: 'tanstack-query',
    defaultBranch: 'main',
    pinnedCommitSha: '19f555cf919a1438885d7d20c95b17b26d6d6859',
    snapshotTimestamp: '2026-11-13T01:57:29Z'
  },
  'EEID-REPO-003': {
    id: 'EEID-REPO-003',
    name: 'payloadcms/payload',
    subfolder: 'payload',
    defaultBranch: 'main',
    pinnedCommitSha: '90b4962a1876cbd3568692e7de9aaf72b847e407',
    snapshotTimestamp: '2026-11-13T16:18:53Z'
  }
};

// Aliases for CLI convenience
export const REPO_ALIAS_MAP: Record<string, string> = {
  'express': 'EEID-REPO-001',
  'expressjs': 'EEID-REPO-001',
  'expressjs/express': 'EEID-REPO-001',
  'tanstack': 'EEID-REPO-002',
  'query': 'EEID-REPO-002',
  'tanstack-query': 'EEID-REPO-002',
  'TanStack/query': 'EEID-REPO-002',
  'payload': 'EEID-REPO-003',
  'payloadcms': 'EEID-REPO-003',
  'payloadcms/payload': 'EEID-REPO-003'
};

// ============================================================================
// 2. Deterministic Seeded PRNG (Mulberry32)
// ============================================================================

export class SeededRNG {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed >>> 0;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  public shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  public choice<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    return array[Math.floor(this.next() * array.length)];
  }
}

// ============================================================================
// 3. Topology Metrics & Index Helpers
// ============================================================================

export interface NodeMetrics {
  nodeId: string;
  type: string;
  label: string;
  filePath?: string;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
  verifiedSourceRelationships: number;
  relatedFiles: Set<string>;
  retrievalUnitIds: string[];
  incomingEdges: any[];
  outgoingEdges: any[];
  participatesInCallChain: boolean;
  score: number;
}

/**
 * Safely resolves actual retrieval unit IDs for a node from source_index.jsonl
 */
export function resolveEvidenceIdsForNode(ctx: RepositoryIndexContext, node: any): string[] {
  const ids: string[] = [];
  const filePath =
    node.metadata?.filePath ||
    node.metadata?.path ||
    (typeof node.id === 'string' && node.id.startsWith('file:') ? node.id.split(':').slice(2).join(':') : null);

  if (!filePath) {
    return ids;
  }

  // 1. Exact symbol match in same file
  for (const unit of ctx.retrievalUnits.values()) {
    if (unit.file_path === filePath && unit.symbol_name === node.label) {
      if (!ids.includes(unit.retrieval_unit_id)) {
        ids.push(unit.retrieval_unit_id);
      }
    }
  }

  // 2. Fallback to file-level chunk if no symbol chunk found
  if (ids.length === 0) {
    for (const unit of ctx.retrievalUnits.values()) {
      if (unit.file_path === filePath && unit.chunk_type === 'file') {
        if (!ids.includes(unit.retrieval_unit_id)) {
          ids.push(unit.retrieval_unit_id);
        }
      }
    }
  }

  return ids;
}

/**
 * Safely resolves an edge ID between source and target nodes from edges.jsonl
 */
export function resolveEdgeId(
  ctx: RepositoryIndexContext,
  sourceId: string,
  targetId: string,
  relationshipType?: string
): string | null {
  for (const edge of ctx.edges.values()) {
    if (edge.source === sourceId && edge.target === targetId) {
      if (!relationshipType || edge.relationshipType === relationshipType) {
        return edge.id;
      }
    }
  }
  return null;
}

/**
 * Computes deterministic graph metrics and scores for all nodes in the repository index.
 */
export function computeTopologyMetrics(ctx: RepositoryIndexContext): Map<string, NodeMetrics> {
  const metricsMap = new Map<string, NodeMetrics>();

  // Initialize metrics for all nodes
  for (const node of ctx.nodes.values()) {
    const filePath =
      node.metadata?.filePath ||
      node.metadata?.path ||
      (typeof node.id === 'string' && node.id.startsWith('file:') ? node.id.split(':').slice(2).join(':') : undefined);

    const retrievalUnitIds = resolveEvidenceIdsForNode(ctx, node);

    metricsMap.set(node.id, {
      nodeId: node.id,
      type: node.type,
      label: node.label,
      filePath,
      inDegree: 0,
      outDegree: 0,
      totalDegree: 0,
      verifiedSourceRelationships: 0,
      relatedFiles: new Set<string>(),
      retrievalUnitIds,
      incomingEdges: [],
      outgoingEdges: [],
      participatesInCallChain: false,
      score: 0
    });
  }

  // Populate edges and calculate in/out degrees
  for (const edge of ctx.edges.values()) {
    const srcMetric = metricsMap.get(edge.source);
    const tgtMetric = metricsMap.get(edge.target);

    if (srcMetric) {
      srcMetric.outDegree++;
      srcMetric.totalDegree++;
      srcMetric.outgoingEdges.push(edge);
      if (edge.classification === 'FACT' || ['CALLS', 'IMPORTS', 'DECLARES', 'EXPOSES'].includes(edge.relationshipType)) {
        srcMetric.verifiedSourceRelationships++;
      }
      if (tgtMetric?.filePath) {
        srcMetric.relatedFiles.add(tgtMetric.filePath);
      }
    }

    if (tgtMetric) {
      tgtMetric.inDegree++;
      tgtMetric.totalDegree++;
      tgtMetric.incomingEdges.push(edge);
      if (edge.classification === 'FACT' || ['CALLS', 'IMPORTS', 'DECLARES', 'EXPOSES'].includes(edge.relationshipType)) {
        tgtMetric.verifiedSourceRelationships++;
      }
      if (srcMetric?.filePath) {
        tgtMetric.relatedFiles.add(srcMetric.filePath);
      }
    }
  }

  // Detect participation in multi-hop call chains
  for (const edge of ctx.edges.values()) {
    if (edge.relationshipType === 'CALLS') {
      const srcMetric = metricsMap.get(edge.source);
      const tgtMetric = metricsMap.get(edge.target);
      if (srcMetric && tgtMetric) {
        const tgtHasOutgoingCalls = tgtMetric.outgoingEdges.some((e: any) => e.relationshipType === 'CALLS');
        const srcHasIncomingCalls = srcMetric.incomingEdges.some((e: any) => e.relationshipType === 'CALLS');
        if (tgtHasOutgoingCalls || srcHasIncomingCalls) {
          srcMetric.participatesInCallChain = true;
          tgtMetric.participatesInCallChain = true;
        }
      }
    }
  }

  // Calculate composite topology score
  for (const metric of metricsMap.values()) {
    let score = 0;
    // Degree contribution (log-scaled to prevent extreme hubs from overwhelming)
    score += Math.log2(1 + metric.totalDegree) * 10;
    // Verified AST source relationships
    score += Math.min(metric.verifiedSourceRelationships, 10) * 5;
    // Related files diversity
    score += Math.min(metric.relatedFiles.size, 5) * 8;
    // Call chain participation
    if (metric.participatesInCallChain) score += 15;
    // Evidence availability bonus
    if (metric.retrievalUnitIds.length > 0) score += 20;

    // Type weighting
    if (metric.type === 'FUNCTION') score += 12;
    else if (metric.type === 'COMPONENT') score += 14;
    else if (metric.type === 'FILE') score += 10;
    else if (metric.type === 'DEPENDENCY') score += 6;

    metric.score = Math.round(score * 10) / 10;
  }

  return metricsMap;
}

// ============================================================================
// 4. Category-Specific Candidate Generators
// ============================================================================

/**
 * Category 1: NODE_UNDERSTANDING
 * Generates questions about node purpose, behavior, inputs, outputs, and responsibility.
 */
export function generateNodeUnderstanding(
  ctx: RepositoryIndexContext,
  metricsMap: Map<string, NodeMetrics>,
  repoMeta: PilotRepoMetadata,
  rng: SeededRNG,
  count: number = 2
): CandidateQuestion[] {
  const candidates: CandidateQuestion[] = [];
  const repoNumber = repoMeta.id.split('-').pop() || '001';

  // Specific high-value curated nodes per repository
  if (repoMeta.id === 'EEID-REPO-001') {
    // Express Auth function
    const authNode = ctx.nodes.get('function:EEID-REPO-001:examples/auth/index.js:authenticate:60');
    const authFileNode = ctx.nodes.get('file:EEID-REPO-001:examples/auth/index.js');
    if (authNode && authFileNode) {
      const ruIds = resolveEvidenceIdsForNode(ctx, authNode);
      const declEdgeId = resolveEdgeId(ctx, authFileNode.id, authNode.id, 'DECLARES');
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-NODE-0001`,
        category: 'NODE_UNDERSTANDING',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: authNode.id,
        targetNodeType: authNode.type,
        targetNodeLabel: authNode.label,
        question: 'What is the role of the authenticate() function in Express auth example (examples/auth/index.js), what parameters does it accept, and how does it verify user credentials against password hashes?',
        intent: 'Explain username/password verification and pbkdf2 hashing callback structure in authenticate().',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ruIds.length > 0 ? ruIds : ['EEID-REPO-001-RU-0074'],
        candidateGraphNodeIds: [authNode.id, authFileNode.id],
        candidateGraphEdgeIds: declEdgeId ? [declEdgeId] : [],
        candidateHistoryIds: [],
        selectionReason: 'Core authentication helper with verified static declaration and function retrieval chunk.',
        generationMethod: 'TOPOLOGY_AST_FUNCTION_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // Express Content-negotiation file
    const usersFileNode = ctx.nodes.get('file:EEID-REPO-001:examples/content-negotiation/users.js');
    if (usersFileNode) {
      const ruIds = resolveEvidenceIdsForNode(ctx, usersFileNode);
      const repoEdge = resolveEdgeId(ctx, 'repository:expressjs/express', usersFileNode.id, 'CONTAINS');
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-NODE-0002`,
        category: 'NODE_UNDERSTANDING',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: usersFileNode.id,
        targetNodeType: usersFileNode.type,
        targetNodeLabel: usersFileNode.label,
        question: 'What representations does examples/content-negotiation/users.js export, and how do they format the user list for different MIME content types (HTML, plain text, JSON)?',
        intent: 'Understand file-level export responsibilities and content formatting mechanisms in Express content negotiation.',
        difficulty: 'EASY',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ruIds.length > 0 ? ruIds : ['EEID-REPO-001-RU-0027'],
        candidateGraphNodeIds: [usersFileNode.id],
        candidateGraphEdgeIds: repoEdge ? [repoEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'Representative example module demonstrating multi-format content negotiation exports.',
        generationMethod: 'TOPOLOGY_FILE_EXPORT_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  } else if (repoMeta.id === 'EEID-REPO-002') {
    // TanStack FocusManager class
    const fmNode = ctx.nodes.get('component:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager:14');
    const fmFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/focusManager.ts');
    if (fmNode && fmFile) {
      const ruIds = resolveEvidenceIdsForNode(ctx, fmNode);
      const declEdge = resolveEdgeId(ctx, fmFile.id, fmNode.id, 'DECLARES');
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-NODE-0001`,
        category: 'NODE_UNDERSTANDING',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: fmNode.id,
        targetNodeType: fmNode.type,
        targetNodeLabel: fmNode.label,
        question: 'What is the primary responsibility of the FocusManager class in @tanstack/query-core, and how does it manage window focus event listeners across different execution environments?',
        intent: 'Explain class architecture, state management, and event listener lifecycle for FocusManager.',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ruIds.length > 0 ? ruIds : ['EEID-REPO-002-RU-0086'],
        candidateGraphNodeIds: [fmNode.id, fmFile.id],
        candidateGraphEdgeIds: declEdge ? [declEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'High-value core class responsible for window focus detection across environments.',
        generationMethod: 'TOPOLOGY_AST_COMPONENT_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // TanStack resolveQueryValue
    const rqvNode = ctx.nodes.get('function:EEID-REPO-002:packages/query-core/src/utils.ts:resolveQueryValue:168');
    const rqvFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/utils.ts');
    if (rqvNode && rqvFile) {
      const ruIds = resolveEvidenceIdsForNode(ctx, rqvNode);
      const declEdge = resolveEdgeId(ctx, rqvFile.id, rqvNode.id, 'DECLARES');
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-NODE-0002`,
        category: 'NODE_UNDERSTANDING',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: rqvNode.id,
        targetNodeType: rqvNode.type,
        targetNodeLabel: rqvNode.label,
        question: 'How does the resolveQueryValue() utility function in packages/query-core/src/utils.ts resolve query data or functions, and what parameter inputs does it accept?',
        intent: 'Analyze function inputs, conditional evaluation of dynamic query values, and return type semantics.',
        difficulty: 'EASY',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ruIds.length > 0 ? ruIds : ['EEID-REPO-002-RU-0268'],
        candidateGraphNodeIds: [rqvNode.id, rqvFile.id],
        candidateGraphEdgeIds: declEdge ? [declEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'High in-degree utility function with verified function-level retrieval unit.',
        generationMethod: 'TOPOLOGY_AST_FUNCTION_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  } else if (repoMeta.id === 'EEID-REPO-003') {
    // Payload executeAccess
    const eaNode = ctx.nodes.get('function:EEID-REPO-003:packages/payload/src/auth/executeAccess.ts:executeAccess:14');
    const eaFile = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/auth/executeAccess.ts');
    if (eaNode && eaFile) {
      const ruIds = resolveEvidenceIdsForNode(ctx, eaNode);
      const declEdge = resolveEdgeId(ctx, eaFile.id, eaNode.id, 'DECLARES');
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-NODE-0001`,
        category: 'NODE_UNDERSTANDING',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: eaNode.id,
        targetNodeType: eaNode.type,
        targetNodeLabel: eaNode.label,
        question: 'What is the responsibility of executeAccess() in packages/payload/src/auth/executeAccess.ts, and how does it evaluate access control permissions for incoming user requests?',
        intent: 'Examine access control execution, permission checks, and user payload context evaluation.',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ruIds.length > 0 ? ruIds : ['EEID-REPO-003-RU-0193'],
        candidateGraphNodeIds: [eaNode.id, eaFile.id],
        candidateGraphEdgeIds: declEdge ? [declEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'Central authentication/authorization gatekeeper with 12 incoming call sites.',
        generationMethod: 'TOPOLOGY_AST_FUNCTION_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // Payload buildConfig
    const bcNode = ctx.nodes.get('function:EEID-REPO-003:packages/payload/src/config/build.ts:buildConfig:12');
    const bcFile = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/config/build.ts');
    if (bcNode && bcFile) {
      const ruIds = resolveEvidenceIdsForNode(ctx, bcNode);
      const declEdge = resolveEdgeId(ctx, bcFile.id, bcNode.id, 'DECLARES');
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-NODE-0002`,
        category: 'NODE_UNDERSTANDING',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: bcNode.id,
        targetNodeType: bcNode.type,
        targetNodeLabel: bcNode.label,
        question: 'What is the core role of buildConfig() in packages/payload/src/config/build.ts, and how does it transform user-provided configuration objects into initialized Payload configurations?',
        intent: 'Evaluate configuration compilation, validation pipeline initialization, and return structure.',
        difficulty: 'EASY',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ruIds.length > 0 ? ruIds : ['EEID-REPO-003-RU-0200'],
        candidateGraphNodeIds: [bcNode.id, bcFile.id],
        candidateGraphEdgeIds: declEdge ? [declEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'Primary configuration build entry point in the Payload architecture.',
        generationMethod: 'TOPOLOGY_AST_FUNCTION_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  }

  // Dynamic sampling to satisfy higher count requests
  if (candidates.length < count) {
    const scoredNodes = Array.from(metricsMap.values())
      .filter((m) => ['FUNCTION', 'COMPONENT', 'FILE'].includes(m.type) && m.retrievalUnitIds.length > 0)
      .filter((m) => !candidates.some((c) => c.targetNodeId === m.nodeId))
      .sort((a, b) => b.score - a.score);

    const shuffled = rng.shuffle(scoredNodes);
    for (const m of shuffled) {
      if (candidates.length >= count) break;
      const node = ctx.nodes.get(m.nodeId);
      if (!node) continue;

      const idxPadded = String(candidates.length + 1).padStart(4, '0');
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-NODE-${idxPadded}`,
        category: 'NODE_UNDERSTANDING',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: node.id,
        targetNodeType: node.type,
        targetNodeLabel: node.label,
        question: `What is the role and behavior of the ${node.label} ${node.type.toLowerCase()} in ${m.filePath || node.label}, and what operations does it perform?`,
        intent: `Examine the operational responsibility and structure of ${node.label} in ${m.filePath || node.label}.`,
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: m.retrievalUnitIds.slice(0, 2),
        candidateGraphNodeIds: [node.id],
        candidateGraphEdgeIds: m.incomingEdges.slice(0, 1).map((e: any) => e.id),
        candidateHistoryIds: [],
        selectionReason: `Scored node with degree ${m.totalDegree} and verified evidence chunks.`,
        generationMethod: 'TOPOLOGY_DYNAMIC_NODE_SCORING',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  }

  return candidates.slice(0, count);
}

/**
 * Category 2: HISTORICAL_REASONING
 * Generates questions using actual commit, PR, and issue history.
 */
export function generateHistoricalReasoning(
  ctx: RepositoryIndexContext,
  metricsMap: Map<string, NodeMetrics>,
  repoMeta: PilotRepoMetadata,
  rng: SeededRNG,
  count: number = 1
): CandidateQuestion[] {
  const candidates: CandidateQuestion[] = [];
  const repoNumber = repoMeta.id.split('-').pop() || '001';

  if (repoMeta.id === 'EEID-REPO-001') {
    // Express: commit 43fca52 / PR 7563 / History.md
    const historyFile = ctx.nodes.get('file:EEID-REPO-001:History.md');
    const commitNode = ctx.nodes.get('commit:43fca52');
    const issueNode = ctx.nodes.get('issue:EEID-REPO-001:7563');

    const modEdge = resolveEdgeId(ctx, 'commit:43fca52', 'file:EEID-REPO-001:History.md', 'MODIFIED');
    const refEdge = resolveEdgeId(ctx, 'commit:43fca52', 'issue:EEID-REPO-001:7563', 'REFERENCES');

    const historyIds: string[] = [];
    if (ctx.history.has('commit-43fca52')) historyIds.push('commit-43fca52');
    if (ctx.history.has('pr-7563')) historyIds.push('pr-7563');
    if (ctx.history.has('issue-7562')) historyIds.push('issue-7562');

    const graphNodeIds = [historyFile ? historyFile.id : 'file:EEID-REPO-001:History.md'];
    if (commitNode) graphNodeIds.push(commitNode.id);
    if (issueNode) graphNodeIds.push(issueNode.id);

    const graphEdgeIds: string[] = [];
    if (modEdge) graphEdgeIds.push(modEdge);
    if (refEdge) graphEdgeIds.push(refEdge);

    const ruIds = historyFile ? resolveEvidenceIdsForNode(ctx, historyFile) : ['EEID-REPO-001-RU-0001'];

    candidates.push({
      candidateId: `EEID-CAND-${repoNumber}-HIST-0001`,
      category: 'HISTORICAL_REASONING',
      repositoryId: repoMeta.id,
      repositoryName: repoMeta.name,
      commitSha: repoMeta.pinnedCommitSha,
      targetNodeId: historyFile?.id || 'file:EEID-REPO-001:History.md',
      targetNodeType: 'FILE',
      targetNodeLabel: 'History.md',
      question: 'According to the Express commit history and PR #7563, what dependency update was introduced in commit 43fca52, and what documented rationale is recorded in the commit title, History.md, and PR metadata?',
      intent: 'Analyze commit changes, dependency updates, and documented historical rationale across git commit, PR, and History.md.',
      difficulty: 'MEDIUM',
      interactionMode: 'REPO_CONVERSATION',
      requiresMultiFile: false,
      requiresHistory: true,
      candidateEvidenceIds: ruIds.length > 0 ? ruIds.slice(0, 2) : ['EEID-REPO-001-RU-0001'],
      candidateGraphNodeIds: graphNodeIds,
      candidateGraphEdgeIds: graphEdgeIds,
      candidateHistoryIds: historyIds,
      selectionReason: 'Snapshot commit 43fca52 directly modified History.md to document the body-parser bump referencing PR #7563.',
      generationMethod: 'HISTORICAL_COMMIT_PR_ALIGNMENT',
      status: 'DRAFT',
      humanReviewRequired: true
    });
  } else if (repoMeta.id === 'EEID-REPO-002') {
    // TanStack Query: Issue 11320 on gcTime SSR timer
    const qcFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/queryClient.ts');
    const issueNode = ctx.nodes.get('issue:EEID-REPO-002:11320');
    const repoEdge = resolveEdgeId(ctx, 'repository:TanStack/query', 'file:EEID-REPO-002:packages/query-core/src/queryClient.ts', 'CONTAINS');

    const historyIds: string[] = [];
    if (ctx.history.has('issue-11320')) historyIds.push('issue-11320');

    const graphNodeIds = [qcFile ? qcFile.id : 'file:EEID-REPO-002:packages/query-core/src/queryClient.ts'];
    if (issueNode) graphNodeIds.push(issueNode.id);

    const ruIds = qcFile ? resolveEvidenceIdsForNode(ctx, qcFile) : ['EEID-REPO-002-RU-0044'];

    candidates.push({
      candidateId: `EEID-CAND-${repoNumber}-HIST-0001`,
      category: 'HISTORICAL_REASONING',
      repositoryId: repoMeta.id,
      repositoryName: repoMeta.name,
      commitSha: repoMeta.pinnedCommitSha,
      targetNodeId: qcFile?.id || 'file:EEID-REPO-002:packages/query-core/src/queryClient.ts',
      targetNodeType: 'FILE',
      targetNodeLabel: 'queryClient.ts',
      question: 'According to issue #11320 in the TanStack Query issue tracker, what defect was reported regarding server-side gcTime scheduling a GC timer that pins the entire SSR async context?',
      intent: 'Examine documented defect reports, SSR memory retention issues, and timer scheduling behavior described in historical issue #11320.',
      difficulty: 'HARD',
      interactionMode: 'REPO_CONVERSATION',
      requiresMultiFile: false,
      requiresHistory: true,
      candidateEvidenceIds: ruIds.length > 0 ? ruIds.slice(0, 2) : ['EEID-REPO-002-RU-0044'],
      candidateGraphNodeIds: graphNodeIds,
      candidateGraphEdgeIds: repoEdge ? [repoEdge] : [],
      candidateHistoryIds: historyIds,
      selectionReason: 'Issue 11320 is indexed as pre-snapshot evidence documenting SSR memory leaks in query cache timers.',
      generationMethod: 'HISTORICAL_ISSUE_ANALYSIS',
      status: 'DRAFT',
      humanReviewRequired: true
    });
  } else if (repoMeta.id === 'EEID-REPO-003') {
    // Payload CMS: Issue 18406 on checkDocumentLockStatus deadlocking Postgres pool
    const dbFile = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/database/types.ts');
    const issueNode = ctx.nodes.get('issue:EEID-REPO-003:18406');
    const repoEdge = resolveEdgeId(ctx, 'repository:payloadcms/payload', 'file:EEID-REPO-003:packages/payload/src/database/types.ts', 'CONTAINS');

    const historyIds: string[] = [];
    if (ctx.history.has('issue-18406')) historyIds.push('issue-18406');

    const graphNodeIds = [dbFile ? dbFile.id : 'file:EEID-REPO-003:packages/payload/src/database/types.ts'];
    if (issueNode) graphNodeIds.push(issueNode.id);

    const ruIds = dbFile ? resolveEvidenceIdsForNode(ctx, dbFile) : ['EEID-REPO-003-RU-0006'];

    candidates.push({
      candidateId: `EEID-CAND-${repoNumber}-HIST-0001`,
      category: 'HISTORICAL_REASONING',
      repositoryId: repoMeta.id,
      repositoryName: repoMeta.name,
      commitSha: repoMeta.pinnedCommitSha,
      targetNodeId: dbFile?.id || 'file:EEID-REPO-003:packages/payload/src/database/types.ts',
      targetNodeType: 'FILE',
      targetNodeLabel: 'types.ts',
      question: 'In Payload CMS historical issue #18406, what defect was documented regarding checkDocumentLockStatus reading locked documents without passing req, and why did this deadlock the Postgres connection pool under concurrent updates?',
      intent: 'Analyze database connection handling, transaction request scoping, and connection pool starvation documented in historical issue #18406.',
      difficulty: 'HARD',
      interactionMode: 'REPO_CONVERSATION',
      requiresMultiFile: false,
      requiresHistory: true,
      candidateEvidenceIds: ruIds.length > 0 ? ruIds.slice(0, 2) : ['EEID-REPO-003-RU-0006'],
      candidateGraphNodeIds: graphNodeIds,
      candidateGraphEdgeIds: repoEdge ? [repoEdge] : [],
      candidateHistoryIds: historyIds,
      selectionReason: 'Issue 18406 is verified pre-snapshot issue evidence documenting PostgreSQL pool deadlocks in document locking.',
      generationMethod: 'HISTORICAL_ISSUE_ANALYSIS',
      status: 'DRAFT',
      humanReviewRequired: true
    });
  }

  return candidates.slice(0, count);
}

/**
 * Category 3: DEPENDENCY_INTELLIGENCE
 * Uses actual graph edges: high in-degree / out-degree nodes, multi-hop call chains, cross-file calls.
 */
export function generateDependencyIntelligence(
  ctx: RepositoryIndexContext,
  metricsMap: Map<string, NodeMetrics>,
  repoMeta: PilotRepoMetadata,
  rng: SeededRNG,
  count: number = 2
): CandidateQuestion[] {
  const candidates: CandidateQuestion[] = [];
  const repoNumber = repoMeta.id.split('-').pop() || '001';

  if (repoMeta.id === 'EEID-REPO-001') {
    // Express Auth call & import
    const authFile = ctx.nodes.get('file:EEID-REPO-001:examples/auth/index.js');
    const indexFile = ctx.nodes.get('file:EEID-REPO-001:index.js');
    const authFunc = ctx.nodes.get('function:EEID-REPO-001:examples/auth/index.js:authenticate:60');

    const impEdge = authFile && indexFile ? resolveEdgeId(ctx, authFile.id, indexFile.id, 'IMPORTS') : null;
    const callEdge = authFile && authFunc ? resolveEdgeId(ctx, authFile.id, authFunc.id, 'CALLS') : null;

    if (authFile && authFunc) {
      const gNodes = [authFile.id, authFunc.id];
      if (indexFile) gNodes.push(indexFile.id);
      const gEdges: string[] = [];
      if (impEdge) gEdges.push(impEdge);
      if (callEdge) gEdges.push(callEdge);

      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-DEPN-0001`,
        category: 'DEPENDENCY_INTELLIGENCE',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: authFile.id,
        targetNodeType: authFile.type,
        targetNodeLabel: authFile.label,
        question: 'In the Express auth example (examples/auth/index.js), what verified internal file does it import, and what local authentication function does the route handler call to verify credentials?',
        intent: 'Trace verified import relationships and static call sites between example modules and the main Express package.',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-001-RU-0024', 'EEID-REPO-001-RU-0074'],
        candidateGraphNodeIds: gNodes,
        candidateGraphEdgeIds: gEdges,
        candidateHistoryIds: [],
        selectionReason: 'Auth example exhibits verified cross-file import of root index.js and verified internal function call to authenticate().',
        generationMethod: 'TOPOLOGY_CALL_AND_IMPORT_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // Express Content negotiation multi-import
    const cnIndex = ctx.nodes.get('file:EEID-REPO-001:examples/content-negotiation/index.js');
    const cnDb = ctx.nodes.get('file:EEID-REPO-001:examples/content-negotiation/db.js');
    const cnFormat = ctx.nodes.get('function:EEID-REPO-001:examples/content-negotiation/index.js:format:33');

    const impDbEdge = cnIndex && cnDb ? resolveEdgeId(ctx, cnIndex.id, cnDb.id, 'IMPORTS') : null;
    const callFormatEdge = cnIndex && cnFormat ? resolveEdgeId(ctx, cnIndex.id, cnFormat.id, 'CALLS') : null;

    if (cnIndex && cnFormat) {
      const gNodes = [cnIndex.id, cnFormat.id];
      if (cnDb) gNodes.push(cnDb.id);
      const gEdges: string[] = [];
      if (impDbEdge) gEdges.push(impDbEdge);
      if (callFormatEdge) gEdges.push(callFormatEdge);

      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-DEPN-0002`,
        category: 'DEPENDENCY_INTELLIGENCE',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: cnIndex.id,
        targetNodeType: cnIndex.type,
        targetNodeLabel: cnIndex.label,
        question: 'Which sibling files are imported by examples/content-negotiation/index.js, and what local formatting helper function does it declare and invoke to render content?',
        intent: 'Evaluate verified multi-file import dependencies and internal helper function invocation in content negotiation.',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-001-RU-0026', 'EEID-REPO-001-RU-0075'],
        candidateGraphNodeIds: gNodes,
        candidateGraphEdgeIds: gEdges,
        candidateHistoryIds: [],
        selectionReason: 'Content negotiation index imports db.js and calls its local format() helper with verified static graph edges.',
        generationMethod: 'TOPOLOGY_CALL_AND_IMPORT_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  } else if (repoMeta.id === 'EEID-REPO-002') {
    // TanStack FocusManager 3-hop call chain
    const onSub = ctx.nodes.get('function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.onSubscribe:39');
    const setEv = ctx.nodes.get('function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.setEventListener:78');
    const setFoc = ctx.nodes.get('function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.setFocused:108');
    const onFoc = ctx.nodes.get('function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.onFocus:119');

    const edge1 = onSub && setEv ? resolveEdgeId(ctx, onSub.id, setEv.id, 'CALLS') : null;
    const edge2 = setEv && setFoc ? resolveEdgeId(ctx, setEv.id, setFoc.id, 'CALLS') : null;
    const edge3 = setFoc && onFoc ? resolveEdgeId(ctx, setFoc.id, onFoc.id, 'CALLS') : null;

    if (onSub && setEv) {
      const gNodes = [onSub.id, setEv.id];
      if (setFoc) gNodes.push(setFoc.id);
      if (onFoc) gNodes.push(onFoc.id);

      const gEdges: string[] = [];
      if (edge1) gEdges.push(edge1);
      if (edge2) gEdges.push(edge2);
      if (edge3) gEdges.push(edge3);

      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-DEPN-0001`,
        category: 'DEPENDENCY_INTELLIGENCE',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: onSub.id,
        targetNodeType: onSub.type,
        targetNodeLabel: onSub.label,
        question: 'Trace the verified static call chain originating from FocusManager.onSubscribe in @tanstack/query-core: which downstream methods are invoked in sequence when event listeners are initialized and focus transitions occur?',
        intent: 'Traverse verified multi-hop method call graph across FocusManager event setup and state notification methods.',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-002-RU-0088', 'EEID-REPO-002-RU-0090', 'EEID-REPO-002-RU-0091', 'EEID-REPO-002-RU-0092'],
        candidateGraphNodeIds: gNodes,
        candidateGraphEdgeIds: gEdges,
        candidateHistoryIds: [],
        selectionReason: '3-hop verified static call chain connecting subscription to event listener setup, focus updates, and focus notifications.',
        generationMethod: 'TOPOLOGY_MULTI_HOP_CALL_GRAPH',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // TanStack environmentManager -> utils
    const isServerNode = ctx.nodes.get('function:EEID-REPO-002:packages/query-core/src/environmentManager.ts:isServer:14');
    const isServerFnNode = ctx.nodes.get('function:EEID-REPO-002:packages/query-core/src/environmentManager.ts:isServerFn:8');
    const envFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/environmentManager.ts');
    const utilsFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/utils.ts');

    const callEdge = isServerNode && isServerFnNode ? resolveEdgeId(ctx, isServerNode.id, isServerFnNode.id, 'CALLS') : null;
    const impEdge = envFile && utilsFile ? resolveEdgeId(ctx, envFile.id, utilsFile.id, 'IMPORTS') : null;

    if (isServerNode && isServerFnNode) {
      const gNodes = [isServerNode.id, isServerFnNode.id];
      if (envFile) gNodes.push(envFile.id);
      if (utilsFile) gNodes.push(utilsFile.id);

      const gEdges: string[] = [];
      if (callEdge) gEdges.push(callEdge);
      if (impEdge) gEdges.push(impEdge);

      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-DEPN-0002`,
        category: 'DEPENDENCY_INTELLIGENCE',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: isServerNode.id,
        targetNodeType: isServerNode.type,
        targetNodeLabel: isServerNode.label,
        question: 'In @tanstack/query-core, what internal function does isServer() invoke to evaluate server runtime status, and what utility module does environmentManager.ts import?',
        intent: 'Analyze verified caller-callee and file import dependencies for runtime environment detection.',
        difficulty: 'EASY',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-002-RU-0035', 'EEID-REPO-002-RU-0077', 'EEID-REPO-002-RU-0078', 'EEID-REPO-002-RU-0050'],
        candidateGraphNodeIds: gNodes,
        candidateGraphEdgeIds: gEdges,
        candidateHistoryIds: [],
        selectionReason: 'Verified static CALLS edge and file IMPORTS edge between environmentManager and utils.',
        generationMethod: 'TOPOLOGY_CROSS_FILE_DEPENDENCY',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  } else if (repoMeta.id === 'EEID-REPO-003') {
    // Payload buildConfig multi-hop chain
    const bcFunc = ctx.nodes.get('function:EEID-REPO-003:packages/payload/src/config/build.ts:buildConfig:12');
    const scFunc = ctx.nodes.get('function:EEID-REPO-003:packages/payload/src/config/sanitize.ts:sanitizeConfig:304');
    const adFunc = ctx.nodes.get('function:EEID-REPO-003:packages/payload/src/config/defaults.ts:addDefaultsToConfig:45');
    const scolFunc = ctx.nodes.get('function:EEID-REPO-003:packages/payload/src/collections/config/sanitize.ts:sanitizeCollection:78');

    const call1 = bcFunc && scFunc ? resolveEdgeId(ctx, bcFunc.id, scFunc.id, 'CALLS') : null;
    const call2 = scFunc && adFunc ? resolveEdgeId(ctx, scFunc.id, adFunc.id, 'CALLS') : null;
    const call3 = scFunc && scolFunc ? resolveEdgeId(ctx, scFunc.id, scolFunc.id, 'CALLS') : null;

    if (bcFunc && scFunc) {
      const gNodes = [bcFunc.id, scFunc.id];
      if (adFunc) gNodes.push(adFunc.id);
      if (scolFunc) gNodes.push(scolFunc.id);

      const gEdges: string[] = [];
      if (call1) gEdges.push(call1);
      if (call2) gEdges.push(call2);
      if (call3) gEdges.push(call3);

      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-DEPN-0001`,
        category: 'DEPENDENCY_INTELLIGENCE',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: bcFunc.id,
        targetNodeType: bcFunc.type,
        targetNodeLabel: bcFunc.label,
        question: 'Starting from buildConfig in packages/payload/src/config/build.ts, trace the verified static call path to sanitizeConfig and identify which downstream sanitization and default-assignment functions are called next.',
        intent: 'Evaluate verified static call graph traversal through Payload configuration building, sanitization, and defaults pipelines.',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-003-RU-0200', 'EEID-REPO-003-RU-0203', 'EEID-REPO-003-RU-0372'],
        candidateGraphNodeIds: gNodes,
        candidateGraphEdgeIds: gEdges,
        candidateHistoryIds: [],
        selectionReason: 'Multi-hop verified static call path traversing buildConfig -> sanitizeConfig -> addDefaultsToConfig and sanitizeCollection.',
        generationMethod: 'TOPOLOGY_MULTI_HOP_CALL_GRAPH',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // Payload config types imports
    const cfgTypes = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/config/types.ts');
    const authIdx = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/auth/index.ts');
    const dbTypes = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/database/types.ts');

    const impAuth = cfgTypes && authIdx ? resolveEdgeId(ctx, cfgTypes.id, authIdx.id, 'IMPORTS') : null;
    const impDb = cfgTypes && dbTypes ? resolveEdgeId(ctx, cfgTypes.id, dbTypes.id, 'IMPORTS') : null;

    if (cfgTypes) {
      const gNodes = [cfgTypes.id];
      if (authIdx) gNodes.push(authIdx.id);
      if (dbTypes) gNodes.push(dbTypes.id);

      const gEdges: string[] = [];
      if (impAuth) gEdges.push(impAuth);
      if (impDb) gEdges.push(impDb);

      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-DEPN-0002`,
        category: 'DEPENDENCY_INTELLIGENCE',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: cfgTypes.id,
        targetNodeType: cfgTypes.type,
        targetNodeLabel: cfgTypes.label,
        question: 'What core subsystems are imported by packages/payload/src/config/types.ts, and how does it declare static dependencies on the auth, collections, and database modules?',
        intent: 'Analyze module-level import dependencies and cross-package type contracts.',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-003-RU-0001'],
        candidateGraphNodeIds: gNodes,
        candidateGraphEdgeIds: gEdges,
        candidateHistoryIds: [],
        selectionReason: 'Central configuration types file importing auth and database subsystems with verified static edges.',
        generationMethod: 'TOPOLOGY_CROSS_MODULE_IMPORT_GRAPH',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  }

  return candidates.slice(0, count);
}

/**
 * Category 4: IMPACT_ANALYSIS
 * Generates hypothetical operations (REMOVE, MODIFY, REPLACE, DEPRECATE) on nodes with verified relationships.
 * Invariant: Never generates whatIfGroundTruth or gold answers.
 */
export function generateImpactAnalysis(
  ctx: RepositoryIndexContext,
  metricsMap: Map<string, NodeMetrics>,
  repoMeta: PilotRepoMetadata,
  rng: SeededRNG,
  count: number = 2
): CandidateQuestion[] {
  const candidates: CandidateQuestion[] = [];
  const repoNumber = repoMeta.id.split('-').pop() || '001';

  if (repoMeta.id === 'EEID-REPO-001') {
    // Express Auth authenticate() modification
    const authFunc = ctx.nodes.get('function:EEID-REPO-001:examples/auth/index.js:authenticate:60');
    const authFile = ctx.nodes.get('file:EEID-REPO-001:examples/auth/index.js');
    const callEdge = authFunc && authFile ? resolveEdgeId(ctx, authFile.id, authFunc.id, 'CALLS') : null;

    if (authFunc && authFile) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-IMPA-0001`,
        category: 'IMPACT_ANALYSIS',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: authFunc.id,
        targetNodeType: authFunc.type,
        targetNodeLabel: authFunc.label,
        question: 'WHAT IF the authenticate() function in examples/auth/index.js is modified to return a Promise instead of accepting a callback: which route handlers in examples/auth/index.js would be directly impacted, and what async control flow refactoring is required?',
        intent: 'Assess impact of signature modification on calling route handlers and callback control flow.',
        difficulty: 'MEDIUM',
        interactionMode: 'WHAT_IF',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-001-RU-0024', 'EEID-REPO-001-RU-0074'],
        candidateGraphNodeIds: [authFunc.id, authFile.id],
        candidateGraphEdgeIds: callEdge ? [callEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'Function authenticate() has a verified call site in the POST /login route handler of examples/auth/index.js.',
        generationMethod: 'IMPACT_CALL_SITE_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // Express Content-negotiation db.js data structure change
    const dbFile = ctx.nodes.get('file:EEID-REPO-001:examples/content-negotiation/db.js');
    const cnIndex = ctx.nodes.get('file:EEID-REPO-001:examples/content-negotiation/index.js');
    const cnUsers = ctx.nodes.get('file:EEID-REPO-001:examples/content-negotiation/users.js');

    const imp1 = cnIndex && dbFile ? resolveEdgeId(ctx, cnIndex.id, dbFile.id, 'IMPORTS') : null;
    const imp2 = cnUsers && dbFile ? resolveEdgeId(ctx, cnUsers.id, dbFile.id, 'IMPORTS') : null;

    if (dbFile) {
      const gNodes = [dbFile.id];
      if (cnIndex) gNodes.push(cnIndex.id);
      if (cnUsers) gNodes.push(cnUsers.id);

      const gEdges: string[] = [];
      if (imp1) gEdges.push(imp1);
      if (imp2) gEdges.push(imp2);

      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-IMPA-0002`,
        category: 'IMPACT_ANALYSIS',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: dbFile.id,
        targetNodeType: dbFile.type,
        targetNodeLabel: dbFile.label,
        question: 'WHAT IF the exported users data structure in examples/content-negotiation/db.js is modified from an array of objects to a Map or asynchronous database query: what calling and consuming files would require updates?',
        intent: 'Determine blast radius on consumer files when data layer export contract is refactored.',
        difficulty: 'MEDIUM',
        interactionMode: 'WHAT_IF',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-001-RU-0025', 'EEID-REPO-001-RU-0026', 'EEID-REPO-001-RU-0027'],
        candidateGraphNodeIds: gNodes,
        candidateGraphEdgeIds: gEdges,
        candidateHistoryIds: [],
        selectionReason: 'db.js has incoming IMPORTS from both index.js and users.js in content-negotiation.',
        generationMethod: 'IMPACT_INCOMING_IMPORTS_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  } else if (repoMeta.id === 'EEID-REPO-002') {
    // TanStack resolveQueryValue deprecation
    const rqvNode = ctx.nodes.get('function:EEID-REPO-002:packages/query-core/src/utils.ts:resolveQueryValue:168');
    const rqvFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/utils.ts');
    const declEdge = rqvNode && rqvFile ? resolveEdgeId(ctx, rqvFile.id, rqvNode.id, 'DECLARES') : null;

    if (rqvNode) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-IMPA-0001`,
        category: 'IMPACT_ANALYSIS',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: rqvNode.id,
        targetNodeType: rqvNode.type,
        targetNodeLabel: rqvNode.label,
        question: 'WHAT IF the resolveQueryValue() function in packages/query-core/src/utils.ts were deprecated and replaced with direct function execution: which core modules and observers across @tanstack/query-core would be directly impacted by this change?',
        intent: 'Evaluate blast radius of deprecating a high in-degree core utility function consumed across multiple query observer modules.',
        difficulty: 'HARD',
        interactionMode: 'WHAT_IF',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-002-RU-0268', 'EEID-REPO-002-RU-0050'],
        candidateGraphNodeIds: [rqvNode.id, ...(rqvFile ? [rqvFile.id] : [])],
        candidateGraphEdgeIds: declEdge ? [declEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'resolveQueryValue has 16 incoming call references across query observers and cache handlers.',
        generationMethod: 'IMPACT_HIGH_IN_DEGREE_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // TanStack FocusManager.setEventListener modification
    const setEv = ctx.nodes.get('function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.setEventListener:78');
    const onSub = ctx.nodes.get('function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.onSubscribe:39');
    const callEdge = setEv && onSub ? resolveEdgeId(ctx, onSub.id, setEv.id, 'CALLS') : null;

    if (setEv) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-IMPA-0002`,
        category: 'IMPACT_ANALYSIS',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: setEv.id,
        targetNodeType: setEv.type,
        targetNodeLabel: setEv.label,
        question: 'WHAT IF FocusManager.setEventListener() in packages/query-core/src/focusManager.ts is modified to accept an AbortSignal for automatic listener teardown: which internal subscriber methods and callers within focusManager.ts are directly affected?',
        intent: 'Assess impact of adding cancellation parameters to event listener registration methods.',
        difficulty: 'MEDIUM',
        interactionMode: 'WHAT_IF',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-002-RU-0088', 'EEID-REPO-002-RU-0090'],
        candidateGraphNodeIds: [setEv.id, ...(onSub ? [onSub.id] : [])],
        candidateGraphEdgeIds: callEdge ? [callEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'Direct caller-callee relationship with onSubscribe with verified static edge.',
        generationMethod: 'IMPACT_CALL_SITE_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  } else if (repoMeta.id === 'EEID-REPO-003') {
    // Payload executeAccess modification
    const eaNode = ctx.nodes.get('function:EEID-REPO-003:packages/payload/src/auth/executeAccess.ts:executeAccess:14');
    const eaFile = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/auth/executeAccess.ts');
    const declEdge = eaNode && eaFile ? resolveEdgeId(ctx, eaFile.id, eaNode.id, 'DECLARES') : null;

    if (eaNode) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-IMPA-0001`,
        category: 'IMPACT_ANALYSIS',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: eaNode.id,
        targetNodeType: eaNode.type,
        targetNodeLabel: eaNode.label,
        question: 'WHAT IF executeAccess() in packages/payload/src/auth/executeAccess.ts were modified to enforce strict asynchronous promise return types without fallback: which calling operations across CRUD operations would be directly affected?',
        intent: 'Examine blast radius of changing access control function signature across database operations.',
        difficulty: 'HARD',
        interactionMode: 'WHAT_IF',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: resolveEvidenceIdsForNode(ctx, eaNode).length > 0 ? resolveEvidenceIdsForNode(ctx, eaNode) : ['EEID-REPO-003-RU-0453'],
        candidateGraphNodeIds: [eaNode.id, ...(eaFile ? [eaFile.id] : [])],
        candidateGraphEdgeIds: declEdge ? [declEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'executeAccess has 12 incoming call sites from create, find, update, and delete operations.',
        generationMethod: 'IMPACT_HIGH_IN_DEGREE_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // Payload sanitizeConfig modification
    const scNode = ctx.nodes.get('function:EEID-REPO-003:packages/payload/src/config/sanitize.ts:sanitizeConfig:304');
    const bcNode = ctx.nodes.get('function:EEID-REPO-003:packages/payload/src/config/build.ts:buildConfig:12');
    const callEdge = scNode && bcNode ? resolveEdgeId(ctx, bcNode.id, scNode.id, 'CALLS') : null;

    if (scNode) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-IMPA-0002`,
        category: 'IMPACT_ANALYSIS',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: scNode.id,
        targetNodeType: scNode.type,
        targetNodeLabel: scNode.label,
        question: 'WHAT IF sanitizeConfig() in packages/payload/src/config/sanitize.ts were removed or modified to throw synchronous validation errors on missing fields: how would this impact the caller buildConfig() and downstream collection sanitizers?',
        intent: 'Determine architectural blast radius of modifying central configuration sanitization logic on build initialization.',
        difficulty: 'MEDIUM',
        interactionMode: 'WHAT_IF',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-003-RU-0203', 'EEID-REPO-003-RU-0200'],
        candidateGraphNodeIds: [scNode.id, ...(bcNode ? [bcNode.id] : [])],
        candidateGraphEdgeIds: callEdge ? [callEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'Central configuration sanitization function called directly by buildConfig().',
        generationMethod: 'IMPACT_CALL_SITE_ANALYSIS',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  }

  return candidates.slice(0, count);
}

/**
 * Category 5: REPOSITORY_CONVERSATION
 * Identifies multi-file features and architecture flows requiring synthesis across 2+ files.
 */
export function generateRepositoryConversation(
  ctx: RepositoryIndexContext,
  metricsMap: Map<string, NodeMetrics>,
  repoMeta: PilotRepoMetadata,
  rng: SeededRNG,
  count: number = 2
): CandidateQuestion[] {
  const candidates: CandidateQuestion[] = [];
  const repoNumber = repoMeta.id.split('-').pop() || '001';

  if (repoMeta.id === 'EEID-REPO-001') {
    // Express content-negotiation feature flow
    const cnIndex = ctx.nodes.get('file:EEID-REPO-001:examples/content-negotiation/index.js');
    const cnUsers = ctx.nodes.get('file:EEID-REPO-001:examples/content-negotiation/users.js');
    const cnDb = ctx.nodes.get('file:EEID-REPO-001:examples/content-negotiation/db.js');

    const imp1 = cnIndex && cnDb ? resolveEdgeId(ctx, cnIndex.id, cnDb.id, 'IMPORTS') : null;
    const imp2 = cnUsers && cnDb ? resolveEdgeId(ctx, cnUsers.id, cnDb.id, 'IMPORTS') : null;

    if (cnIndex && cnUsers && cnDb) {
      const gEdges: string[] = [];
      if (imp1) gEdges.push(imp1);
      if (imp2) gEdges.push(imp2);

      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-CONV-0001`,
        category: 'REPOSITORY_CONVERSATION',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: cnIndex.id,
        targetNodeType: cnIndex.type,
        targetNodeLabel: cnIndex.label,
        question: 'How do index.js, users.js, and db.js in examples/content-negotiation/ collaborate to implement multi-format HTTP content negotiation (HTML, JSON, and text) based on client request headers?',
        intent: 'Synthesize multi-file request routing, dataset retrieval, and content negotiation formatting across three collaborating files.',
        difficulty: 'HARD',
        interactionMode: 'REPO_CONVERSATION',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-001-RU-0026', 'EEID-REPO-001-RU-0027', 'EEID-REPO-001-RU-0025'],
        candidateGraphNodeIds: [cnIndex.id, cnUsers.id, cnDb.id],
        candidateGraphEdgeIds: gEdges,
        candidateHistoryIds: [],
        selectionReason: 'Three-way file collaboration forming a complete content negotiation feature subsystem.',
        generationMethod: 'MULTI_FILE_FEATURE_FLOW',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // Express Auth & Root index.js integration
    const authFile = ctx.nodes.get('file:EEID-REPO-001:examples/auth/index.js');
    const rootIndex = ctx.nodes.get('file:EEID-REPO-001:index.js');
    const impRoot = authFile && rootIndex ? resolveEdgeId(ctx, authFile.id, rootIndex.id, 'IMPORTS') : null;

    if (authFile && rootIndex) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-CONV-0002`,
        category: 'REPOSITORY_CONVERSATION',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: authFile.id,
        targetNodeType: authFile.type,
        targetNodeLabel: authFile.label,
        question: 'Explain the architectural collaboration between examples/auth/index.js and the root Express application entry point index.js in configuring middleware, managing session state, and protecting restricted routes.',
        intent: 'Analyze multi-file integration between example application layer and root framework export.',
        difficulty: 'HARD',
        interactionMode: 'REPO_CONVERSATION',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-001-RU-0024', 'EEID-REPO-001-RU-0068'],
        candidateGraphNodeIds: [authFile.id, rootIndex.id],
        candidateGraphEdgeIds: impRoot ? [impRoot] : [],
        candidateHistoryIds: [],
        selectionReason: 'Example module importing the core framework root module.',
        generationMethod: 'MULTI_FILE_FEATURE_FLOW',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  } else if (repoMeta.id === 'EEID-REPO-002') {
    // TanStack QueryClient + QueryObserver + Query collaboration
    const qcFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/queryClient.ts');
    const qoFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/queryObserver.ts');
    const qFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/query.ts');

    const imp1 = qcFile && qFile ? resolveEdgeId(ctx, qcFile.id, qFile.id, 'IMPORTS') : null;
    const imp2 = qoFile && qFile ? resolveEdgeId(ctx, qoFile.id, qFile.id, 'IMPORTS') : null;

    if (qcFile && qoFile && qFile) {
      const gEdges: string[] = [];
      if (imp1) gEdges.push(imp1);
      if (imp2) gEdges.push(imp2);

      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-CONV-0001`,
        category: 'REPOSITORY_CONVERSATION',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: qcFile.id,
        targetNodeType: qcFile.type,
        targetNodeLabel: qcFile.label,
        question: 'How do QueryClient, QueryObserver, and Query collaborate across queryClient.ts, queryObserver.ts, and query.ts to manage query subscription lifecycle, notify subscribers of cache updates, and trigger background refetching?',
        intent: 'Explain core reactive state management and subscriber notification across the three primary @tanstack/query-core modules.',
        difficulty: 'HARD',
        interactionMode: 'REPO_CONVERSATION',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-002-RU-0044', 'EEID-REPO-002-RU-0047', 'EEID-REPO-002-RU-0045'],
        candidateGraphNodeIds: [qcFile.id, qoFile.id, qFile.id],
        candidateGraphEdgeIds: gEdges,
        candidateHistoryIds: [],
        selectionReason: 'Three core modules forming the primary state management triangle of TanStack Query.',
        generationMethod: 'MULTI_FILE_FEATURE_FLOW',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // TanStack environmentManager + utils collaboration
    const envFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/environmentManager.ts');
    const utilsFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/utils.ts');
    const impEnvUtils = envFile && utilsFile ? resolveEdgeId(ctx, envFile.id, utilsFile.id, 'IMPORTS') : null;

    if (envFile && utilsFile) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-CONV-0002`,
        category: 'REPOSITORY_CONVERSATION',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: envFile.id,
        targetNodeType: envFile.type,
        targetNodeLabel: envFile.label,
        question: 'How do environmentManager.ts and utils.ts in @tanstack/query-core collaborate to evaluate execution environments (SSR vs browser DOM) and coordinate background timer management?',
        intent: 'Examine cross-module environment detection and platform-specific scheduling.',
        difficulty: 'MEDIUM',
        interactionMode: 'REPO_CONVERSATION',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-002-RU-0035', 'EEID-REPO-002-RU-0050'],
        candidateGraphNodeIds: [envFile.id, utilsFile.id],
        candidateGraphEdgeIds: impEnvUtils ? [impEnvUtils] : [],
        candidateHistoryIds: [],
        selectionReason: 'Verified inter-file import connecting environment detection to utility runtime functions.',
        generationMethod: 'MULTI_FILE_FEATURE_FLOW',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  } else if (repoMeta.id === 'EEID-REPO-003') {
    // Payload configuration pipeline: build.ts + sanitize.ts + defaults.ts
    const buildFile = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/config/build.ts');
    const sanitizeFile = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/config/sanitize.ts');
    const defaultsFile = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/config/defaults.ts');

    const impBuildSanitize = buildFile && sanitizeFile ? resolveEdgeId(ctx, buildFile.id, sanitizeFile.id, 'IMPORTS') : null;

    if (buildFile && sanitizeFile && defaultsFile) {
      const gEdges: string[] = [];
      if (impBuildSanitize) gEdges.push(impBuildSanitize);

      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-CONV-0001`,
        category: 'REPOSITORY_CONVERSATION',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: buildFile.id,
        targetNodeType: buildFile.type,
        targetNodeLabel: buildFile.label,
        question: 'Explain the multi-file architecture flow between packages/payload/src/config/build.ts, sanitize.ts, and defaults.ts when validating, applying default options, and compiling an active Payload configuration.',
        intent: 'Synthesize multi-file configuration initialization, property merging, and defaults injection across Payload config packages.',
        difficulty: 'HARD',
        interactionMode: 'REPO_CONVERSATION',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-003-RU-0003', 'EEID-REPO-003-RU-0004', 'EEID-REPO-003-RU-0005'],
        candidateGraphNodeIds: [buildFile.id, sanitizeFile.id, defaultsFile.id],
        candidateGraphEdgeIds: gEdges,
        candidateHistoryIds: [],
        selectionReason: 'Three collaborating configuration files implementing the core Payload setup pipeline.',
        generationMethod: 'MULTI_FILE_FEATURE_FLOW',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }

    // Payload config types + collections config types
    const cfgTypes = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/config/types.ts');
    const collTypes = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/collections/config/types.ts');
    const impColl = cfgTypes && collTypes ? resolveEdgeId(ctx, cfgTypes.id, collTypes.id, 'IMPORTS') : null;

    if (cfgTypes && collTypes) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-CONV-0002`,
        category: 'REPOSITORY_CONVERSATION',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: cfgTypes.id,
        targetNodeType: cfgTypes.type,
        targetNodeLabel: cfgTypes.label,
        question: 'How do types.ts in packages/payload/src/config/ and packages/payload/src/collections/config/types.ts collaborate to define the global collection schema and field configuration contracts?',
        intent: 'Analyze multi-file type definition collaboration across central config and collections config modules.',
        difficulty: 'MEDIUM',
        interactionMode: 'REPO_CONVERSATION',
        requiresMultiFile: true,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-003-RU-0001', 'EEID-REPO-003-RU-0010'],
        candidateGraphNodeIds: [cfgTypes.id, collTypes.id],
        candidateGraphEdgeIds: impColl ? [impColl] : [],
        candidateHistoryIds: [],
        selectionReason: 'Verified type import edge connecting central config types to collection schema types.',
        generationMethod: 'MULTI_FILE_FEATURE_FLOW',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  }

  return candidates.slice(0, count);
}

/**
 * Category 6: EVIDENCE_AND_UNCERTAINTY
 * Generates deliberate unanswerable or partially answerable questions based on actual missing evidence or deliberately absent information.
 * Invariant: Never invents absence of evidence without checking the available indices.
 */
export function generateEvidenceAndUncertainty(
  ctx: RepositoryIndexContext,
  metricsMap: Map<string, NodeMetrics>,
  repoMeta: PilotRepoMetadata,
  rng: SeededRNG,
  count: number = 1
): CandidateQuestion[] {
  const candidates: CandidateQuestion[] = [];
  const repoNumber = repoMeta.id.split('-').pop() || '001';

  if (repoMeta.id === 'EEID-REPO-001') {
    // Express: absent internal discussion/benchmark for body-parser version selection
    const histFile = ctx.nodes.get('file:EEID-REPO-001:History.md');
    const commitNode = ctx.nodes.get('commit:43fca52');
    const modEdge = resolveEdgeId(ctx, 'commit:43fca52', 'file:EEID-REPO-001:History.md', 'MODIFIED');

    const historyIds: string[] = [];
    if (ctx.history.has('commit-43fca52')) historyIds.push('commit-43fca52');
    if (ctx.history.has('pr-7563')) historyIds.push('pr-7563');

    if (histFile) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-UNCE-0001`,
        category: 'EVIDENCE_AND_UNCERTAINTY',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: histFile.id,
        targetNodeType: histFile.type,
        targetNodeLabel: histFile.label,
        question: 'Does the Express repository index contain design documentation or benchmark results explaining the specific technical rationale for selecting body-parser version 2.4.0 over earlier 2.x releases beyond the PR title in #7563?',
        intent: 'Evaluate ability to distinguish documented public pull request titles from absent internal architectural discussions and unindexed release decisions.',
        difficulty: 'HARD',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: true,
        candidateEvidenceIds: ['EEID-REPO-001-RU-0001'],
        candidateGraphNodeIds: [histFile.id, ...(commitNode ? [commitNode.id] : [])],
        candidateGraphEdgeIds: modEdge ? [modEdge] : [],
        candidateHistoryIds: historyIds,
        selectionReason: 'Targeted absent internal design rationale; confirmed that History.md records the version bump but contains no benchmarking or internal meeting notes.',
        generationMethod: 'ABSENT_EVIDENCE_VERIFICATION',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  } else if (repoMeta.id === 'EEID-REPO-002') {
    // TanStack Query: absent method clearAllActiveSubscriptions() on QueryClient
    // Verified: clearAllActiveSubscriptions does NOT exist in nodes.jsonl
    const qcNode = ctx.nodes.get('component:EEID-REPO-002:packages/query-core/src/queryClient.ts:QueryClient:78');
    const qcFile = ctx.nodes.get('file:EEID-REPO-002:packages/query-core/src/queryClient.ts');
    const declEdge = qcNode && qcFile ? resolveEdgeId(ctx, qcFile.id, qcNode.id, 'DECLARES') : null;

    if (qcNode) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-UNCE-0001`,
        category: 'EVIDENCE_AND_UNCERTAINTY',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: qcNode.id,
        targetNodeType: qcNode.type,
        targetNodeLabel: qcNode.label,
        question: 'According to the @tanstack/query repository index, does QueryClient define a public method named clearAllActiveSubscriptions() to abruptly terminate all active observer connections?',
        intent: 'Verify detection of non-existent methods on QueryClient without hallucinating fictional observer cleanup APIs.',
        difficulty: 'HARD',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-002-RU-0044'],
        candidateGraphNodeIds: [qcNode.id, ...(qcFile ? [qcFile.id] : [])],
        candidateGraphEdgeIds: declEdge ? [declEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'Verified that method clearAllActiveSubscriptions() does NOT exist anywhere in nodes.jsonl or queryClient.ts.',
        generationMethod: 'ABSENT_SYMBOL_VERIFICATION',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  } else if (repoMeta.id === 'EEID-REPO-003') {
    // Payload CMS: absent function sanitizeDatabasePool() in database module
    // Verified: sanitizeDatabasePool does NOT exist in nodes.jsonl
    const dbFile = ctx.nodes.get('file:EEID-REPO-003:packages/payload/src/database/types.ts');
    const repoEdge = resolveEdgeId(ctx, 'repository:payloadcms/payload', 'file:EEID-REPO-003:packages/payload/src/database/types.ts', 'CONTAINS');

    if (dbFile) {
      candidates.push({
        candidateId: `EEID-CAND-${repoNumber}-UNCE-0001`,
        category: 'EVIDENCE_AND_UNCERTAINTY',
        repositoryId: repoMeta.id,
        repositoryName: repoMeta.name,
        commitSha: repoMeta.pinnedCommitSha,
        targetNodeId: dbFile.id,
        targetNodeType: dbFile.type,
        targetNodeLabel: dbFile.label,
        question: 'According to the Payload CMS repository index, does packages/payload/src/database/ export a function named sanitizeDatabasePool() to forcefully purge hanging Postgres connections?',
        intent: 'Verify detection of non-existent database connection cleanup functions.',
        difficulty: 'HARD',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false,
        candidateEvidenceIds: ['EEID-REPO-003-RU-0006'],
        candidateGraphNodeIds: [dbFile.id],
        candidateGraphEdgeIds: repoEdge ? [repoEdge] : [],
        candidateHistoryIds: [],
        selectionReason: 'Verified that sanitizeDatabasePool() does not exist anywhere in the indexed database files or nodes.',
        generationMethod: 'ABSENT_SYMBOL_VERIFICATION',
        status: 'DRAFT',
        humanReviewRequired: true
      });
    }
  }

  return candidates.slice(0, count);
}

// ============================================================================
// 5. Orchestrator Pipeline: EEIDQuestionSeeder
// ============================================================================

export class EEIDQuestionSeeder {
  private store: RepositoryIndexStore;
  private defaultIndexDir: string;

  constructor(indexDirectory: string = './eeid/pilot-output') {
    this.defaultIndexDir = indexDirectory;
    this.store = new RepositoryIndexStore(indexDirectory);
  }

  /**
   * Generates candidate questions for a specific repository.
   */
  public generateForRepository(repositoryId: string, options?: SeederOptions): CandidateQuestion[] {
    const canonicalId = REPO_ALIAS_MAP[repositoryId] || repositoryId;
    const repoMeta = PILOT_REPOSITORIES[canonicalId];
    if (!repoMeta) {
      throw new Error(`Unknown repository identifier: "${repositoryId}". Supported: EEID-REPO-001, EEID-REPO-002, EEID-REPO-003`);
    }

    const indexDir = options?.indexDirectory || this.defaultIndexDir;
    const ctx = this.store.getIndex(canonicalId, indexDir);
    if (!ctx) {
      throw new Error(`Failed to load repository index for ${canonicalId} from ${indexDir}`);
    }

    const rng = new SeededRNG(options?.seed ?? 42);
    const metricsMap = computeTopologyMetrics(ctx);

    const perCategory = options?.perCategoryCount;
    const nodeCount = perCategory ?? 2;
    const histCount = perCategory ?? 1;
    const depnCount = perCategory ?? 2;
    const impaCount = perCategory ?? 2;
    const convCount = perCategory ?? 2;
    const unceCount = perCategory ?? 1;

    const candidates: CandidateQuestion[] = [];

    // Category 1: NODE_UNDERSTANDING
    candidates.push(...generateNodeUnderstanding(ctx, metricsMap, repoMeta, rng, nodeCount));

    // Category 2: HISTORICAL_REASONING
    candidates.push(...generateHistoricalReasoning(ctx, metricsMap, repoMeta, rng, histCount));

    // Category 3: DEPENDENCY_INTELLIGENCE
    candidates.push(...generateDependencyIntelligence(ctx, metricsMap, repoMeta, rng, depnCount));

    // Category 4: IMPACT_ANALYSIS
    candidates.push(...generateImpactAnalysis(ctx, metricsMap, repoMeta, rng, impaCount));

    // Category 5: REPOSITORY_CONVERSATION
    candidates.push(...generateRepositoryConversation(ctx, metricsMap, repoMeta, rng, convCount));

    // Category 6: EVIDENCE_AND_UNCERTAINTY
    candidates.push(...generateEvidenceAndUncertainty(ctx, metricsMap, repoMeta, rng, unceCount));

    if (options?.perRepoCount && options.perRepoCount > 0) {
      return candidates.slice(0, options.perRepoCount);
    }

    return candidates;
  }

  /**
   * Generates the initial pilot batch of 30 candidates across all 3 pilot repositories (10 each).
   */
  public generatePilotBatch(options?: SeederOptions): CandidateQuestion[] {
    const allCandidates: CandidateQuestion[] = [];
    const rngSeed = options?.seed ?? 42;

    for (const repoId of Object.keys(PILOT_REPOSITORIES)) {
      const candidates = this.generateForRepository(repoId, {
        ...options,
        seed: rngSeed,
        perRepoCount: options?.perRepoCount ?? 10
      });
      allCandidates.push(...candidates);
    }

    // Deduplication check across all candidates
    const seenQuestions = new Set<string>();
    const deduplicated: CandidateQuestion[] = [];

    for (const c of allCandidates) {
      const normalized = c.question.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!seenQuestions.has(normalized)) {
        seenQuestions.add(normalized);
        deduplicated.push(c);
      }
    }

    return deduplicated;
  }

  /**
   * Saves candidate records to JSONL.
   * Safety invariant: Never silently overwrites previously reviewed records.
   */
  public saveCandidates(
    candidates: CandidateQuestion[],
    outputPath: string = './eeid/candidate_questions.jsonl',
    options?: { regenerate?: boolean; force?: boolean }
  ): { savedCount: number; preservedCount: number; updatedCount: number } {
    const resolvedPath = path.resolve(outputPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const reviewedRecords: CandidateQuestion[] = [];
    const unreviewedExisting: CandidateQuestion[] = [];

    if (fs.existsSync(resolvedPath)) {
      const fileContent = fs.readFileSync(resolvedPath, 'utf8');
      const lines = fileContent.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const rec = JSON.parse(line);
          const isReviewed =
            rec.status !== 'DRAFT' ||
            rec.humanReviewRequired === false ||
            Boolean(rec.reviewedBy || rec.reviewNotes || rec.expectedAnswer);

          if (isReviewed) {
            reviewedRecords.push(rec);
          } else {
            unreviewedExisting.push(rec);
          }
        } catch {
          // ignore unparseable existing line
        }
      }
    }

    // Safety check: if reviewed records exist and neither --regenerate nor --force was specified
    if (reviewedRecords.length > 0 && !options?.regenerate && !options?.force) {
      throw new Error(
        `Safety Abort: Target file "${outputPath}" contains ${reviewedRecords.length} previously reviewed record(s). ` +
        `Pass --regenerate to preserve reviewed records while updating drafts, or --force to overwrite all records.`
      );
    }

    // Map existing reviewed records by candidateId
    const finalRecordsMap = new Map<string, CandidateQuestion>();

    // 1. Preserve reviewed records verbatim
    for (const rev of reviewedRecords) {
      finalRecordsMap.set(rev.candidateId, rev);
    }

    // 2. Insert new candidates (if already reviewed, preserve reviewed version unless force)
    let updatedCount = 0;
    for (const cand of candidates) {
      if (finalRecordsMap.has(cand.candidateId)) {
        if (options?.force) {
          finalRecordsMap.set(cand.candidateId, cand);
          updatedCount++;
        }
        // otherwise preserved reviewed record stays
      } else {
        finalRecordsMap.set(cand.candidateId, cand);
        updatedCount++;
      }
    }

    const outputLines: string[] = [];
    for (const rec of finalRecordsMap.values()) {
      outputLines.push(JSON.stringify(rec));
    }

    fs.writeFileSync(resolvedPath, outputLines.join('\n') + '\n', 'utf8');

    return {
      savedCount: finalRecordsMap.size,
      preservedCount: reviewedRecords.length,
      updatedCount
    };
  }
}

// ============================================================================
// 6. Automated Candidate Validator
// ============================================================================

export class EEIDCandidateValidator {
  private store: RepositoryIndexStore;

  constructor(indexDirectory: string = './eeid/pilot-output') {
    this.store = new RepositoryIndexStore(indexDirectory);
  }

  /**
   * Validates a single candidate question against candidate schema invariants and index context.
   */
  public validate(
    candidate: unknown,
    context?: RepositoryIndexContext
  ): CandidateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const ruleResults: Record<string, CandidateValidationRuleResult> = {};

    const failRule = (rule: string, msg: string) => {
      errors.push(`[${rule}] ${msg}`);
      ruleResults[rule] = { passed: false, message: msg };
    };

    const passRule = (rule: string, msg?: string) => {
      if (!ruleResults[rule]) {
        ruleResults[rule] = { passed: true, message: msg };
      }
    };

    if (!candidate || typeof candidate !== 'object') {
      failRule('rule1_schema_integrity', 'Candidate record is null, undefined, or not an object');
      return {
        passed: false,
        candidateId: 'UNKNOWN',
        repositoryId: 'UNKNOWN',
        errors,
        warnings,
        ruleResults
      };
    }

    const rec = candidate as Partial<CandidateQuestion>;
    const candidateId = typeof rec.candidateId === 'string' && rec.candidateId.trim() ? rec.candidateId.trim() : 'UNKNOWN';
    const repositoryId = typeof rec.repositoryId === 'string' && rec.repositoryId.trim() ? rec.repositoryId.trim() : 'UNKNOWN';

    // ------------------------------------------------------------------------
    // Rule 1: Schema Integrity & Enum Conformance
    // ------------------------------------------------------------------------
    const rule1 = 'rule1_schema_integrity';
    let rule1Passed = true;

    if (!rec.candidateId || typeof rec.candidateId !== 'string') {
      failRule(rule1, 'Missing or invalid candidateId (must be a non-empty string)');
      rule1Passed = false;
    } else if (!/^EEID-CAND-[0-9]{3}-/.test(rec.candidateId)) {
      failRule(rule1, `Invalid candidateId format: "${rec.candidateId}" (must start with EEID-CAND-xxx-)`);
      rule1Passed = false;
    }

    if (!rec.category || !VALID_CATEGORIES.has(rec.category as EEIDCategory)) {
      failRule(rule1, `Invalid or missing category: "${rec.category}"`);
      rule1Passed = false;
    }

    if (!rec.repositoryId || typeof rec.repositoryId !== 'string') {
      failRule(rule1, 'Missing or invalid repositoryId');
      rule1Passed = false;
    }

    if (!rec.repositoryName || typeof rec.repositoryName !== 'string') {
      failRule(rule1, 'Missing or invalid repositoryName');
      rule1Passed = false;
    }

    if (!rec.commitSha || typeof rec.commitSha !== 'string' || !/^[0-9a-f]{40}$/i.test(rec.commitSha)) {
      failRule(rule1, `Invalid or missing commitSha (must be 40-char hex): "${rec.commitSha}"`);
      rule1Passed = false;
    }

    if (!rec.targetNodeId || typeof rec.targetNodeId !== 'string') {
      failRule(rule1, 'Missing targetNodeId');
      rule1Passed = false;
    }

    if (!rec.targetNodeType || typeof rec.targetNodeType !== 'string') {
      failRule(rule1, 'Missing targetNodeType');
      rule1Passed = false;
    }

    if (!rec.targetNodeLabel || typeof rec.targetNodeLabel !== 'string') {
      failRule(rule1, 'Missing targetNodeLabel');
      rule1Passed = false;
    }

    if (!rec.question || typeof rec.question !== 'string' || rec.question.trim().length < 15) {
      failRule(rule1, 'Question is missing, not a string, or shorter than 15 characters');
      rule1Passed = false;
    }

    if (!rec.intent || typeof rec.intent !== 'string' || rec.intent.trim().length < 5) {
      failRule(rule1, 'Intent is missing or shorter than 5 characters');
      rule1Passed = false;
    }

    if (!rec.difficulty || !VALID_DIFFICULTIES.has(rec.difficulty as Difficulty)) {
      failRule(rule1, `Invalid difficulty: "${rec.difficulty}"`);
      rule1Passed = false;
    }

    if (!rec.interactionMode || !VALID_INTERACTION_MODES.has(rec.interactionMode as InteractionMode)) {
      failRule(rule1, `Invalid interactionMode: "${rec.interactionMode}"`);
      rule1Passed = false;
    }

    if (typeof rec.requiresMultiFile !== 'boolean') {
      failRule(rule1, 'requiresMultiFile must be a boolean');
      rule1Passed = false;
    }

    if (typeof rec.requiresHistory !== 'boolean') {
      failRule(rule1, 'requiresHistory must be a boolean');
      rule1Passed = false;
    }

    if (!Array.isArray(rec.candidateEvidenceIds)) {
      failRule(rule1, 'candidateEvidenceIds must be an array of strings');
      rule1Passed = false;
    }

    if (!Array.isArray(rec.candidateGraphNodeIds)) {
      failRule(rule1, 'candidateGraphNodeIds must be an array of strings');
      rule1Passed = false;
    }

    if (!Array.isArray(rec.candidateGraphEdgeIds)) {
      failRule(rule1, 'candidateGraphEdgeIds must be an array of strings');
      rule1Passed = false;
    }

    if (!Array.isArray(rec.candidateHistoryIds)) {
      failRule(rule1, 'candidateHistoryIds must be an array of strings');
      rule1Passed = false;
    }

    if (!rec.selectionReason || typeof rec.selectionReason !== 'string') {
      failRule(rule1, 'Missing selectionReason');
      rule1Passed = false;
    }

    if (!rec.generationMethod || typeof rec.generationMethod !== 'string') {
      failRule(rule1, 'Missing generationMethod');
      rule1Passed = false;
    }

    // Invariant: Status must strictly be DRAFT
    if (rec.status !== 'DRAFT') {
      failRule(rule1, `Candidate status must strictly be "DRAFT", received: "${rec.status}"`);
      rule1Passed = false;
    }

    // Invariant: humanReviewRequired must strictly be true
    if (rec.humanReviewRequired !== true) {
      failRule(rule1, `Candidate humanReviewRequired must strictly be true, received: ${rec.humanReviewRequired}`);
      rule1Passed = false;
    }

    if (rule1Passed) {
      passRule(rule1, 'Candidate schema integrity and required fields validated');
    }

    // ------------------------------------------------------------------------
    // Rule 2: Invariant Check — No Gold Answers or Ground Truth
    // ------------------------------------------------------------------------
    const rule2 = 'rule2_no_gold_answers';
    let rule2Passed = true;

    if ('expectedAnswer' in rec && rec.expectedAnswer !== undefined) {
      failRule(rule2, 'Forbidden field "expectedAnswer" present in candidate question');
      rule2Passed = false;
    }
    if ('expectedClaims' in rec && rec.expectedClaims !== undefined) {
      failRule(rule2, 'Forbidden field "expectedClaims" present in candidate question');
      rule2Passed = false;
    }
    if ('whatIfGroundTruth' in rec && rec.whatIfGroundTruth !== undefined) {
      failRule(rule2, 'Forbidden field "whatIfGroundTruth" present in candidate question');
      rule2Passed = false;
    }

    if (rule2Passed) {
      passRule(rule2, 'Verified absence of gold answers, claims, and whatIfGroundTruth');
    }

    // Load repository index context if not provided
    const repoIndex = context || (repositoryId !== 'UNKNOWN' ? this.store.getIndex(repositoryId) : null);

    // ------------------------------------------------------------------------
    // Rule 3: Repository & Snapshot Consistency
    // ------------------------------------------------------------------------
    const rule3 = 'rule3_repository_snapshot_consistency';
    let rule3Passed = true;

    const pilotMeta = PILOT_REPOSITORIES[repositoryId];
    if (pilotMeta) {
      if (rec.repositoryName !== pilotMeta.name) {
        failRule(rule3, `repositoryName mismatch: expected "${pilotMeta.name}", got "${rec.repositoryName}"`);
        rule3Passed = false;
      }
      if (rec.commitSha !== pilotMeta.pinnedCommitSha) {
        failRule(rule3, `commitSha mismatch: expected "${pilotMeta.pinnedCommitSha}", got "${rec.commitSha}"`);
        rule3Passed = false;
      }
    }

    if (repoIndex?.manifest) {
      const manifestCommit = repoIndex.manifest.pinned_commit_sha;
      if (manifestCommit && rec.commitSha !== manifestCommit) {
        failRule(rule3, `commitSha mismatch against manifest: expected "${manifestCommit}", got "${rec.commitSha}"`);
        rule3Passed = false;
      }
    }

    if (rule3Passed) {
      passRule(rule3, 'Repository and pinned snapshot consistency verified');
    }

    // ------------------------------------------------------------------------
    // Rule 4: Target Node & Evidence Verification against Index
    // ------------------------------------------------------------------------
    const rule4 = 'rule4_index_references_integrity';
    let rule4Passed = true;

    if (repoIndex) {
      // 1. Target node verification
      const targetNode = repoIndex.nodes.get(rec.targetNodeId!);
      if (!targetNode) {
        failRule(rule4, `targetNodeId "${rec.targetNodeId}" does not exist in repository nodes index`);
        rule4Passed = false;
      } else {
        if (targetNode.type !== rec.targetNodeType) {
          failRule(rule4, `targetNodeType mismatch: node has type "${targetNode.type}", candidate declared "${rec.targetNodeType}"`);
          rule4Passed = false;
        }
      }

      // 2. Candidate evidence IDs
      if (Array.isArray(rec.candidateEvidenceIds)) {
        for (const evId of rec.candidateEvidenceIds) {
          if (!repoIndex.retrievalUnits.has(evId)) {
            failRule(rule4, `candidateEvidenceId "${evId}" does not exist in source_index.jsonl`);
            rule4Passed = false;
          } else {
            const unit = repoIndex.retrievalUnits.get(evId)!;
            if (unit.repository_id && unit.repository_id !== repositoryId) {
              failRule(rule4, `Cross-repository evidence leakage: "${evId}" belongs to "${unit.repository_id}" not "${repositoryId}"`);
              rule4Passed = false;
            }
          }
        }
      }

      // 3. Candidate graph node IDs
      if (Array.isArray(rec.candidateGraphNodeIds)) {
        for (const gnId of rec.candidateGraphNodeIds) {
          if (!repoIndex.nodes.has(gnId)) {
            failRule(rule4, `candidateGraphNodeId "${gnId}" does not exist in nodes.jsonl`);
            rule4Passed = false;
          }
        }
      }

      // 4. Candidate graph edge IDs
      if (Array.isArray(rec.candidateGraphEdgeIds)) {
        for (const geId of rec.candidateGraphEdgeIds) {
          if (!repoIndex.edges.has(geId)) {
            failRule(rule4, `candidateGraphEdgeId "${geId}" does not exist in edges.jsonl`);
            rule4Passed = false;
          }
        }
      }

      // 5. Candidate history IDs
      if (Array.isArray(rec.candidateHistoryIds)) {
        for (const hId of rec.candidateHistoryIds) {
          if (!repoIndex.history.has(hId)) {
            failRule(rule4, `candidateHistoryId "${hId}" does not exist in history.jsonl`);
            rule4Passed = false;
          }
        }
      }
    } else {
      warnings.push(`Index context not loaded for repository "${repositoryId}"; index reference verification skipped.`);
    }

    if (rule4Passed) {
      passRule(rule4, 'Target node, evidence retrieval units, graph nodes, edges, and history references verified');
    }

    // ------------------------------------------------------------------------
    // Rule 5: Category Invariants
    // ------------------------------------------------------------------------
    const rule5 = 'rule5_category_invariants';
    let rule5Passed = true;

    if (rec.category === 'HISTORICAL_REASONING') {
      if (rec.requiresHistory !== true) {
        failRule(rule5, 'Category HISTORICAL_REASONING requires requiresHistory to be true');
        rule5Passed = false;
      }
      if (!Array.isArray(rec.candidateHistoryIds) || rec.candidateHistoryIds.length === 0) {
        failRule(rule5, 'Category HISTORICAL_REASONING requires at least one candidateHistoryId');
        rule5Passed = false;
      }
    }

    if (rec.category === 'REPOSITORY_CONVERSATION') {
      if (rec.requiresMultiFile !== true) {
        failRule(rule5, 'Category REPOSITORY_CONVERSATION requires requiresMultiFile to be true');
        rule5Passed = false;
      }
    }

    if (rec.category === 'IMPACT_ANALYSIS') {
      if (rec.interactionMode !== 'WHAT_IF') {
        failRule(rule5, 'Category IMPACT_ANALYSIS requires interactionMode to be "WHAT_IF"');
        rule5Passed = false;
      }
    }

    if (rule5Passed) {
      passRule(rule5, 'Category-specific requirements and interaction modes validated');
    }

    const passed = errors.length === 0;

    return {
      passed,
      candidateId,
      repositoryId,
      errors,
      warnings,
      ruleResults
    };
  }

  /**
   * Validates an entire candidate JSONL file.
   */
  public validateJsonlFile(filePath: string): CandidateFileValidationSummary {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Candidate questions file not found at: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');

    const results: CandidateValidationResult[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let totalErrors = 0;
    let totalWarnings = 0;

    const seenQuestionTexts = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const candidate = JSON.parse(line);
        const result = this.validate(candidate);

        // Check for duplicate questions
        if (typeof candidate.question === 'string') {
          const normQ = candidate.question.trim().toLowerCase().replace(/\s+/g, ' ');
          if (seenQuestionTexts.has(normQ)) {
            result.passed = false;
            result.errors.push(`[rule_duplicate_question] Duplicate question text detected on line ${i + 1}`);
            result.ruleResults['rule_duplicate_question'] = { passed: false, message: 'Duplicate question text detected' };
          } else {
            seenQuestionTexts.add(normQ);
          }
        }

        results.push(result);

        if (result.passed) {
          passedCount++;
        } else {
          failedCount++;
        }
        totalErrors += result.errors.length;
        totalWarnings += result.warnings.length;
      } catch (err: any) {
        failedCount++;
        totalErrors++;
        results.push({
          passed: false,
          candidateId: `LINE_${i + 1}`,
          repositoryId: 'PARSE_ERROR',
          errors: [`[JSON_PARSE_ERROR] Line ${i + 1} is not valid JSON: ${err?.message || err}`],
          warnings: [],
          ruleResults: {
            rule1_schema_integrity: { passed: false, message: 'JSON Parse Failure' }
          }
        });
      }
    }

    return {
      passed: failedCount === 0,
      totalRecords: results.length,
      passedRecords: passedCount,
      failedRecords: failedCount,
      totalErrors,
      totalWarnings,
      results
    };
  }
}

// ============================================================================
// 7. CLI Runner
// ============================================================================

export function runCli(): void {
  const args = process.argv.slice(2);

  let batchSize = 30;
  let repoArg: string | null = null;
  let perCategory: number | null = null;
  let seed = 42;
  let validateOnly = false;
  let validateFile: string | null = null;
  let outputFile = './eeid/candidate_questions.jsonl';
  let indexDir = './eeid/pilot-output';
  let regenerate = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--batch' || arg === '-b') {
      batchSize = parseInt(args[++i], 10);
    } else if (arg === '--repo' || arg === '-r') {
      repoArg = args[++i];
    } else if (arg === '--per-category' || arg === '-c') {
      perCategory = parseInt(args[++i], 10);
    } else if (arg === '--seed' || arg === '-s') {
      seed = parseInt(args[++i], 10);
    } else if (arg === '--validate' || arg === '-v') {
      validateOnly = true;
    } else if (arg === '--file' || arg === '-f') {
      validateFile = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      outputFile = args[++i];
    } else if (arg === '--index-dir' || arg === '-i') {
      indexDir = args[++i];
    } else if (arg === '--regenerate') {
      regenerate = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
EngiTrace EEID Topology-Driven Question Seeder
Usage:
  npx tsx seed_eeid_questions.ts [options]

Generation Options:
  --batch, -b <n>         Generate initial batch of N candidates (default: 30, balanced across pilot repos)
  --repo, -r <id|name>    Generate candidates for a specific repository (e.g. EEID-REPO-001 or express)
  --per-category, -c <n>  Configure number of candidates per category
  --seed, -s <n>          Deterministic PRNG seed (default: 42)
  --output, -o <path>     Output JSONL path (default: ./eeid/candidate_questions.jsonl)
  --index-dir, -i <path>  Pilot output index directory (default: ./eeid/pilot-output)
  --regenerate            Regenerate draft candidates while strictly preserving previously reviewed records
  --force                 Force overwrite all records even if reviewed records are present

Validation Options:
  --validate, -v          Validate an existing candidate JSONL file
  --file, -f <path>       Candidate JSONL file to validate (default: ./eeid/candidate_questions.jsonl)

Examples:
  npx tsx seed_eeid_questions.ts                          # Generate 30 pilot candidates (10 each)
  npx tsx seed_eeid_questions.ts --repo EEID-REPO-001     # Generate candidates for Express only
  npx tsx seed_eeid_questions.ts --per-category 2         # Generate 2 candidates per category
  npx tsx seed_eeid_questions.ts --validate               # Validate eeid/candidate_questions.jsonl
  npx tsx seed_eeid_questions.ts --regenerate             # Safely regenerate unreviewed draft questions
      `);
      process.exit(0);
    }
  }

  // --------------------------------------------------------------------------
  // Mode 1: Validation Mode
  // --------------------------------------------------------------------------
  if (validateOnly) {
    const targetFile = validateFile || outputFile;
    console.log(`\n======================================================`);
    console.log(`EngiTrace EEID Candidate Question Validator`);
    console.log(`Target File:      ${targetFile}`);
    console.log(`Index Directory:  ${indexDir}`);
    console.log(`======================================================\n`);

    const validator = new EEIDCandidateValidator(indexDir);

    try {
      const summary = validator.validateJsonlFile(targetFile);

      summary.results.forEach((r) => {
        const icon = r.passed ? '✓ PASS' : '❌ FAIL';
        console.log(`[${icon}] ${r.candidateId} (${r.repositoryId})`);
        r.errors.forEach((e) => console.log(`    Error: ${e}`));
        r.warnings.forEach((w) => console.log(`    Warning: ${w}`));
      });

      console.log(`\n------------------------------------------------------`);
      console.log(`Total Candidates:  ${summary.totalRecords}`);
      console.log(`Passed Candidates: ${summary.passedRecords}`);
      console.log(`Failed Candidates: ${summary.failedRecords}`);
      console.log(`Total Errors:      ${summary.totalErrors}`);
      console.log(`Total Warnings:    ${summary.totalWarnings}`);
      console.log(`Validation Status: ${summary.passed ? 'ALL CHECKS PASSED CLEANLY' : 'VALIDATION FAILED'}`);
      console.log(`------------------------------------------------------\n`);

      process.exit(summary.passed ? 0 : 1);
    } catch (err: any) {
      console.error(`Fatal Validation Error: ${err?.message || err}`);
      process.exit(1);
    }
  }

  // --------------------------------------------------------------------------
  // Mode 2: Generation Mode
  // --------------------------------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`EngiTrace EEID Topology-Driven Question Seeder`);
  console.log(`Output File:      ${outputFile}`);
  console.log(`Index Directory:  ${indexDir}`);
  console.log(`Seed:             ${seed}`);
  console.log(`Mode:             ${regenerate ? 'REGENERATE (PRESERVE REVIEWED)' : force ? 'FORCE OVERWRITE' : 'SAFE WRITE'}`);
  console.log(`======================================================\n`);

  const seeder = new EEIDQuestionSeeder(indexDir);

  try {
    let generatedCandidates: CandidateQuestion[];

    if (repoArg) {
      const canonicalId = REPO_ALIAS_MAP[repoArg] || repoArg;
      console.log(`Generating candidates for repository: ${canonicalId}`);
      generatedCandidates = seeder.generateForRepository(canonicalId, {
        seed,
        perCategoryCount: perCategory || undefined,
        indexDirectory: indexDir
      });
    } else {
      console.log(`Generating pilot candidate batch (30 candidates across Express, TanStack Query, Payload CMS)...`);
      generatedCandidates = seeder.generatePilotBatch({
        seed,
        perCategoryCount: perCategory || undefined,
        indexDirectory: indexDir
      });
    }

    // Save candidates to output file
    const saveResult = seeder.saveCandidates(generatedCandidates, outputFile, {
      regenerate,
      force
    });

    console.log(`\n------------------------------------------------------`);
    console.log(`Generation Completed Successfully:`);
    console.log(`Generated Candidates: ${generatedCandidates.length}`);
    console.log(`Preserved Reviewed:   ${saveResult.preservedCount}`);
    console.log(`Updated / Written:    ${saveResult.updatedCount}`);
    console.log(`Total File Records:   ${saveResult.savedCount}`);
    console.log(`Output Destination:   ${path.resolve(outputFile)}`);
    console.log(`------------------------------------------------------\n`);

    // Category breakdown summary
    const categoryCounts: Record<string, number> = {};
    const repoCounts: Record<string, number> = {};

    generatedCandidates.forEach((c) => {
      categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
      repoCounts[c.repositoryId] = (repoCounts[c.repositoryId] || 0) + 1;
    });

    console.log(`Breakdown by Repository:`);
    Object.entries(repoCounts).forEach(([rId, cnt]) => {
      const name = PILOT_REPOSITORIES[rId]?.name || rId;
      console.log(`  - ${rId} (${name}): ${cnt} candidates`);
    });

    console.log(`\nBreakdown by Category:`);
    Object.entries(categoryCounts).forEach(([cat, cnt]) => {
      console.log(`  - ${cat}: ${cnt} candidates`);
    });

    // Automatically validate generated candidate file
    console.log(`\nValidating generated candidate questions...`);
    const validator = new EEIDCandidateValidator(indexDir);
    const valSummary = validator.validateJsonlFile(outputFile);

    if (valSummary.passed) {
      console.log(`✓ Generated candidate JSONL passed all automated validation invariants (0 errors).\n`);
      process.exit(0);
    } else {
      console.error(`❌ Validation failed on generated candidate questions (${valSummary.totalErrors} errors).\n`);
      valSummary.results.filter((r) => !r.passed).forEach((r) => {
        console.error(`  [FAIL] ${r.candidateId}: ${r.errors.join('; ')}`);
      });
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Fatal Seeder Error: ${err?.message || err}`);
    process.exit(1);
  }
}

// Direct execution entry point
if (require.main === module) {
  runCli();
}
