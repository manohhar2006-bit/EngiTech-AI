/**
 * EngiTrace Engineering Intelligence Dataset (EEID) — Automated Record Validator
 *
 * Implements strict, production-quality validation for EEID JSONL benchmark records:
 * 1. Schema integrity & enum conformance
 * 2. Repository & snapshot isolation (zero cross-repo leakage)
 * 3. Target node snapshot existence & type verification
 * 4. Half-open source anchor verification [start, endExclusive) with SHA-256 recomputation
 * 5. Evidence reference integrity & structural binding
 * 6. Claim classification invariants (FACT, INFERENCE, UNKNOWN) & confidence tiers
 * 7. Temporal consistency against snapshot cutoff
 * 8. WHAT IF impact graph traversal, continuity, endpoints, and blast radius
 *
 * Invariant: Never mutates or overwrites source records. Never silently repairs invalid data.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ============================================================================
// 1. Types & Schema Definitions
// ============================================================================

export type EEIDCategory =
  | 'NODE_UNDERSTANDING'
  | 'HISTORICAL_REASONING'
  | 'DEPENDENCY_INTELLIGENCE'
  | 'IMPACT_ANALYSIS'
  | 'REPOSITORY_CONVERSATION'
  | 'EVIDENCE_AND_UNCERTAINTY';

export const VALID_CATEGORIES: ReadonlySet<string> = new Set<EEIDCategory>([
  'NODE_UNDERSTANDING',
  'HISTORICAL_REASONING',
  'DEPENDENCY_INTELLIGENCE',
  'IMPACT_ANALYSIS',
  'REPOSITORY_CONVERSATION',
  'EVIDENCE_AND_UNCERTAINTY'
]);

export type ClaimClassification = 'FACT' | 'INFERENCE' | 'UNKNOWN';
export const VALID_CLASSIFICATIONS: ReadonlySet<string> = new Set<ClaimClassification>([
  'FACT',
  'INFERENCE',
  'UNKNOWN'
]);

export type ConfidenceTier = 'DEFINITIVE' | 'HIGH' | 'SPECULATIVE' | 'ABSENT';
export const VALID_CONFIDENCE_TIERS: ReadonlySet<string> = new Set<ConfidenceTier>([
  'DEFINITIVE',
  'HIGH',
  'SPECULATIVE',
  'ABSENT'
]);

export type InteractionMode = 'NODE_INTELLIGENCE' | 'REPO_CONVERSATION' | 'WHAT_IF';
export const VALID_INTERACTION_MODES: ReadonlySet<string> = new Set<InteractionMode>([
  'NODE_INTELLIGENCE',
  'REPO_CONVERSATION',
  'WHAT_IF'
]);

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export const VALID_DIFFICULTIES: ReadonlySet<string> = new Set<Difficulty>(['EASY', 'MEDIUM', 'HARD']);

export type AnnotationStatus = 'VERIFIED' | 'DRAFT' | 'REJECTED';
export const VALID_ANNOTATION_STATUSES: ReadonlySet<string> = new Set<AnnotationStatus>([
  'VERIFIED',
  'DRAFT',
  'REJECTED'
]);

export type AnnotatorType = 'HUMAN_EXPERT' | 'HYBRID_VERIFIED';
export const VALID_ANNOTATOR_TYPES: ReadonlySet<string> = new Set<AnnotatorType>([
  'HUMAN_EXPERT',
  'HYBRID_VERIFIED'
]);

export type WhatIfOperation = 'REMOVE' | 'MODIFY' | 'REPLACE' | 'DEPRECATE';
export const VALID_WHAT_IF_OPERATIONS: ReadonlySet<string> = new Set<WhatIfOperation>([
  'REMOVE',
  'MODIFY',
  'REPLACE',
  'DEPRECATE'
]);

export interface SourceAnchor {
  filePath: string;
  sourceLineStart: number; // 1-based, inclusive
  sourceLineEndExclusive: number; // 1-based, exclusive: [start, endExclusive)
  contentHash: string; // SHA-256 of slice or chunk content
  blobSha?: string;
  symbolName?: string;
}

export interface EEIDClaim {
  claimId: string;
  text: string;
  classification: ClaimClassification;
  confidenceTier: ConfidenceTier;
  evidenceIds: string[];
  sourceAnchors: SourceAnchor[];
  reasoning?: string;
}

export interface WhatIfGroundTruth {
  operation: WhatIfOperation;
  targetSymbol: string;
  targetFilePath: string;
  directlyAffectedNodeIds: string[];
  indirectlyAffectedNodeIds: string[];
  dependencyPaths: string[][]; // [node0, edge0, node1, edge1, node2, ...]
  blastRadiusScore: number; // 0 to 100
  staticCertainty: string[];
  runtimeUncertainties: string[];
}

export interface EEIDRecord {
  recordId: string;
  category: EEIDCategory;
  repository: {
    id: string;
    name: string;
    url: string;
    defaultBranch: string;
    commitSha: string;
    snapshotTimestamp: string;
    licenseSpdx: string;
    licenseBlobSha?: string;
  };
  targetNode: {
    id: string;
    type: string;
    label: string;
    filePath?: string;
    sourceLineRange?: {
      start: number;
      endExclusive: number;
    };
  };
  question: string;
  questionContext: {
    intent: string;
    difficulty: Difficulty;
    interactionMode: InteractionMode;
    requiresMultiFile: boolean;
    requiresHistory: boolean;
  };
  contextInputs: {
    retrievalUnitIds: string[];
    graphNodeIds: string[];
    graphEdgeIds: string[];
    historyStepIds?: string[];
  };
  expectedAnswer: string;
  expectedClaims: EEIDClaim[];
  whatIfGroundTruth?: WhatIfGroundTruth;
  annotationMetadata: {
    status: AnnotationStatus;
    annotatorType: AnnotatorType;
    author: string;
    adjudicator?: string;
    verifiedAt: string;
    notes?: string;
  };
}

export interface ValidationRuleResult {
  passed: boolean;
  message?: string;
}

export interface RecordValidationResult {
  passed: boolean;
  recordId: string;
  repositoryId: string;
  errors: string[];
  warnings: string[];
  validationRuleResults: Record<string, ValidationRuleResult>;
}

export interface FileValidationSummary {
  passed: boolean;
  totalRecords: number;
  passedRecords: number;
  failedRecords: number;
  totalErrors: number;
  totalWarnings: number;
  results: RecordValidationResult[];
}

export interface ValidatorOptions {
  strict?: boolean; // Treat warnings as errors
  requireIndices?: boolean; // Fail if index context is missing
  indexDirectory?: string; // Path to pilot-output directory
  allowDrafts?: boolean; // Whether DRAFT records pass (default: true)
}

// ============================================================================
// 2. Repository Index Context & Loader
// ============================================================================

export interface RepositoryIndexContext {
  repositoryId: string;
  manifest?: {
    repository_name?: string;
    repository_url?: string;
    pinned_commit_sha?: string;
    snapshot_timestamp?: string;
    [key: string]: unknown;
  };
  nodes: Map<string, { id: string; type: string; label: string; metadata?: any;[key: string]: any }>;
  edges: Map<string, { id: string; source: string; target: string; relationshipType: string;[key: string]: any }>;
  retrievalUnits: Map<
    string,
    {
      retrieval_unit_id: string;
      repository_id: string;
      commit_sha: string;
      file_path: string;
      source_line_start: number;
      source_line_end_exclusive: number;
      blob_sha: string;
      content_hash: string;
      content: string;
      chunk_type: string;
      [key: string]: any;
    }
  >;
  sourceFiles: Map<
    string,
    {
      lines: string[];
      blobSha?: string;
      rawContent?: string;
    }
  >;
  history: Map<
    string,
    {
      id: string;
      type: string;
      sha?: string;
      number?: number;
      created_at?: string;
      updated_at?: string;
      merged_at?: string | null;
      closed_at?: string | null;
      temporal_status?: string;
      [key: string]: any;
    }
  >;
}

const REPO_SUBFOLDER_MAP: Record<string, string> = {
  'EEID-REPO-001': 'express',
  'EEID-REPO-002': 'tanstack-query',
  'EEID-REPO-003': 'payload',
  'expressjs/express': 'express',
  'TanStack/query': 'tanstack-query',
  'payloadcms/payload': 'payload'
};

/**
 * Loads and caches repository indices from disk (nodes, edges, source_index, history, manifest).
 */
export class RepositoryIndexStore {
  private cache: Map<string, RepositoryIndexContext> = new Map();

  constructor(private baseDir?: string) { }

  public getIndex(repositoryId: string, customDir?: string): RepositoryIndexContext | null {
    if (this.cache.has(repositoryId)) {
      return this.cache.get(repositoryId)!;
    }

    const searchDir = customDir || this.baseDir;
    if (!searchDir || !fs.existsSync(searchDir)) {
      return null;
    }

    // Determine target directory for this repository
    let targetDir = searchDir;
    const subfolder = REPO_SUBFOLDER_MAP[repositoryId];
    if (subfolder && fs.existsSync(path.join(searchDir, subfolder))) {
      targetDir = path.join(searchDir, subfolder);
    } else if (!fs.existsSync(path.join(targetDir, 'manifest.json'))) {
      // Search subdirectories for matching manifest
      try {
        const entries = fs.readdirSync(searchDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const candidate = path.join(searchDir, entry.name);
            const candidateManifest = path.join(candidate, 'manifest.json');
            if (fs.existsSync(candidateManifest)) {
              try {
                const parsed = JSON.parse(fs.readFileSync(candidateManifest, 'utf8'));
                if (
                  parsed.repository_name === repositoryId ||
                  parsed.repository_id === repositoryId ||
                  REPO_SUBFOLDER_MAP[repositoryId] === entry.name
                ) {
                  targetDir = candidate;
                  break;
                }
              } catch {
                // ignore unparseable candidate
              }
            }
          }
        }
      } catch {
        // directory traversal failed
      }
    }

    const context = this.loadFromDir(targetDir, repositoryId);
    if (context) {
      this.cache.set(repositoryId, context);
    }
    return context;
  }

  private loadFromDir(dir: string, repositoryId: string): RepositoryIndexContext | null {
    if (!fs.existsSync(dir)) return null;

    const context: RepositoryIndexContext = {
      repositoryId,
      nodes: new Map(),
      edges: new Map(),
      retrievalUnits: new Map(),
      sourceFiles: new Map(),
      history: new Map()
    };

    // 1. Manifest
    const manifestPath = path.join(dir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        context.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        // manifest warning
      }
    }

    // 2. Nodes
    const nodesPath = path.join(dir, 'nodes.jsonl');
    if (fs.existsSync(nodesPath)) {
      const lines = fs.readFileSync(nodesPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const node = JSON.parse(trimmed);
          if (node.id) {
            context.nodes.set(node.id, node);
          }
        } catch {
          // ignore malformed line
        }
      }
    }

    // 3. Edges
    const edgesPath = path.join(dir, 'edges.jsonl');
    if (fs.existsSync(edgesPath)) {
      const lines = fs.readFileSync(edgesPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const edge = JSON.parse(trimmed);
          if (edge.id) {
            context.edges.set(edge.id, edge);
          }
        } catch {
          // ignore malformed line
        }
      }
    }

    // 4. Source Index & File Chunks
    const sourceIndexPath = path.join(dir, 'source_index.jsonl');
    if (fs.existsSync(sourceIndexPath)) {
      const lines = fs.readFileSync(sourceIndexPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const unit = JSON.parse(trimmed);
          if (unit.retrieval_unit_id) {
            context.retrievalUnits.set(unit.retrieval_unit_id, unit);
          }
          // If this is a full-file chunk, record into sourceFiles
          if (unit.chunk_type === 'file' && unit.file_path && typeof unit.content === 'string') {
            const normalizedContent = unit.content.replace(/\r\n/g, '\n');
            const fileLines = normalizedContent.endsWith('\n')
              ? normalizedContent.slice(0, -1).split('\n')
              : normalizedContent.split('\n');

            context.sourceFiles.set(unit.file_path, {
              lines: fileLines,
              blobSha: unit.blob_sha,
              rawContent: unit.content
            });
          }
        } catch {
          // ignore malformed line
        }
      }
    }

    // 5. History
    const historyPath = path.join(dir, 'history.jsonl');
    if (fs.existsSync(historyPath)) {
      const lines = fs.readFileSync(historyPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const item = JSON.parse(trimmed);
          if (item.id) {
            context.history.set(item.id, item);
          }
          if (item.sha) {
            context.history.set(item.sha, item);
          }
          if (item.number) {
            context.history.set(`PR#${item.number}`, item);
            context.history.set(`Issue#${item.number}`, item);
            context.history.set(`pr-${item.number}`, item);
            context.history.set(`issue-${item.number}`, item);
          }
        } catch {
          // ignore malformed line
        }
      }
    }

    return context;
  }
}

// ============================================================================
// 3. Validator Implementation
// ============================================================================

export class EEIDRecordValidator {
  private indexStore: RepositoryIndexStore;

  constructor(options?: ValidatorOptions) {
    this.indexStore = new RepositoryIndexStore(options?.indexDirectory || path.resolve(process.cwd(), 'eeid', 'pilot-output'));
  }

  /**
   * Validate a single in-memory EEID record.
   */
  public validate(
    rawRecord: unknown,
    indexContext?: RepositoryIndexContext | null,
    options?: ValidatorOptions
  ): RecordValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const ruleResults: Record<string, ValidationRuleResult> = {};

    let recordId = 'UNKNOWN_RECORD';
    let repositoryId = 'UNKNOWN_REPO';

    const failRule = (rule: string, msg: string) => {
      errors.push(`[${rule}] ${msg}`);
      ruleResults[rule] = { passed: false, message: msg };
    };

    const warnRule = (rule: string, msg: string) => {
      warnings.push(`[${rule}] ${msg}`);
      if (!ruleResults[rule] || ruleResults[rule].passed) {
        ruleResults[rule] = { passed: true, message: `Warning: ${msg}` };
      }
    };

    const passRule = (rule: string, msg?: string) => {
      if (!ruleResults[rule] || ruleResults[rule].passed) {
        ruleResults[rule] = { passed: true, message: msg };
      }
    };

    // ------------------------------------------------------------------------
    // Rule 1: Schema Integrity
    // ------------------------------------------------------------------------
    const rule1 = 'rule1_schema_integrity';
    if (!rawRecord || typeof rawRecord !== 'object') {
      failRule(rule1, 'Record is not an object or is null');
      return {
        passed: false,
        recordId,
        repositoryId,
        errors,
        warnings,
        validationRuleResults: ruleResults
      };
    }

    const rec = rawRecord as Partial<EEIDRecord>;
    recordId = rec.recordId && typeof rec.recordId === 'string' ? rec.recordId : 'MALFORMED_RECORD_ID';
    repositoryId = rec.repository?.id && typeof rec.repository.id === 'string' ? rec.repository.id : 'MALFORMED_REPO_ID';

    if (!rec.recordId || typeof rec.recordId !== 'string' || !rec.recordId.trim()) {
      failRule(rule1, 'Missing or empty recordId');
    }

    if (!rec.category || !VALID_CATEGORIES.has(rec.category)) {
      failRule(rule1, `Invalid or missing category: "${rec.category}". Must be one of: ${Array.from(VALID_CATEGORIES).join(', ')}`);
    }

    if (!rec.repository || typeof rec.repository !== 'object') {
      failRule(rule1, 'Missing repository object');
    } else {
      if (!rec.repository.id || typeof rec.repository.id !== 'string') failRule(rule1, 'Missing repository.id');
      if (!rec.repository.name || typeof rec.repository.name !== 'string') failRule(rule1, 'Missing repository.name');
      if (!rec.repository.url || typeof rec.repository.url !== 'string') failRule(rule1, 'Missing repository.url');
      if (!rec.repository.defaultBranch || typeof rec.repository.defaultBranch !== 'string') failRule(rule1, 'Missing repository.defaultBranch');
      if (!rec.repository.commitSha || !/^[0-9a-f]{40}$/i.test(rec.repository.commitSha)) {
        failRule(rule1, `Invalid repository.commitSha: "${rec.repository.commitSha}". Must be a 40-character hex SHA`);
      }
      if (!rec.repository.snapshotTimestamp || isNaN(Date.parse(rec.repository.snapshotTimestamp))) {
        failRule(rule1, `Invalid repository.snapshotTimestamp: "${rec.repository.snapshotTimestamp}". Must be a valid ISO 8601 string`);
      }
      if (!rec.repository.licenseSpdx || typeof rec.repository.licenseSpdx !== 'string') failRule(rule1, 'Missing repository.licenseSpdx');
    }

    if (!rec.targetNode || typeof rec.targetNode !== 'object') {
      failRule(rule1, 'Missing targetNode object');
    } else {
      if (!rec.targetNode.id || typeof rec.targetNode.id !== 'string') failRule(rule1, 'Missing targetNode.id');
      if (!rec.targetNode.type || typeof rec.targetNode.type !== 'string') failRule(rule1, 'Missing targetNode.type');
      if (!rec.targetNode.label || typeof rec.targetNode.label !== 'string') failRule(rule1, 'Missing targetNode.label');
    }

    if (!rec.question || typeof rec.question !== 'string' || !rec.question.trim()) {
      failRule(rule1, 'Missing or empty question');
    }

    if (!rec.questionContext || typeof rec.questionContext !== 'object') {
      failRule(rule1, 'Missing questionContext object');
    } else {
      if (!rec.questionContext.intent || typeof rec.questionContext.intent !== 'string') failRule(rule1, 'Missing questionContext.intent');
      if (!rec.questionContext.difficulty || !VALID_DIFFICULTIES.has(rec.questionContext.difficulty)) {
        failRule(rule1, `Invalid questionContext.difficulty: "${rec.questionContext.difficulty}". Must be EASY, MEDIUM, or HARD`);
      }
      if (!rec.questionContext.interactionMode || !VALID_INTERACTION_MODES.has(rec.questionContext.interactionMode)) {
        failRule(rule1, `Invalid questionContext.interactionMode: "${rec.questionContext.interactionMode}". Must be NODE_INTELLIGENCE, REPO_CONVERSATION, or WHAT_IF`);
      }
      if (typeof rec.questionContext.requiresMultiFile !== 'boolean') failRule(rule1, 'questionContext.requiresMultiFile must be boolean');
      if (typeof rec.questionContext.requiresHistory !== 'boolean') failRule(rule1, 'questionContext.requiresHistory must be boolean');
    }

    if (!rec.contextInputs || typeof rec.contextInputs !== 'object') {
      failRule(rule1, 'Missing contextInputs object');
    } else {
      if (!Array.isArray(rec.contextInputs.retrievalUnitIds)) failRule(rule1, 'contextInputs.retrievalUnitIds must be an array');
      if (!Array.isArray(rec.contextInputs.graphNodeIds)) failRule(rule1, 'contextInputs.graphNodeIds must be an array');
      if (!Array.isArray(rec.contextInputs.graphEdgeIds)) failRule(rule1, 'contextInputs.graphEdgeIds must be an array');
    }

    if (!rec.expectedAnswer || typeof rec.expectedAnswer !== 'string' || !rec.expectedAnswer.trim()) {
      failRule(rule1, 'Missing or empty expectedAnswer');
    }

    if (!Array.isArray(rec.expectedClaims) || rec.expectedClaims.length === 0) {
      failRule(rule1, 'expectedClaims must be a non-empty array with at least one claim');
    } else {
      rec.expectedClaims.forEach((claim, idx) => {
        const path = `expectedClaims[${idx}]`;
        if (!claim.claimId || typeof claim.claimId !== 'string') failRule(rule1, `Missing claimId at ${path}`);
        if (!claim.text || typeof claim.text !== 'string' || !claim.text.trim()) failRule(rule1, `Missing text at ${path}`);
        if (!claim.classification || !VALID_CLASSIFICATIONS.has(claim.classification)) {
          failRule(rule1, `Invalid classification at ${path}: "${claim.classification}". Must be FACT, INFERENCE, or UNKNOWN`);
        }
        if (!claim.confidenceTier || !VALID_CONFIDENCE_TIERS.has(claim.confidenceTier)) {
          failRule(rule1, `Invalid confidenceTier at ${path}: "${claim.confidenceTier}". Must be DEFINITIVE, HIGH, SPECULATIVE, or ABSENT`);
        }
        if (!Array.isArray(claim.evidenceIds)) failRule(rule1, `evidenceIds at ${path} must be an array`);
        if (!Array.isArray(claim.sourceAnchors)) failRule(rule1, `sourceAnchors at ${path} must be an array`);
      });
    }

    if (!rec.annotationMetadata || typeof rec.annotationMetadata !== 'object') {
      failRule(rule1, 'Missing annotationMetadata object');
    } else {
      if (!rec.annotationMetadata.status || !VALID_ANNOTATION_STATUSES.has(rec.annotationMetadata.status)) {
        failRule(rule1, `Invalid annotationMetadata.status: "${rec.annotationMetadata.status}". Must be VERIFIED, DRAFT, or REJECTED`);
      }
      if (options?.allowDrafts === false && rec.annotationMetadata.status !== 'VERIFIED') {
        failRule(rule1, `Record has status "${rec.annotationMetadata.status}". Strict validation requires status VERIFIED`);
      }
      if (!rec.annotationMetadata.annotatorType || !VALID_ANNOTATOR_TYPES.has(rec.annotationMetadata.annotatorType)) {
        failRule(rule1, `Invalid annotationMetadata.annotatorType: "${rec.annotationMetadata.annotatorType}"`);
      }
      if (!rec.annotationMetadata.author || typeof rec.annotationMetadata.author !== 'string' || !rec.annotationMetadata.author.trim()) {
        failRule(rule1, 'Missing annotationMetadata.author');
      }
      if (!rec.annotationMetadata.verifiedAt || isNaN(Date.parse(rec.annotationMetadata.verifiedAt))) {
        failRule(rule1, `Invalid annotationMetadata.verifiedAt: "${rec.annotationMetadata.verifiedAt}"`);
      }
    }

    if (!ruleResults[rule1]) {
      passRule(rule1, 'Schema integrity and mandatory fields verified');
    }

    // Resolve index context if not provided
    const indices = indexContext !== undefined ? indexContext : this.indexStore.getIndex(repositoryId, options?.indexDirectory);

    if (!indices && options?.requireIndices) {
      failRule('rule2_repository_snapshot_isolation', `Repository index not found for "${repositoryId}" and requireIndices is true`);
    }

    // ------------------------------------------------------------------------
    // Rule 2: Repository and Snapshot Isolation
    // ------------------------------------------------------------------------
    const rule2 = 'rule2_repository_snapshot_isolation';
    let rule2Passed = true;

    if (indices?.manifest) {
      if (indices.manifest.pinned_commit_sha && indices.manifest.pinned_commit_sha !== rec.repository?.commitSha) {
        failRule(rule2, `Commit SHA mismatch: record declares "${rec.repository?.commitSha}", but repository manifest pinned "${indices.manifest.pinned_commit_sha}"`);
        rule2Passed = false;
      }
      if (indices.manifest.snapshot_timestamp && rec.repository?.snapshotTimestamp && indices.manifest.snapshot_timestamp !== rec.repository.snapshotTimestamp) {
        warnRule(rule2, `Snapshot timestamp differs from manifest: record has "${rec.repository?.snapshotTimestamp}", manifest has "${indices.manifest.snapshot_timestamp}"`);
      }
    }

    // Check cross-repository identifier leaks across targetNode, contextInputs, claims, and anchors
    const foreignRepoPattern = /EEID-REPO-\d+/g;
    const checkRepoId = (identifier: string, contextDesc: string) => {
      const matches = identifier.match(foreignRepoPattern);
      if (matches) {
        for (const match of matches) {
          if (match !== repositoryId) {
            failRule(rule2, `Cross-repository reference detected in ${contextDesc}: "${identifier}" references "${match}" instead of "${repositoryId}"`);
            rule2Passed = false;
          }
        }
      }
    };

    if (rec.targetNode?.id) checkRepoId(rec.targetNode.id, 'targetNode.id');
    rec.contextInputs?.retrievalUnitIds?.forEach((id) => checkRepoId(id, 'contextInputs.retrievalUnitIds'));
    rec.contextInputs?.graphNodeIds?.forEach((id) => checkRepoId(id, 'contextInputs.graphNodeIds'));
    rec.contextInputs?.graphEdgeIds?.forEach((id) => checkRepoId(id, 'contextInputs.graphEdgeIds'));
    rec.expectedClaims?.forEach((c) => c.evidenceIds?.forEach((id) => checkRepoId(id, `claim[${c.claimId}].evidenceIds`)));

    if (rec.whatIfGroundTruth) {
      rec.whatIfGroundTruth.directlyAffectedNodeIds?.forEach((id) => checkRepoId(id, 'whatIfGroundTruth.directlyAffectedNodeIds'));
      rec.whatIfGroundTruth.indirectlyAffectedNodeIds?.forEach((id) => checkRepoId(id, 'whatIfGroundTruth.indirectlyAffectedNodeIds'));
      rec.whatIfGroundTruth.dependencyPaths?.forEach((pathArr, pIdx) => {
        pathArr.forEach((item, i) => {
          checkRepoId(item, `whatIfGroundTruth.dependencyPaths[${pIdx}][${i}]`);
        });
      });
    }

    if (rule2Passed) {
      passRule(rule2, 'Repository isolation confirmed: 0 cross-repo identifier collisions');
    }

    // ------------------------------------------------------------------------
    // Rule 3: Target Node Validation
    // ------------------------------------------------------------------------
    const rule3 = 'rule3_target_node_validation';
    let rule3Passed = true;

    if (indices && rec.targetNode?.id) {
      const indexedNode = indices.nodes.get(rec.targetNode.id);
      if (!indexedNode) {
        failRule(rule3, `Target node "${rec.targetNode.id}" does not exist in repository nodes.jsonl snapshot`);
        rule3Passed = false;
      } else {
        if (rec.targetNode.type && indexedNode.type && rec.targetNode.type.toUpperCase() !== indexedNode.type.toUpperCase()) {
          failRule(rule3, `Target node type mismatch for "${rec.targetNode.id}": record declares "${rec.targetNode.type}", index has "${indexedNode.type}"`);
          rule3Passed = false;
        }
        if (rec.targetNode.filePath) {
          const indexPath = indexedNode.metadata?.path || indexedNode.metadata?.filePath;
          if (indexPath && indexPath !== rec.targetNode.filePath) {
            failRule(rule3, `Target node filePath mismatch for "${rec.targetNode.id}": record has "${rec.targetNode.filePath}", index has "${indexPath}"`);
            rule3Passed = false;
          }
        }
      }
    } else if (!indices) {
      warnRule(rule3, 'Indices omitted: target node existence could not be verified against graph snapshot');
    }

    if (rule3Passed && !ruleResults[rule3]) {
      passRule(rule3, 'Target node verified in snapshot index');
    }

    // ------------------------------------------------------------------------
    // Rule 4: Source Anchor Verification
    // ------------------------------------------------------------------------
    const rule4 = 'rule4_source_anchor_verification';
    let rule4Passed = true;

    rec.expectedClaims?.forEach((claim) => {
      claim.sourceAnchors?.forEach((anchor, anchorIdx) => {
        const anchorDesc = `claim[${claim.claimId}].sourceAnchors[${anchorIdx}] (${anchor.filePath})`;

        if (!anchor.filePath || typeof anchor.filePath !== 'string') {
          failRule(rule4, `Missing filePath in ${anchorDesc}`);
          rule4Passed = false;
          return;
        }

        if (typeof anchor.sourceLineStart !== 'number' || anchor.sourceLineStart < 1) {
          failRule(rule4, `Invalid sourceLineStart (${anchor.sourceLineStart}) in ${anchorDesc}: must be >= 1 (1-based)`);
          rule4Passed = false;
        }

        if (typeof anchor.sourceLineEndExclusive !== 'number' || anchor.sourceLineEndExclusive <= anchor.sourceLineStart) {
          failRule(
            rule4,
            `Invalid half-open range [${anchor.sourceLineStart}, ${anchor.sourceLineEndExclusive}) in ${anchorDesc}: endExclusive must be > start`
          );
          rule4Passed = false;
        }

        if (!anchor.contentHash || !/^[0-9a-f]{64}$/i.test(anchor.contentHash)) {
          failRule(rule4, `Invalid contentHash in ${anchorDesc}: must be a 64-char hex SHA-256`);
          rule4Passed = false;
        }

        // Verify against materialized source files if available
        if (indices) {
          const sourceFile = indices.sourceFiles.get(anchor.filePath);
          if (!sourceFile) {
            failRule(rule4, `File "${anchor.filePath}" referenced by ${anchorDesc} does not exist in repository source index`);
            rule4Passed = false;
          } else {
            const totalLines = sourceFile.lines.length;
            if (anchor.sourceLineEndExclusive > totalLines + 1) {
              failRule(
                rule4,
                `Range overflow in ${anchorDesc}: endExclusive ${anchor.sourceLineEndExclusive} exceeds file limit ${totalLines + 1} (${totalLines} lines)`
              );
              rule4Passed = false;
            }

            if (anchor.blobSha && sourceFile.blobSha && anchor.blobSha !== sourceFile.blobSha) {
              failRule(
                rule4,
                `Git blob SHA mismatch in ${anchorDesc}: anchor has "${anchor.blobSha}", snapshot has "${sourceFile.blobSha}"`
              );
              rule4Passed = false;
            }

            // Recompute SHA-256 content hash on exact slice [start - 1, endExclusive - 1)
            const sliceLines = sourceFile.lines.slice(anchor.sourceLineStart - 1, anchor.sourceLineEndExclusive - 1);
            const sliceText = sliceLines.join('\n');
            const computedSliceHash = crypto.createHash('sha256').update(sliceText).digest('hex');

            // Also check with trailing newline
            const computedSliceWithNLHash = crypto.createHash('sha256').update(sliceText + '\n').digest('hex');

            if (anchor.contentHash !== computedSliceHash && anchor.contentHash !== computedSliceWithNLHash) {
              // Check if matching a known retrieval unit in source_index
              let matchedUnitHash = false;
              for (const unit of indices.retrievalUnits.values()) {
                if (
                  unit.file_path === anchor.filePath &&
                  unit.source_line_start === anchor.sourceLineStart &&
                  unit.source_line_end_exclusive === anchor.sourceLineEndExclusive
                ) {
                  if (unit.content_hash === anchor.contentHash) {
                    matchedUnitHash = true;
                    break;
                  }
                }
              }

              if (!matchedUnitHash) {
                failRule(
                  rule4,
                  `SHA-256 content hash mismatch in ${anchorDesc}: declared "${anchor.contentHash}", recomputed "${computedSliceHash}"`
                );
                rule4Passed = false;
              }
            }
          }
        }
      });
    });

    if (rule4Passed && !ruleResults[rule4]) {
      passRule(rule4, 'Source anchors verified: 1-based half-open ranges and SHA-256 hashes matched');
    }

    // ------------------------------------------------------------------------
    // Rule 5: Evidence Reference Integrity
    // ------------------------------------------------------------------------
    const rule5 = 'rule5_evidence_reference_integrity';
    let rule5Passed = true;

    if (indices) {
      rec.expectedClaims?.forEach((claim) => {
        claim.evidenceIds.forEach((evId) => {
          const existsInRetrieval = indices.retrievalUnits.has(evId);
          const existsInNodes = indices.nodes.has(evId);
          const existsInEdges = indices.edges.has(evId);
          const existsInHistory = indices.history.has(evId);

          if (!existsInRetrieval && !existsInNodes && !existsInEdges && !existsInHistory) {
            failRule(rule5, `Claim "${claim.claimId}" references non-existent evidence ID: "${evId}"`);
            rule5Passed = false;
          }
        });
      });

      if (rec.annotationMetadata?.status === 'DRAFT') {
        warnRule(rule5, 'Record in DRAFT status: Evidence IDs are structurally valid, but semantic entailment requires human review before marking VERIFIED.');
      }
    } else {
      warnRule(rule5, 'Indices omitted: evidence IDs could not be structurally verified against repository indices');
    }

    if (rule5Passed && !ruleResults[rule5]) {
      passRule(rule5, 'Evidence references structurally valid');
    }

    // ------------------------------------------------------------------------
    // Rule 6: Claim Classification & Confidence Invariants
    // ------------------------------------------------------------------------
    const rule6 = 'rule6_claim_classification';
    let rule6Passed = true;

    rec.expectedClaims?.forEach((claim) => {
      const claimPath = `claim[${claim.claimId}]`;

      if (claim.classification === 'FACT') {
        if (!claim.evidenceIds || claim.evidenceIds.length === 0) {
          failRule(rule6, `FACT claim ${claimPath} must have at least one supporting evidence ID`);
          rule6Passed = false;
        }
        if (claim.sourceAnchors.length === 0 && (!claim.evidenceIds.some((id) => id.includes('commit') || id.includes('pr') || id.includes('issue')))) {
          failRule(rule6, `FACT claim ${claimPath} must have at least one source anchor or historical evidence reference`);
          rule6Passed = false;
        }
        if (claim.confidenceTier === 'ABSENT' || claim.confidenceTier === 'SPECULATIVE') {
          failRule(rule6, `FACT claim ${claimPath} cannot have confidenceTier "${claim.confidenceTier}". Must be DEFINITIVE or HIGH`);
          rule6Passed = false;
        }
      } else if (claim.classification === 'INFERENCE') {
        if (!claim.evidenceIds || claim.evidenceIds.length === 0) {
          failRule(rule6, `INFERENCE claim ${claimPath} must have supporting evidence IDs`);
          rule6Passed = false;
        }
        if (!claim.reasoning || !claim.reasoning.trim()) {
          failRule(rule6, `INFERENCE claim ${claimPath} must provide a non-empty reasoning explanation`);
          rule6Passed = false;
        }
        if (claim.confidenceTier === 'DEFINITIVE' || claim.confidenceTier === 'ABSENT') {
          failRule(rule6, `INFERENCE claim ${claimPath} cannot have confidenceTier "${claim.confidenceTier}". Must be HIGH or SPECULATIVE`);
          rule6Passed = false;
        }
      } else if (claim.classification === 'UNKNOWN') {
        if (claim.confidenceTier === 'DEFINITIVE') {
          failRule(rule6, `UNKNOWN claim ${claimPath} cannot have confidenceTier "DEFINITIVE". Must be ABSENT or SPECULATIVE`);
          rule6Passed = false;
        }
      }
    });

    if (rule6Passed) {
      passRule(rule6, 'Claim classifications (FACT, INFERENCE, UNKNOWN) conform strictly to evidence invariants');
    }

    // ------------------------------------------------------------------------
    // Rule 7: Temporal Consistency
    // ------------------------------------------------------------------------
    const rule7 = 'rule7_temporal_consistency';
    let rule7Passed = true;

    if (rec.repository?.snapshotTimestamp && indices) {
      const snapshotTime = Date.parse(rec.repository.snapshotTimestamp);

      rec.contextInputs?.historyStepIds?.forEach((stepId) => {
        const historyItem = indices.history.get(stepId);
        if (historyItem) {
          const itemTime = historyItem.created_at ? Date.parse(historyItem.created_at) : null;
          const mergedTime = historyItem.merged_at ? Date.parse(historyItem.merged_at) : null;
          const updatedTime = historyItem.updated_at ? Date.parse(historyItem.updated_at) : null;

          if (
            historyItem.temporal_status === 'post_snapshot_update_do_not_use_as_pre_snapshot_evidence' ||
            historyItem.temporal_status === 'boundary_case_post_snapshot_merge_do_not_use_as_pre_snapshot_evidence'
          ) {
            failRule(rule7, `Temporal leakage: History reference "${stepId}" is marked "${historyItem.temporal_status}" and cannot be used as pre-snapshot evidence`);
            rule7Passed = false;
          } else if (itemTime && itemTime > snapshotTime) {
            failRule(rule7, `Temporal leakage: History item "${stepId}" created at "${historyItem.created_at}" is post-snapshot ("${rec.repository?.snapshotTimestamp}")`);
            rule7Passed = false;
          } else if (mergedTime && mergedTime > snapshotTime) {
            failRule(rule7, `Temporal leakage: History item "${stepId}" merged at "${historyItem.merged_at}" is post-snapshot ("${rec.repository?.snapshotTimestamp}")`);
            rule7Passed = false;
          }
        } else {
          warnRule(rule7, `History step "${stepId}" not found in history.jsonl; temporal cutoff could not be verified`);
        }
      });
    }

    if (rule7Passed && !ruleResults[rule7]) {
      passRule(rule7, 'Temporal consistency verified against pinned snapshot cutoff');
    }

    // ------------------------------------------------------------------------
    // Rule 8: WHAT IF Graph Traversal Validation
    // ------------------------------------------------------------------------
    const rule8 = 'rule8_what_if_graph_validation';
    let rule8Passed = true;

    if (rec.category === 'IMPACT_ANALYSIS') {
      const whatIf = rec.whatIfGroundTruth;
      if (!whatIf || typeof whatIf !== 'object') {
        failRule(rule8, 'Category IMPACT_ANALYSIS requires a valid whatIfGroundTruth block');
        rule8Passed = false;
      } else {
        if (!whatIf.operation || !VALID_WHAT_IF_OPERATIONS.has(whatIf.operation)) {
          failRule(rule8, `Invalid whatIfGroundTruth.operation: "${whatIf.operation}". Must be REMOVE, MODIFY, REPLACE, or DEPRECATE`);
          rule8Passed = false;
        }

        if (typeof whatIf.blastRadiusScore !== 'number' || whatIf.blastRadiusScore < 0 || whatIf.blastRadiusScore > 100) {
          failRule(rule8, `Invalid blastRadiusScore (${whatIf.blastRadiusScore}): must be a number between 0 and 100`);
          rule8Passed = false;
        }

        if (!Array.isArray(whatIf.staticCertainty)) {
          failRule(rule8, 'whatIfGroundTruth.staticCertainty must be an array of strings');
          rule8Passed = false;
        }

        if (!Array.isArray(whatIf.runtimeUncertainties)) {
          failRule(rule8, 'whatIfGroundTruth.runtimeUncertainties must be an array of strings');
          rule8Passed = false;
        }

        if (!Array.isArray(whatIf.directlyAffectedNodeIds) || !Array.isArray(whatIf.indirectlyAffectedNodeIds)) {
          failRule(rule8, 'directlyAffectedNodeIds and indirectlyAffectedNodeIds must be arrays');
          rule8Passed = false;
        }

        if (!Array.isArray(whatIf.dependencyPaths)) {
          failRule(rule8, 'whatIfGroundTruth.dependencyPaths must be an array of path arrays');
          rule8Passed = false;
        } else {
          // Validate each path
          whatIf.dependencyPaths.forEach((pathArr, pIdx) => {
            const pathDesc = `dependencyPaths[${pIdx}]`;
            if (!Array.isArray(pathArr) || pathArr.length < 3 || pathArr.length % 2 === 0) {
              failRule(rule8, `${pathDesc} must be an odd-length sequence [node0, edge0, node1, edge1, node2, ...] (length >= 3)`);
              rule8Passed = false;
              return;
            }

            // Check continuity and edge endpoints
            for (let i = 0; i < pathArr.length; i++) {
              const item = pathArr[i];
              if (i % 2 === 0) {
                // Node
                if (indices && !indices.nodes.has(item)) {
                  failRule(rule8, `${pathDesc} contains non-existent node "${item}"`);
                  rule8Passed = false;
                }
              } else {
                // Edge
                const edgeId = item;
                const prevNodeId = pathArr[i - 1];
                const nextNodeId = pathArr[i + 1];

                if (indices) {
                  const edge = indices.edges.get(edgeId);
                  if (!edge) {
                    failRule(rule8, `${pathDesc} contains non-existent edge "${edgeId}"`);
                    rule8Passed = false;
                  } else {
                    // Check endpoints connection
                    const forwardMatch = edge.source === prevNodeId && edge.target === nextNodeId;
                    const reverseMatch = edge.target === prevNodeId && edge.source === nextNodeId;

                    if (!forwardMatch && !reverseMatch) {
                      failRule(
                        rule8,
                        `Disconnected graph edge "${edgeId}" in ${pathDesc}: edge connects (${edge.source} -> ${edge.target}), but path expected link between (${prevNodeId} <-> ${nextNodeId})`
                      );
                      rule8Passed = false;
                    }
                  }
                }
              }
            }

            // Verify path endpoints
            const pathStartNode = pathArr[0];
            const pathEndNode = pathArr[pathArr.length - 1];

            const isStartConnected =
              pathStartNode === rec.targetNode?.id ||
              whatIf.directlyAffectedNodeIds.includes(pathStartNode) ||
              pathEndNode === rec.targetNode?.id;

            if (!isStartConnected) {
              failRule(rule8, `${pathDesc} is disconnected from targetNode "${rec.targetNode?.id}"`);
              rule8Passed = false;
            }
          });
        }
      }
    }

    if (rule8Passed && !ruleResults[rule8]) {
      passRule(rule8, 'WHAT IF impact graph traversal, continuity, endpoints, and blast radius validated');
    }

    // ------------------------------------------------------------------------
    // Final Result Aggregation
    // ------------------------------------------------------------------------
    const passed = options?.strict ? errors.length === 0 && warnings.length === 0 : errors.length === 0;

    return {
      passed,
      recordId,
      repositoryId,
      errors,
      warnings,
      validationRuleResults: ruleResults
    };
  }

  /**
   * Validate an entire JSONL file line-by-line.
   * Invariant: Never mutates or overwrites the source file.
   */
  public validateJsonlFile(filePath: string, options?: ValidatorOptions): FileValidationSummary {
    if (!fs.existsSync(filePath)) {
      throw new Error(`EEID file not found at: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');

    const results: RecordValidationResult[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let totalErrors = 0;
    let totalWarnings = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const record = JSON.parse(line);
        const result = this.validate(record, undefined, options);
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
        const parseErrResult: RecordValidationResult = {
          passed: false,
          recordId: `LINE_${i + 1}`,
          repositoryId: 'PARSE_ERROR',
          errors: [`[JSON_PARSE_ERROR] Line ${i + 1} is not valid JSON: ${err?.message || err}`],
          warnings: [],
          validationRuleResults: {
            rule1_schema_integrity: { passed: false, message: 'JSON Parse Failure' }
          }
        };
        results.push(parseErrResult);
      }
    }

    const overallPassed = options?.strict ? failedCount === 0 && totalWarnings === 0 : failedCount === 0;

    return {
      passed: overallPassed,
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
// 4. CLI Runner
// ============================================================================

export function runCli(): void {
  const args = process.argv.slice(2);
  let filePath: string | null = null;
  let indexDir: string | null = null;
  let strict = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '-f') {
      filePath = args[++i];
    } else if (args[i] === '--index-dir' || args[i] === '-i') {
      indexDir = args[++i];
    } else if (args[i] === '--strict') {
      strict = true;
    }
  }

  if (!filePath) {
    console.log(`
EngiTrace EEID Automated Dataset Record Validator
Usage:
  npx tsx validate_eeid_record.ts --file <path-to-records.jsonl> [--index-dir <pilot-output-dir>] [--strict]

Options:
  --file, -f       Path to the .jsonl records file to validate (required)
  --index-dir, -i  Path to repository index output directory (default: ./eeid/pilot-output)
  --strict         Strict CI mode: fail if any errors or warnings occur
    `);
    process.exit(0);
  }

  console.log(`\n======================================================`);
  console.log(`EngiTrace EEID Automated Record Validator`);
  console.log(`Validating: ${filePath}`);
  console.log(`Strict Mode: ${strict ? 'ENABLED' : 'DISABLED'}`);
  console.log(`======================================================\n`);

  const validator = new EEIDRecordValidator({
    indexDirectory: indexDir || undefined,
    strict
  });

  try {
    const summary = validator.validateJsonlFile(filePath, { strict });

    summary.results.forEach((r) => {
      const icon = r.passed ? '✓ PASS' : '❌ FAIL';
      console.log(`[${icon}] ${r.recordId} (${r.repositoryId})`);
      r.errors.forEach((e) => console.log(`    Error: ${e}`));
      r.warnings.forEach((w) => console.log(`    Warning: ${w}`));
    });

    console.log(`\n------------------------------------------------------`);
    console.log(`Total Records:  ${summary.totalRecords}`);
    console.log(`Passed Records: ${summary.passedRecords}`);
    console.log(`Failed Records: ${summary.failedRecords}`);
    console.log(`Total Errors:   ${summary.totalErrors}`);
    console.log(`Total Warnings: ${summary.totalWarnings}`);
    console.log(`Status:         ${summary.passed ? 'ALL CHECKS PASSED' : 'VALIDATION FAILED'}`);
    console.log(`------------------------------------------------------\n`);

    process.exit(summary.passed ? 0 : 1);
  } catch (err: any) {
    console.error(`Fatal Validation Error: ${err?.message || err}`);
    process.exit(1);
  }
}

// Direct execution entry point
if (require.main === module) {
  runCli();
}
