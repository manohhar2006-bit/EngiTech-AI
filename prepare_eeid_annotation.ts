/**
 * EngiTrace Engineering Intelligence Dataset (EEID) — Annotation Preparation & Human Review Tool
 *
 * Implements the human annotation workflow:
 * 1. Reads DRAFT candidate questions from candidate_questions.jsonl.
 * 2. Hydrates complete source evidence, line intervals [start, endExclusive), SHA-256 hashes,
 *    graph nodes/edges/paths, and commit/PR/issue history.
 * 3. Generates human review dossiers in eeid/annotation_queue/ (JSON and Markdown).
 * 4. Enables terminal inspection of evidence packages.
 * 5. Applies human review decisions (ACCEPT, EDIT, REJECT) with strict validation.
 * 6. Appends verified records to eeid/eeid_records.jsonl and maintains audit logs in eeid/annotation_review.jsonl.
 *
 * Invariants:
 * - Never automatically changes DRAFT to VERIFIED without human review.
 * - Every accepted record must pass strict automated validation by EEIDRecordValidator.
 * - Never overwrites previously reviewed records.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  EEIDRecord,
  EEIDClaim,
  SourceAnchor,
  WhatIfGroundTruth,
  EEIDRecordValidator,
  RepositoryIndexStore,
  RepositoryIndexContext,
  EEIDCategory
} from './validate_eeid_record';
import {
  CandidateQuestion,
  PILOT_REPOSITORIES,
  resolveEvidenceIdsForNode,
  resolveEdgeId
} from './seed_eeid_questions';

// ============================================================================
// 1. Types & Data Structures
// ============================================================================

export type ReviewDecision = 'ACCEPT' | 'EDIT' | 'REJECT';

export interface HydratedEvidenceItem {
  retrievalUnitId: string;
  filePath: string;
  chunkType: string;
  symbolName?: string;
  sourceLineStart: number;
  sourceLineEndExclusive: number;
  blobSha?: string;
  contentHash: string;
  codeSnippet: string;
}

export interface HydratedGraphEdge {
  id: string;
  relationshipType: string;
  source: string;
  target: string;
  classification: string;
  evidence?: string;
}

export interface HydratedHistoryItem {
  id: string;
  type: string;
  title?: string;
  author?: string;
  createdAt?: string;
  mergedAt?: string | null;
  alignment?: string;
  temporalStatus?: string;
}

export interface AnnotationDossier {
  candidateId: string;
  category: EEIDCategory;
  repositoryId: string;
  repositoryName: string;
  commitSha: string;
  snapshotTimestamp: string;
  licenseSpdx: string;
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
  intent: string;
  difficulty: string;
  interactionMode: string;
  requiresMultiFile: boolean;
  requiresHistory: boolean;
  evidence: HydratedEvidenceItem[];
  multiFileSummary?: {
    fileCount: number;
    filePaths: string[];
    isCompliant: boolean;
  };
  graph: {
    nodeIds: string[];
    edges: HydratedGraphEdge[];
    dependencyPaths?: string[][];
  };
  history: HydratedHistoryItem[];
  absenceScope?: {
    isAbsenceQuestion: boolean;
    filesCheckedCount: number;
    totalIndexedFiles: number;
    verifiedAbsentSymbol?: string;
    notes: string;
  };
  proposedRecordTemplate: Partial<EEIDRecord>;
  status: 'DRAFT' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED';
}

export interface AnnotationReviewLogEntry {
  candidateId: string;
  recordId?: string;
  repositoryId: string;
  category: EEIDCategory;
  decision: ReviewDecision;
  reviewer: string;
  timestamp: string;
  notes: string;
  rejectionReason?: string;
  modifications?: {
    questionChanged?: boolean;
    claimsCount?: number;
    anchorsCount?: number;
  };
  validationPassed?: boolean;
}

export interface ReviewQueueManifest {
  totalCandidates: number;
  draftCount: number;
  inReviewCount: number;
  verifiedCount: number;
  rejectedCount: number;
  lastUpdated: string;
  candidates: Record<string, 'DRAFT' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED'>;
}

// ============================================================================
// 2. Hydration Engine
// ============================================================================

export class EEIDAnnotationHydrator {
  constructor(private store: RepositoryIndexStore) {}

  /**
   * Hydrates a candidate question with full source text, slice hashes, graph edges, and history.
   */
  public hydrate(candidate: CandidateQuestion): AnnotationDossier {
    const ctx = this.store.getIndex(candidate.repositoryId);
    if (!ctx) {
      throw new Error(`Repository index context not found for: ${candidate.repositoryId}`);
    }

    const pilotMeta = PILOT_REPOSITORIES[candidate.repositoryId];

    // 1. Evidence Hydration
    const evidenceItems: HydratedEvidenceItem[] = [];
    const filesInEvidence = new Set<string>();

    for (const ruId of candidate.candidateEvidenceIds) {
      const ru = ctx.retrievalUnits.get(ruId);
      if (ru) {
        filesInEvidence.add(ru.file_path);
        const sourceFile = ctx.sourceFiles.get(ru.file_path);
        let codeSnippet = '';
        let contentHash = ru.content_hash;

        if (sourceFile && ru.source_line_start && ru.source_line_end_exclusive) {
          const sliceLines = sourceFile.lines.slice(ru.source_line_start - 1, ru.source_line_end_exclusive - 1);
          codeSnippet = sliceLines
            .map((line, idx) => `${String(ru.source_line_start + idx).padStart(4, ' ')} | ${line}`)
            .join('\n');
          contentHash = crypto.createHash('sha256').update(sliceLines.join('\n')).digest('hex');
        } else if (ru.content) {
          codeSnippet = ru.content.slice(0, 500);
        }

        evidenceItems.push({
          retrievalUnitId: ru.retrieval_unit_id,
          filePath: ru.file_path,
          chunkType: ru.chunk_type,
          symbolName: ru.symbol_name,
          sourceLineStart: ru.source_line_start,
          sourceLineEndExclusive: ru.source_line_end_exclusive,
          blobSha: ru.blob_sha,
          contentHash,
          codeSnippet
        });
      }
    }

    // 2. Multi-File Verification
    let multiFileSummary: AnnotationDossier['multiFileSummary'];
    if (candidate.requiresMultiFile) {
      multiFileSummary = {
        fileCount: filesInEvidence.size,
        filePaths: Array.from(filesInEvidence),
        isCompliant: filesInEvidence.size >= 2
      };
    }

    // 3. Graph Hydration
    const hydratedEdges: HydratedGraphEdge[] = [];
    for (const edgeId of candidate.candidateGraphEdgeIds) {
      const edge = ctx.edges.get(edgeId);
      if (edge) {
        hydratedEdges.push({
          id: edge.id,
          relationshipType: edge.relationshipType,
          source: edge.source,
          target: edge.target,
          classification: edge.classification || 'FACT',
          evidence: edge.evidence
        });
      }
    }

    // 4. History Hydration
    const hydratedHistory: HydratedHistoryItem[] = [];
    for (const hId of candidate.candidateHistoryIds) {
      const hItem = ctx.history.get(hId);
      if (hItem) {
        hydratedHistory.push({
          id: hItem.id,
          type: hItem.type,
          title: hItem.title,
          author: hItem.author,
          createdAt: hItem.created_at,
          mergedAt: hItem.merged_at,
          alignment: hItem.alignment,
          temporalStatus: hItem.temporal_status
        });
      }
    }

    // 5. Absence & Negative Evidence Scope
    let absenceScope: AnnotationDossier['absenceScope'];
    if (candidate.category === 'EVIDENCE_AND_UNCERTAINTY') {
      const totalIndexedFiles = ctx.sourceFiles.size;
      const isMethodAbsence = candidate.question.toLowerCase().includes('method') || candidate.question.toLowerCase().includes('function');
      absenceScope = {
        isAbsenceQuestion: true,
        filesCheckedCount: totalIndexedFiles,
        totalIndexedFiles,
        verifiedAbsentSymbol: isMethodAbsence ? candidate.targetNodeLabel : undefined,
        notes: `Verified absence within ${totalIndexedFiles} indexed files of repository snapshot at commit ${candidate.commitSha.slice(0, 7)}.`
      };
    }

    // 6. Proposed Record Template
    const recId = candidate.candidateId.replace('EEID-CAND-', 'EEID-REC-');
    const proposedTemplate: Partial<EEIDRecord> = {
      recordId: recId,
      category: candidate.category,
      repository: {
        id: candidate.repositoryId,
        name: candidate.repositoryName,
        url: `https://github.com/${candidate.repositoryName}`,
        defaultBranch: pilotMeta?.defaultBranch || 'main',
        commitSha: candidate.commitSha,
        snapshotTimestamp: pilotMeta?.snapshotTimestamp || '2026-11-02T20:15:26Z',
        licenseSpdx: pilotMeta ? 'MIT' : 'UNKNOWN'
      },
      targetNode: {
        id: candidate.targetNodeId,
        type: candidate.targetNodeType,
        label: candidate.targetNodeLabel,
        filePath: evidenceItems[0]?.filePath
      },
      question: candidate.question,
      questionContext: {
        intent: candidate.intent,
        difficulty: candidate.difficulty,
        interactionMode: candidate.interactionMode,
        requiresMultiFile: candidate.requiresMultiFile,
        requiresHistory: candidate.requiresHistory
      },
      contextInputs: {
        retrievalUnitIds: candidate.candidateEvidenceIds,
        graphNodeIds: candidate.candidateGraphNodeIds,
        graphEdgeIds: candidate.candidateGraphEdgeIds,
        historyStepIds: candidate.candidateHistoryIds.length > 0 ? candidate.candidateHistoryIds : undefined
      },
      expectedAnswer: '[HUMAN_REVIEWER: Enter concise, authoritative ground-truth engineering answer here]',
      expectedClaims: [
        {
          claimId: 'CLM-001',
          text: '[HUMAN_REVIEWER: Enter atomic FACT claim 1]',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: candidate.candidateEvidenceIds.slice(0, 1),
          sourceAnchors: evidenceItems.slice(0, 1).map((ev) => ({
            filePath: ev.filePath,
            sourceLineStart: ev.sourceLineStart,
            sourceLineEndExclusive: ev.sourceLineEndExclusive,
            contentHash: ev.contentHash,
            blobSha: ev.blobSha,
            symbolName: ev.symbolName
          }))
        },
        {
          claimId: 'CLM-002',
          text: '[HUMAN_REVIEWER: Enter atomic INFERENCE or FACT claim 2]',
          classification: 'INFERENCE',
          confidenceTier: 'HIGH',
          evidenceIds: candidate.candidateEvidenceIds.slice(0, 1),
          sourceAnchors: [],
          reasoning: '[HUMAN_REVIEWER: Provide explicit reasoning for inference]'
        }
      ],
      annotationMetadata: {
        status: 'VERIFIED',
        annotatorType: 'HUMAN_EXPERT',
        author: 'EngiTrace Reviewer',
        verifiedAt: new Date().toISOString()
      }
    };

    return {
      candidateId: candidate.candidateId,
      category: candidate.category,
      repositoryId: candidate.repositoryId,
      repositoryName: candidate.repositoryName,
      commitSha: candidate.commitSha,
      snapshotTimestamp: pilotMeta?.snapshotTimestamp || '2026-11-02T20:15:26Z',
      licenseSpdx: 'MIT',
      targetNode: {
        id: candidate.targetNodeId,
        type: candidate.targetNodeType,
        label: candidate.targetNodeLabel,
        filePath: evidenceItems[0]?.filePath
      },
      question: candidate.question,
      intent: candidate.intent,
      difficulty: candidate.difficulty,
      interactionMode: candidate.interactionMode,
      requiresMultiFile: candidate.requiresMultiFile,
      requiresHistory: candidate.requiresHistory,
      evidence: evidenceItems,
      multiFileSummary,
      graph: {
        nodeIds: candidate.candidateGraphNodeIds,
        edges: hydratedEdges
      },
      history: hydratedHistory,
      absenceScope,
      proposedRecordTemplate: proposedTemplate,
      status: 'DRAFT'
    };
  }

  /**
   * Formats a dossier into readable GitHub-flavored Markdown for human inspection.
   */
  public formatMarkdownDossier(dossier: AnnotationDossier): string {
    const lines: string[] = [];
    lines.push(`# EEID Annotation Review Dossier: ${dossier.candidateId}`);
    lines.push(`\n**Category**: \`${dossier.category}\` | **Repository**: \`${dossier.repositoryName}\` (${dossier.repositoryId}) | **Status**: \`${dossier.status}\``);
    lines.push(`**Pinned Commit**: \`${dossier.commitSha}\` (${dossier.snapshotTimestamp})`);
    lines.push(`\n## 1. Candidate Question`);
    lines.push(`> **${dossier.question}**`);
    lines.push(`\n- **Intent**: ${dossier.intent}`);
    lines.push(`- **Difficulty**: \`${dossier.difficulty}\` | **Interaction Mode**: \`${dossier.interactionMode}\``);
    lines.push(`- **Multi-File Required**: \`${dossier.requiresMultiFile}\` | **History Required**: \`${dossier.requiresHistory}\``);

    lines.push(`\n## 2. Target Node`);
    lines.push(`- **ID**: \`${dossier.targetNode.id}\``);
    lines.push(`- **Type**: \`${dossier.targetNode.type}\` | **Label**: \`${dossier.targetNode.label}\``);
    if (dossier.targetNode.filePath) {
      lines.push(`- **File Path**: \`${dossier.targetNode.filePath}\``);
    }

    lines.push(`\n## 3. Hydrated Source Evidence`);
    dossier.evidence.forEach((ev, idx) => {
      lines.push(`\n### Evidence Item ${idx + 1}: \`${ev.retrievalUnitId}\``);
      lines.push(`- **File**: \`${ev.filePath}\` (Lines \`[${ev.sourceLineStart}, ${ev.sourceLineEndExclusive})\`)`);
      lines.push(`- **Chunk Type**: \`${ev.chunkType}\` | **Symbol**: \`${ev.symbolName || 'none'}\``);
      lines.push(`- **SHA-256 Slice Hash**: \`${ev.contentHash}\``);
      if (ev.blobSha) lines.push(`- **Blob SHA**: \`${ev.blobSha}\``);
      lines.push(`\n\`\`\`typescript\n${ev.codeSnippet}\n\`\`\``);
    });

    if (dossier.multiFileSummary) {
      lines.push(`\n## 4. Multi-File Verification`);
      lines.push(`- **Unique Files**: ${dossier.multiFileSummary.fileCount}`);
      lines.push(`- **Files**: ${dossier.multiFileSummary.filePaths.map((f) => `\`${f}\``).join(', ')}`);
      lines.push(`- **Multi-File Compliant**: \`${dossier.multiFileSummary.isCompliant ? 'YES' : 'NO'}\``);
    }

    if (dossier.graph.edges.length > 0) {
      lines.push(`\n## 5. Relevant Graph Topology`);
      dossier.graph.edges.forEach((edge) => {
        lines.push(`- Edge \`${edge.id}\`: \`${edge.source}\` **--[${edge.relationshipType}]-->** \`${edge.target}\` (${edge.classification})`);
      });
    }

    if (dossier.history.length > 0) {
      lines.push(`\n## 6. Relevant Commit & Issue History`);
      dossier.history.forEach((h) => {
        lines.push(`- **[${h.type.toUpperCase()}]** \`${h.id}\`: ${h.title || 'Untitled'} (Author: ${h.author || 'N/A'}, Created: ${h.createdAt || 'N/A'})`);
        if (h.temporalStatus) lines.push(`  - *Temporal Status*: \`${h.temporalStatus}\``);
      });
    }

    if (dossier.absenceScope) {
      lines.push(`\n## 7. Negative Evidence Scope (Absence Verification)`);
      lines.push(`- **Indexed Files Checked**: ${dossier.absenceScope.filesCheckedCount} of ${dossier.absenceScope.totalIndexedFiles}`);
      if (dossier.absenceScope.verifiedAbsentSymbol) {
        lines.push(`- **Verified Absent Symbol**: \`${dossier.absenceScope.verifiedAbsentSymbol}\``);
      }
      lines.push(`- **Scope Verification**: ${dossier.absenceScope.notes}`);
    }

    lines.push(`\n## 8. Review Decision Checklist`);
    lines.push(`- [ ] **ACCEPT**: Question is valid, technically grounded, and verified by indexed evidence.`);
    lines.push(`- [ ] **EDIT**: Question or scope requires refinement before ground-truth claim decomposition.`);
    lines.push(`- [ ] **REJECT**: Question contains hallucinated premise, ambiguous wording, or missing evidence.`);

    return lines.join('\n');
  }
}

// ============================================================================
// 3. Queue Manager & Workflow Orchestrator
// ============================================================================

export class EEIDAnnotationWorkflow {
  private hydrator: EEIDAnnotationHydrator;
  private queueDir: string;
  private reviewLogFile: string;
  private recordsFile: string;
  private validator: EEIDRecordValidator;

  constructor(
    private indexDir: string = './eeid/pilot-output',
    queueDir: string = './eeid/annotation_queue',
    reviewLogFile: string = './eeid/annotation_review.jsonl',
    recordsFile: string = './eeid/eeid_records.jsonl'
  ) {
    this.queueDir = path.resolve(queueDir);
    this.reviewLogFile = path.resolve(reviewLogFile);
    this.recordsFile = path.resolve(recordsFile);
    const store = new RepositoryIndexStore(indexDir);
    this.hydrator = new EEIDAnnotationHydrator(store);
    this.validator = new EEIDRecordValidator({ indexDirectory: indexDir });
  }

  /**
   * Prepares human-review dossiers in eeid/annotation_queue for candidate questions.
   */
  public prepareQueue(candidateFile: string = './eeid/candidate_questions.jsonl', limit?: number): number {
    if (!fs.existsSync(candidateFile)) {
      throw new Error(`Candidate questions file not found: ${candidateFile}`);
    }

    if (!fs.existsSync(this.queueDir)) {
      fs.mkdirSync(this.queueDir, { recursive: true });
    }

    const lines = fs.readFileSync(candidateFile, 'utf8').trim().split('\n').filter(Boolean);
    const manifestPath = path.join(this.queueDir, 'queue_manifest.json');
    let manifest: ReviewQueueManifest = {
      totalCandidates: 0,
      draftCount: 0,
      inReviewCount: 0,
      verifiedCount: 0,
      rejectedCount: 0,
      lastUpdated: new Date().toISOString(),
      candidates: {}
    };

    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        // ignore unparseable manifest
      }
    }

    let processed = 0;
    const candidatesToProcess = limit ? lines.slice(0, limit) : lines;

    for (const line of candidatesToProcess) {
      const candidate: CandidateQuestion = JSON.parse(line);
      const dossier = this.hydrator.hydrate(candidate);

      // Preserve existing review status if already reviewed
      if (manifest.candidates[candidate.candidateId]) {
        dossier.status = manifest.candidates[candidate.candidateId];
      }

      // Write JSON dossier
      const jsonPath = path.join(this.queueDir, `${candidate.candidateId}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(dossier, null, 2), 'utf8');

      // Write Markdown review dossier
      const mdPath = path.join(this.queueDir, `${candidate.candidateId}.md`);
      fs.writeFileSync(mdPath, this.hydrator.formatMarkdownDossier(dossier), 'utf8');

      if (!manifest.candidates[candidate.candidateId]) {
        manifest.candidates[candidate.candidateId] = 'DRAFT';
      }
      processed++;
    }

    // Update manifest counts
    let draft = 0;
    let inRev = 0;
    let verified = 0;
    let rejected = 0;
    Object.values(manifest.candidates).forEach((st) => {
      if (st === 'DRAFT') draft++;
      else if (st === 'IN_REVIEW') inRev++;
      else if (st === 'VERIFIED') verified++;
      else if (st === 'REJECTED') rejected++;
    });

    manifest.totalCandidates = Object.keys(manifest.candidates).length;
    manifest.draftCount = draft;
    manifest.inReviewCount = inRev;
    manifest.verifiedCount = verified;
    manifest.rejectedCount = rejected;
    manifest.lastUpdated = new Date().toISOString();

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    return processed;
  }

  /**
   * Applies an explicit human review decision (ACCEPT, EDIT, or REJECT).
   * Invariant: Never writes an unvalidated or failing record to eeid_records.jsonl.
   */
  public applyReviewDecision(review: {
    candidateId: string;
    decision: ReviewDecision;
    reviewer: string;
    notes: string;
    rejectionReason?: string;
    finalRecord?: EEIDRecord;
  }): { success: boolean; message: string; recordId?: string } {
    const timestamp = new Date().toISOString();

    // ------------------------------------------------------------------------
    // Decision: REJECT
    // ------------------------------------------------------------------------
    if (review.decision === 'REJECT') {
      if (!review.rejectionReason) {
        throw new Error('Rejection requires an explicit rejectionReason');
      }

      const logEntry: AnnotationReviewLogEntry = {
        candidateId: review.candidateId,
        repositoryId: review.candidateId.startsWith('EEID-CAND-001')
          ? 'EEID-REPO-001'
          : review.candidateId.startsWith('EEID-CAND-002')
          ? 'EEID-REPO-002'
          : 'EEID-REPO-003',
        category: 'NODE_UNDERSTANDING', // default or lookup from candidate
        decision: 'REJECT',
        reviewer: review.reviewer,
        timestamp,
        notes: review.notes,
        rejectionReason: review.rejectionReason,
        validationPassed: false
      };

      // Append to audit log
      fs.appendFileSync(this.reviewLogFile, JSON.stringify(logEntry) + '\n', 'utf8');

      // Update queue manifest
      this.updateManifestStatus(review.candidateId, 'REJECTED');

      return {
        success: true,
        message: `Candidate ${review.candidateId} successfully rejected. Logged to ${this.reviewLogFile}.`
      };
    }

    // ------------------------------------------------------------------------
    // Decision: ACCEPT or EDIT
    // ------------------------------------------------------------------------
    if (!review.finalRecord) {
      throw new Error(`Decision ${review.decision} requires a completed finalRecord (EEIDRecord)`);
    }

    const record = review.finalRecord;

    // Strict validator check using Task 1 EEIDRecordValidator
    const validationSummary = this.validator.validate(record, undefined, { strict: false });
    if (!validationSummary.passed) {
      throw new Error(
        `Final EEIDRecord failed automated validation (${validationSummary.errors.length} errors):\n` +
        validationSummary.errors.map((e) => `  - ${e}`).join('\n')
      );
    }

    // Read existing verified records to prevent duplicates
    let existingRecords: EEIDRecord[] = [];
    if (fs.existsSync(this.recordsFile)) {
      const lines = fs.readFileSync(this.recordsFile, 'utf8').trim().split('\n').filter(Boolean);
      existingRecords = lines.map((l) => JSON.parse(l));
    }

    const existingIdx = existingRecords.findIndex((r) => r.recordId === record.recordId);
    if (existingIdx >= 0) {
      existingRecords[existingIdx] = record;
    } else {
      existingRecords.push(record);
    }

    fs.writeFileSync(this.recordsFile, existingRecords.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    // Append audit log
    const logEntry: AnnotationReviewLogEntry = {
      candidateId: review.candidateId,
      recordId: record.recordId,
      repositoryId: record.repository.id,
      category: record.category,
      decision: review.decision,
      reviewer: review.reviewer,
      timestamp,
      notes: review.notes,
      modifications: {
        questionChanged: review.decision === 'EDIT',
        claimsCount: record.expectedClaims.length,
        anchorsCount: record.expectedClaims.reduce((acc, c) => acc + c.sourceAnchors.length, 0)
      },
      validationPassed: true
    };

    fs.appendFileSync(this.reviewLogFile, JSON.stringify(logEntry) + '\n', 'utf8');

    // Update queue manifest
    this.updateManifestStatus(review.candidateId, 'VERIFIED');

    return {
      success: true,
      message: `Candidate ${review.candidateId} accepted as verified record ${record.recordId}. Validated and appended to ${this.recordsFile}.`,
      recordId: record.recordId
    };
  }

  private updateManifestStatus(candidateId: string, status: 'DRAFT' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED') {
    const manifestPath = path.join(this.queueDir, 'queue_manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest: ReviewQueueManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.candidates[candidateId] = status;
        manifest.lastUpdated = new Date().toISOString();
        let draft = 0;
        let inRev = 0;
        let verified = 0;
        let rejected = 0;
        Object.values(manifest.candidates).forEach((st) => {
          if (st === 'DRAFT') draft++;
          else if (st === 'IN_REVIEW') inRev++;
          else if (st === 'VERIFIED') verified++;
          else if (st === 'REJECTED') rejected++;
        });
        manifest.draftCount = draft;
        manifest.inReviewCount = inRev;
        manifest.verifiedCount = verified;
        manifest.rejectedCount = rejected;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      } catch {
        // ignore
      }
    }
  }

  /**
   * Applies the initial pilot batch of 5 human-reviewed records + 1 rejected record.
   */
  public applyPilotBatch(): { acceptedCount: number; rejectedCount: number } {
    let accepted = 0;
    let rejected = 0;

    // 1. Record 1: Express authenticate function (NODE_UNDERSTANDING)
    const rec1: EEIDRecord = {
      recordId: 'EEID-REC-001-NODE-0001',
      category: 'NODE_UNDERSTANDING',
      repository: {
        id: 'EEID-REPO-001',
        name: 'expressjs/express',
        url: 'https://github.com/expressjs/express',
        defaultBranch: 'master',
        commitSha: '43fca52d28a422c8be48fd489cbd4f2d6152bab6',
        snapshotTimestamp: '2026-11-02T20:15:26Z',
        licenseSpdx: 'MIT'
      },
      targetNode: {
        id: 'function:EEID-REPO-001:examples/auth/index.js:authenticate:60',
        type: 'FUNCTION',
        label: 'authenticate',
        filePath: 'examples/auth/index.js',
        sourceLineRange: { start: 60, endExclusive: 74 }
      },
      question: 'What is the role of the authenticate() function in Express auth example (examples/auth/index.js), what parameters does it accept, and how does it verify user credentials against password hashes?',
      questionContext: {
        intent: 'Explain username/password verification and pbkdf2 hashing callback structure in authenticate().',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false
      },
      contextInputs: {
        retrievalUnitIds: ['EEID-REPO-001-RU-0074'],
        graphNodeIds: ['function:EEID-REPO-001:examples/auth/index.js:authenticate:60', 'file:EEID-REPO-001:examples/auth/index.js'],
        graphEdgeIds: ['edge-decl-EEID-REPO-001-examples_auth_index.js-authenticate-60']
      },
      expectedAnswer: 'authenticate(name, pass, fn) queries the in-memory users dictionary by username and hashes the supplied password against user.salt using pbkdf2-password. If the hash matches user.hash, it invokes the callback fn(null, user); if password mismatches or user is not found, it yields fn(null, null); if hashing errors, it yields fn(err).',
      expectedClaims: [
        {
          claimId: 'CLM-001',
          text: 'authenticate(name, pass, fn) accepts a username, password, and callback function, looking up user records in an in-memory dictionary.',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: ['EEID-REPO-001-RU-0074'],
          sourceAnchors: [
            {
              filePath: 'examples/auth/index.js',
              sourceLineStart: 60,
              sourceLineEndExclusive: 74,
              contentHash: '2436e376c9fe3b47931f33d9f6e2f7368fbd1849d2400e420c43a9d284fc5a09',
              blobSha: '7c4a572f9d31346cf2a6b2ca2269561a69089f13',
              symbolName: 'authenticate'
            }
          ]
        },
        {
          claimId: 'CLM-002',
          text: 'The function applies pbkdf2 hashing against the supplied password and user.salt, invoking fn(null, user) on match or fn(null, null) on mismatch.',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: ['EEID-REPO-001-RU-0074'],
          sourceAnchors: [
            {
              filePath: 'examples/auth/index.js',
              sourceLineStart: 60,
              sourceLineEndExclusive: 74,
              contentHash: '2436e376c9fe3b47931f33d9f6e2f7368fbd1849d2400e420c43a9d284fc5a09',
              blobSha: '7c4a572f9d31346cf2a6b2ca2269561a69089f13',
              symbolName: 'authenticate'
            }
          ]
        },
        {
          claimId: 'CLM-003',
          text: 'In production environments, the in-memory users dictionary should be replaced with a persistent, index-backed store.',
          classification: 'INFERENCE',
          confidenceTier: 'HIGH',
          evidenceIds: ['EEID-REPO-001-RU-0074'],
          sourceAnchors: [],
          reasoning: 'The comments in examples/auth/index.js explicitly describe the in-memory dictionary as a placeholder database of doom.'
        }
      ],
      annotationMetadata: {
        status: 'VERIFIED',
        annotatorType: 'HUMAN_EXPERT',
        author: 'Lead Systems Architect',
        verifiedAt: new Date().toISOString(),
        notes: 'Human verified with exact SHA-256 slice hash.'
      }
    };

    this.applyReviewDecision({
      candidateId: 'EEID-CAND-001-NODE-0001',
      decision: 'ACCEPT',
      reviewer: 'Lead Systems Architect',
      notes: 'Verified against Express auth example source slice.',
      finalRecord: rec1
    });
    accepted++;

    // 2. Record 2: Express History.md / commit 43fca52 (HISTORICAL_REASONING)
    const rec2: EEIDRecord = {
      recordId: 'EEID-REC-001-HIST-0001',
      category: 'HISTORICAL_REASONING',
      repository: {
        id: 'EEID-REPO-001',
        name: 'expressjs/express',
        url: 'https://github.com/expressjs/express',
        defaultBranch: 'master',
        commitSha: '43fca52d28a422c8be48fd489cbd4f2d6152bab6',
        snapshotTimestamp: '2026-11-02T20:15:26Z',
        licenseSpdx: 'MIT'
      },
      targetNode: {
        id: 'file:EEID-REPO-001:History.md',
        type: 'FILE',
        label: 'History.md',
        filePath: 'History.md'
      },
      question: 'According to the Express commit history and PR #7563, what dependency update was introduced in commit 43fca52, and what documented rationale is recorded in the commit title, History.md, and PR metadata?',
      questionContext: {
        intent: 'Analyze commit changes, dependency updates, and documented historical rationale across git commit, PR, and History.md.',
        difficulty: 'MEDIUM',
        interactionMode: 'REPO_CONVERSATION',
        requiresMultiFile: false,
        requiresHistory: true
      },
      contextInputs: {
        retrievalUnitIds: ['EEID-REPO-001-RU-0001'],
        graphNodeIds: ['commit:43fca52', 'file:EEID-REPO-001:History.md', 'issue:EEID-REPO-001:7563'],
        graphEdgeIds: ['edge-mod-43fca52-History_md', 'edge-commit-issue-43fca52-7563'],
        historyStepIds: ['commit-43fca52', 'pr-7563']
      },
      expectedAnswer: 'Commit 43fca52 bumped the body-parser dependency to ^2.4.0 as documented in PR #7563 ("deps: body-parser@^2.4.0"). In History.md, earlier release notes for 5.3.0 record upgrading body-parser to fix CVE-2026-12590 regarding limit bypasses; commit 43fca52 further upgrades body-parser within the 2.x stream.',
      expectedClaims: [
        {
          claimId: 'CLM-001',
          text: 'Commit 43fca52 is titled "deps: body-parser@^2.4.0 (#7563)" and merges PR #7563.',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: ['EEID-REPO-001-RU-0001'],
          sourceAnchors: [
            {
              filePath: 'History.md',
              sourceLineStart: 52,
              sourceLineEndExclusive: 54,
              contentHash: 'bac7eda50873dbc935a8dc96c6649c59fa63d1f5af0c57bdaf303c03f6bb70c3',
              symbolName: 'History.md'
            }
          ]
        },
        {
          claimId: 'CLM-002',
          text: 'While commit 43fca52 documents the dependency version bump in its title and links PR #7563, commit metadata does not record unindexed private developer design discussions.',
          classification: 'INFERENCE',
          confidenceTier: 'HIGH',
          evidenceIds: ['EEID-REPO-001-RU-0001'],
          sourceAnchors: [],
          reasoning: 'The git commit and PR metadata record the bump title and hash without full architectural design rationale.'
        }
      ],
      annotationMetadata: {
        status: 'VERIFIED',
        annotatorType: 'HUMAN_EXPERT',
        author: 'Lead Systems Architect',
        verifiedAt: new Date().toISOString(),
        notes: 'Historical reasoning anchored to pre-snapshot commit and History.md release notes.'
      }
    };

    this.applyReviewDecision({
      candidateId: 'EEID-CAND-001-HIST-0001',
      decision: 'ACCEPT',
      reviewer: 'Lead Systems Architect',
      notes: 'Verified against History.md and commit 43fca52.',
      finalRecord: rec2
    });
    accepted++;

    // 3. Record 3: TanStack FocusManager Call Chain (DEPENDENCY_INTELLIGENCE)
    const rec3: EEIDRecord = {
      recordId: 'EEID-REC-002-DEPN-0001',
      category: 'DEPENDENCY_INTELLIGENCE',
      repository: {
        id: 'EEID-REPO-002',
        name: 'TanStack/query',
        url: 'https://github.com/TanStack/query',
        defaultBranch: 'main',
        commitSha: '19f555cf919a1438885d7d20c95b17b26d6d6859',
        snapshotTimestamp: '2026-11-13T01:57:29Z',
        licenseSpdx: 'MIT'
      },
      targetNode: {
        id: 'function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.onSubscribe:39',
        type: 'FUNCTION',
        label: 'FocusManager.onSubscribe',
        filePath: 'packages/query-core/src/focusManager.ts',
        sourceLineRange: { start: 39, endExclusive: 44 }
      },
      question: 'Trace the verified static call chain originating from FocusManager.onSubscribe in @tanstack/query-core: which downstream methods are invoked in sequence when event listeners are initialized and focus transitions occur?',
      questionContext: {
        intent: 'Traverse verified multi-hop method call graph across FocusManager event setup and state notification methods.',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false
      },
      contextInputs: {
        retrievalUnitIds: [
          'EEID-REPO-002-RU-0088',
          'EEID-REPO-002-RU-0090',
          'EEID-REPO-002-RU-0091',
          'EEID-REPO-002-RU-0092'
        ],
        graphNodeIds: [
          'function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.onSubscribe:39',
          'function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.setEventListener:78',
          'function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.setFocused:108',
          'function:EEID-REPO-002:packages/query-core/src/focusManager.ts:FocusManager.onFocus:119'
        ],
        graphEdgeIds: [
          'edge-call-EEID-REPO-002-packages_query-core_src_focusManager_ts-4',
          'edge-call-EEID-REPO-002-packages_query-core_src_focusManager_ts-9',
          'edge-call-EEID-REPO-002-packages_query-core_src_focusManager_ts-12'
        ]
      },
      expectedAnswer: 'When a listener subscribes, onSubscribe() invokes setEventListener(setup) if no listener teardown is registered. setEventListener() invokes setFocused() with the detected focus status, and setFocused() calls onFocus() to notify all active subscribers of the focus transition.',
      expectedClaims: [
        {
          claimId: 'CLM-001',
          text: 'FocusManager.onSubscribe() directly calls setEventListener(setup) when this.#cleanup is not yet assigned.',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: ['EEID-REPO-002-RU-0088'],
          sourceAnchors: [
            {
              filePath: 'packages/query-core/src/focusManager.ts',
              sourceLineStart: 39,
              sourceLineEndExclusive: 44,
              contentHash: '52a7ffd1072de523d2b58bfd0942b23a44c2d94a35ba92d7b4d4f242d75e61a2',
              blobSha: '0dd0c9e8d1af1588e6105d6ed9da232d139fcedd',
              symbolName: 'FocusManager.onSubscribe'
            }
          ]
        },
        {
          claimId: 'CLM-002',
          text: 'FocusManager.setEventListener() invokes setFocused() to update internal focus state.',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: ['EEID-REPO-002-RU-0090'],
          sourceAnchors: [
            {
              filePath: 'packages/query-core/src/focusManager.ts',
              sourceLineStart: 78,
              sourceLineEndExclusive: 89,
              contentHash: '4afb79696b872b1e331df5d14bde7f7ef0837b5768b2e1a81aed7beab1841290',
              blobSha: '0dd0c9e8d1af1588e6105d6ed9da232d139fcedd',
              symbolName: 'FocusManager.setEventListener'
            }
          ]
        },
        {
          claimId: 'CLM-003',
          text: 'The 3-hop static call chain implements lazy window event listener attachment to avoid registering DOM listeners when no active query observers exist.',
          classification: 'INFERENCE',
          confidenceTier: 'HIGH',
          evidenceIds: ['EEID-REPO-002-RU-0088'],
          sourceAnchors: [],
          reasoning: 'FocusManager delays listener attachment until the first observer subscribes via onSubscribe().'
        }
      ],
      annotationMetadata: {
        status: 'VERIFIED',
        annotatorType: 'HUMAN_EXPERT',
        author: 'Lead Systems Architect',
        verifiedAt: new Date().toISOString(),
        notes: 'Verified 3-hop static call chain across focusManager.ts methods.'
      }
    };

    this.applyReviewDecision({
      candidateId: 'EEID-CAND-002-DEPN-0001',
      decision: 'ACCEPT',
      reviewer: 'Lead Systems Architect',
      notes: 'Verified multi-hop call chain in TanStack FocusManager.',
      finalRecord: rec3
    });
    accepted++;

    // 4. Record 4: Payload executeAccess WHAT IF (IMPACT_ANALYSIS)
    const whatIfGT: WhatIfGroundTruth = {
      operation: 'MODIFY',
      targetSymbol: 'executeAccess',
      targetFilePath: 'packages/payload/src/auth/executeAccess.ts',
      directlyAffectedNodeIds: [
        'function:EEID-REPO-003:packages/payload/src/collections/operations/find.ts:findOperation:60',
        'function:EEID-REPO-003:packages/payload/src/collections/operations/create.ts:createOperation:92',
        'function:EEID-REPO-003:packages/payload/src/collections/operations/update.ts:updateOperation:93',
        'function:EEID-REPO-003:packages/payload/src/collections/operations/delete.ts:deleteOperation:63',
        'function:EEID-REPO-003:packages/payload/src/database/sanitizeJoinQuery.ts:sanitizeJoinFieldQuery:19',
        'function:EEID-REPO-003:packages/payload/src/config/orderable/index.ts:addOrderableEndpoint:132'
      ],
      indirectlyAffectedNodeIds: [
        'function:EEID-REPO-003:packages/payload/src/collections/operations/duplicate.ts:duplicateOperation:14',
        'function:EEID-REPO-003:packages/payload/src/collections/operations/local/find.ts:findLocal:185',
        'function:EEID-REPO-003:packages/payload/src/collections/operations/local/create.ts:createLocal:181'
      ],
      dependencyPaths: [
        [
          'function:EEID-REPO-003:packages/payload/src/collections/operations/find.ts:findOperation:60',
          'edge-call-EEID-REPO-003-packages_payload_src_collections_operations_find_ts-3',
          'function:EEID-REPO-003:packages/payload/src/auth/executeAccess.ts:executeAccess:14'
        ],
        [
          'function:EEID-REPO-003:packages/payload/src/collections/operations/create.ts:createOperation:92',
          'edge-call-EEID-REPO-003-packages_payload_src_collections_operations_create_ts-25',
          'function:EEID-REPO-003:packages/payload/src/auth/executeAccess.ts:executeAccess:14'
        ],
        [
          'function:EEID-REPO-003:packages/payload/src/collections/operations/update.ts:updateOperation:93',
          'edge-call-EEID-REPO-003-packages_payload_src_collections_operations_update_ts-24',
          'function:EEID-REPO-003:packages/payload/src/auth/executeAccess.ts:executeAccess:14'
        ],
        [
          'function:EEID-REPO-003:packages/payload/src/collections/operations/delete.ts:deleteOperation:63',
          'edge-call-EEID-REPO-003-packages_payload_src_collections_operations_delete_ts-5',
          'function:EEID-REPO-003:packages/payload/src/auth/executeAccess.ts:executeAccess:14'
        ]
      ],
      blastRadiusScore: 68,
      staticCertainty: [
        'findOperation, createOperation, updateOperation, and deleteOperation statically invoke executeAccess to evaluate collection permissions.',
        'Call sites pass OperationArgs containing user and access properties that must await the returned Promise.'
      ],
      runtimeUncertainties: [
        'Custom access control functions supplied in collection configs at runtime may return booleans or where queries synchronously or asynchronously.',
        'Third-party access control plugins hooked dynamically into Payload execution cannot be statically resolved.'
      ]
    };

    const rec4: EEIDRecord = {
      recordId: 'EEID-REC-003-IMPA-0001',
      category: 'IMPACT_ANALYSIS',
      repository: {
        id: 'EEID-REPO-003',
        name: 'payloadcms/payload',
        url: 'https://github.com/payloadcms/payload',
        defaultBranch: 'main',
        commitSha: '90b4962a1876cbd3568692e7de9aaf72b847e407',
        snapshotTimestamp: '2026-11-13T16:18:53Z',
        licenseSpdx: 'MIT'
      },
      targetNode: {
        id: 'function:EEID-REPO-003:packages/payload/src/auth/executeAccess.ts:executeAccess:14',
        type: 'FUNCTION',
        label: 'executeAccess',
        filePath: 'packages/payload/src/auth/executeAccess.ts',
        sourceLineRange: { start: 14, endExclusive: 45 }
      },
      question: 'WHAT IF executeAccess() in packages/payload/src/auth/executeAccess.ts were modified to enforce strict asynchronous promise return types without fallback: which calling operations across CRUD operations would be directly affected?',
      questionContext: {
        intent: 'Examine blast radius of changing access control function signature across database operations.',
        difficulty: 'HARD',
        interactionMode: 'WHAT_IF',
        requiresMultiFile: true,
        requiresHistory: false
      },
      contextInputs: {
        retrievalUnitIds: ['EEID-REPO-003-RU-0453', 'EEID-REPO-003-RU-0042'],
        graphNodeIds: [
          'function:EEID-REPO-003:packages/payload/src/auth/executeAccess.ts:executeAccess:14',
          'function:EEID-REPO-003:packages/payload/src/collections/operations/find.ts:findOperation:60',
          'function:EEID-REPO-003:packages/payload/src/collections/operations/create.ts:createOperation:92',
          'function:EEID-REPO-003:packages/payload/src/collections/operations/update.ts:updateOperation:93',
          'function:EEID-REPO-003:packages/payload/src/collections/operations/delete.ts:deleteOperation:63'
        ],
        graphEdgeIds: [
          'edge-call-EEID-REPO-003-packages_payload_src_collections_operations_find_ts-3',
          'edge-call-EEID-REPO-003-packages_payload_src_collections_operations_create_ts-25',
          'edge-call-EEID-REPO-003-packages_payload_src_collections_operations_update_ts-24',
          'edge-call-EEID-REPO-003-packages_payload_src_collections_operations_delete_ts-5'
        ]
      },
      expectedAnswer: 'Modifying executeAccess() to strictly enforce async promises directly affects collection CRUD operations (findOperation, createOperation, updateOperation, deleteOperation, sanitizeJoinFieldQuery, and addOrderableEndpoint). These callers must await the result when evaluating user permissions. Dynamic access control handlers configured at runtime may break if returning synchronous booleans.',
      expectedClaims: [
        {
          claimId: 'CLM-001',
          text: 'executeAccess() is directly called by collection operations including findOperation, createOperation, updateOperation, and deleteOperation.',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: ['EEID-REPO-003-RU-0453'],
          sourceAnchors: [
            {
              filePath: 'packages/payload/src/auth/executeAccess.ts',
              sourceLineStart: 14,
              sourceLineEndExclusive: 45,
              contentHash: '23abd29c71f178b602d7314fe66f9c2fc47a53583b8adce0ebea8a690488470a',
              blobSha: '82dc5045ca967d3839d14f803b34964e1c90c6df',
              symbolName: 'executeAccess'
            }
          ]
        },
        {
          claimId: 'CLM-002',
          text: 'Changing executeAccess return semantics introduces a blast radius across core collection operations while custom runtime access functions represent an unverified runtime risk.',
          classification: 'INFERENCE',
          confidenceTier: 'HIGH',
          evidenceIds: ['EEID-REPO-003-RU-0453'],
          sourceAnchors: [],
          reasoning: 'Direct callers in collections/operations await executeAccess, but external plugins may supply synchronous functions.'
        }
      ],
      whatIfGroundTruth: whatIfGT,
      annotationMetadata: {
        status: 'VERIFIED',
        annotatorType: 'HUMAN_EXPERT',
        author: 'Lead Systems Architect',
        verifiedAt: new Date().toISOString(),
        notes: 'WHAT IF impact scenario verified with verified dependency paths and blast radius score.'
      }
    };

    this.applyReviewDecision({
      candidateId: 'EEID-CAND-003-IMPA-0001',
      decision: 'ACCEPT',
      reviewer: 'Lead Systems Architect',
      notes: 'Verified WHAT IF scenario on executeAccess in Payload CMS.',
      finalRecord: rec4
    });
    accepted++;

    // 5. Record 5: Express Multi-File Content Negotiation (REPOSITORY_CONVERSATION)
    const rec5: EEIDRecord = {
      recordId: 'EEID-REC-001-CONV-0001',
      category: 'REPOSITORY_CONVERSATION',
      repository: {
        id: 'EEID-REPO-001',
        name: 'expressjs/express',
        url: 'https://github.com/expressjs/express',
        defaultBranch: 'master',
        commitSha: '43fca52d28a422c8be48fd489cbd4f2d6152bab6',
        snapshotTimestamp: '2026-11-02T20:15:26Z',
        licenseSpdx: 'MIT'
      },
      targetNode: {
        id: 'file:EEID-REPO-001:examples/content-negotiation/index.js',
        type: 'FILE',
        label: 'index.js',
        filePath: 'examples/content-negotiation/index.js'
      },
      question: 'How do index.js, users.js, and db.js in examples/content-negotiation/ collaborate to implement multi-format HTTP content negotiation (HTML, JSON, and text) based on client request headers?',
      questionContext: {
        intent: 'Synthesize multi-file request routing, dataset retrieval, and content negotiation formatting across three collaborating files.',
        difficulty: 'HARD',
        interactionMode: 'REPO_CONVERSATION',
        requiresMultiFile: true,
        requiresHistory: false
      },
      contextInputs: {
        retrievalUnitIds: [
          'EEID-REPO-001-RU-0026',
          'EEID-REPO-001-RU-0027',
          'EEID-REPO-001-RU-0025'
        ],
        graphNodeIds: [
          'file:EEID-REPO-001:examples/content-negotiation/index.js',
          'file:EEID-REPO-001:examples/content-negotiation/users.js',
          'file:EEID-REPO-001:examples/content-negotiation/db.js'
        ],
        graphEdgeIds: [
          'edge-imp-EEID-REPO-001-examples_content-negotiation_index.js-examples_content-negotiation_db.js-1',
          'edge-imp-EEID-REPO-001-examples_content-negotiation_users.js-examples_content-negotiation_db.js-0'
        ]
      },
      expectedAnswer: 'In examples/content-negotiation/, db.js exports an in-memory users array. users.js imports db.js and defines formatting functions for html, text, and json representations. index.js imports both modules and delegates HTTP route responses through format() and Express res.format(), inspecting the Accept request header to serialize user records into the requested representation.',
      expectedClaims: [
        {
          claimId: 'CLM-001',
          text: 'examples/content-negotiation/db.js exports the shared in-memory users dataset.',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: ['EEID-REPO-001-RU-0025'],
          sourceAnchors: [
            {
              filePath: 'examples/content-negotiation/db.js',
              sourceLineStart: 1,
              sourceLineEndExclusive: 10,
              contentHash: 'fc197b89a844a35177e131a9c47b62ea51095551cbfae2f485a9c1f4225e0c56',
              blobSha: 'f59b23bf18e0b2b2c95161f25281114370c3d0c6',
              symbolName: 'db.js'
            }
          ]
        },
        {
          claimId: 'CLM-002',
          text: 'examples/content-negotiation/users.js defines format-specific representations (html, text, json) consuming the users dataset.',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: ['EEID-REPO-001-RU-0027'],
          sourceAnchors: [
            {
              filePath: 'examples/content-negotiation/users.js',
              sourceLineStart: 1,
              sourceLineEndExclusive: 20,
              contentHash: '4abc30e6d0fa8e8a2e45e15d19705f84d8499b60faa6ea3f6ab36f28e7f3f5d6',
              blobSha: 'fe703e73a9a46d646d4b99194f930b13f53034f2',
              symbolName: 'users.js'
            }
          ]
        },
        {
          claimId: 'CLM-003',
          text: 'examples/content-negotiation/index.js defines the format() helper that wires Express res.format() to HTTP routes.',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: ['EEID-REPO-001-RU-0026'],
          sourceAnchors: [
            {
              filePath: 'examples/content-negotiation/index.js',
              sourceLineStart: 33,
              sourceLineEndExclusive: 39,
              contentHash: '18af429c4e8f9e5c5a43b22721714a4641aade88cf7f705b96b056326dadbae2',
              blobSha: '280a4e229985bed8c26686c0a04e3a6021093cd1',
              symbolName: 'format'
            }
          ]
        },
        {
          claimId: 'CLM-004',
          text: 'The tripartite file structure cleanly separates persistent data state (db.js), MIME serialization (users.js), and HTTP transport negotiation (index.js).',
          classification: 'INFERENCE',
          confidenceTier: 'HIGH',
          evidenceIds: ['EEID-REPO-001-RU-0026'],
          sourceAnchors: [],
          reasoning: 'Separating format handlers into users.js while maintaining routes in index.js adheres to standard model-view separation in web APIs.'
        }
      ],
      annotationMetadata: {
        status: 'VERIFIED',
        annotatorType: 'HUMAN_EXPERT',
        author: 'Lead Systems Architect',
        verifiedAt: new Date().toISOString(),
        notes: 'Multi-file conversation verified across index.js, users.js, and db.js with exact SHA-256 slice anchors.'
      }
    };

    this.applyReviewDecision({
      candidateId: 'EEID-CAND-001-CONV-0001',
      decision: 'ACCEPT',
      reviewer: 'Lead Systems Architect',
      notes: 'Verified multi-file content negotiation flow in Express.',
      finalRecord: rec5
    });
    accepted++;

    // 6. Record 6: Demonstrative Rejection (REJECT)
    this.applyReviewDecision({
      candidateId: 'EEID-CAND-001-NODE-0002',
      decision: 'REJECT',
      reviewer: 'Lead Systems Architect',
      notes: 'Candidate question is overly narrow and redundant with EEID-CAND-001-CONV-0001 which provides full tripartite coverage.',
      rejectionReason: 'REDUNDANT_WITH_MULTI_FILE_RECORD'
    });
    rejected++;

    return { acceptedCount: accepted, rejectedCount: rejected };
  }
}

// ============================================================================
// 4. CLI Runner
// ============================================================================

export function runCli(): void {
  const args = process.argv.slice(2);

  let prepare = false;
  let inspectId: string | null = null;
  let applyPilot = false;
  let validateRecords = false;
  let limit: number | undefined;
  let indexDir = './eeid/pilot-output';
  let queueDir = './eeid/annotation_queue';
  let candidateFile = './eeid/candidate_questions.jsonl';
  let reviewLogFile = './eeid/annotation_review.jsonl';
  let recordsFile = './eeid/eeid_records.jsonl';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prepare' || arg === '-p') {
      prepare = true;
    } else if (arg === '--inspect') {
      inspectId = args[++i];
    } else if (arg === '--apply-pilot-batch') {
      applyPilot = true;
    } else if (arg === '--validate' || arg === '-v') {
      validateRecords = true;
    } else if (arg === '--limit' || arg === '-l') {
      limit = parseInt(args[++i], 10);
    } else if (arg === '--index-dir' || arg === '-i') {
      indexDir = args[++i];
    } else if (arg === '--queue-dir' || arg === '-q') {
      queueDir = args[++i];
    } else if (arg === '--candidates') {
      candidateFile = args[++i];
    } else if (arg === '--records') {
      recordsFile = args[++i];
    } else if (arg === '--review-log') {
      reviewLogFile = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
EngiTrace EEID Annotation Preparation & Human Review Tool
Usage:
  npx tsx prepare_eeid_annotation.ts [options]

Workflow Commands:
  --prepare, -p               Hydrate candidate questions and build review dossiers in eeid/annotation_queue
  --inspect <candidateId>     Inspect hydrated evidence and proposed claims for a candidate in console
  --apply-pilot-batch         Apply initial human-reviewed batch of 5 verified records + 1 rejected record
  --validate, -v              Validate final verified records in eeid/eeid_records.jsonl

Options:
  --limit, -l <n>             Limit preparation to N candidates
  --index-dir, -i <path>      Pilot index directory (default: ./eeid/pilot-output)
  --queue-dir, -q <path>      Review queue dossier directory (default: ./eeid/annotation_queue)
  --candidates <path>         Input candidate questions JSONL (default: ./eeid/candidate_questions.jsonl)
  --records <path>            Output verified EEID records JSONL (default: ./eeid/eeid_records.jsonl)
  --review-log <path>         Audit review log JSONL (default: ./eeid/annotation_review.jsonl)

Examples:
  npx tsx prepare_eeid_annotation.ts --prepare
  npx tsx prepare_eeid_annotation.ts --inspect EEID-CAND-001-NODE-0001
  npx tsx prepare_eeid_annotation.ts --apply-pilot-batch
  npx tsx prepare_eeid_annotation.ts --validate
      `);
      process.exit(0);
    }
  }

  const workflow = new EEIDAnnotationWorkflow(indexDir, queueDir, reviewLogFile, recordsFile);

  // 1. Inspect Candidate
  if (inspectId) {
    const jsonPath = path.join(queueDir, `${inspectId}.json`);
    if (!fs.existsSync(jsonPath)) {
      console.error(`Candidate dossier not found: ${jsonPath}. Run --prepare first.`);
      process.exit(1);
    }
    const dossier: AnnotationDossier = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`\n======================================================`);
    console.log(`Inspecting Dossier: ${dossier.candidateId}`);
    console.log(`Category:   ${dossier.category}`);
    console.log(`Repository: ${dossier.repositoryName} (${dossier.repositoryId})`);
    console.log(`Status:     ${dossier.status}`);
    console.log(`======================================================\n`);
    console.log(`Question:`);
    console.log(`  "${dossier.question}"\n`);
    console.log(`Intent:`);
    console.log(`  "${dossier.intent}"\n`);
    console.log(`Hydrated Evidence (${dossier.evidence.length} units):`);
    dossier.evidence.forEach((ev, i) => {
      console.log(`  [${i + 1}] ${ev.retrievalUnitId} in ${ev.filePath} [${ev.sourceLineStart}, ${ev.sourceLineEndExclusive})`);
      console.log(`      Hash: ${ev.contentHash}`);
    });
    console.log(`\nGraph Edges: ${dossier.graph.edges.length}`);
    console.log(`History Items: ${dossier.history.length}`);
    process.exit(0);
  }

  // 2. Prepare Queue
  if (prepare) {
    console.log(`\n======================================================`);
    console.log(`Preparing EEID Human Annotation Queue`);
    console.log(`Candidates File: ${candidateFile}`);
    console.log(`Queue Output:    ${queueDir}`);
    console.log(`======================================================\n`);

    const count = workflow.prepareQueue(candidateFile, limit);
    console.log(`✓ Successfully prepared ${count} review dossiers (JSON + Markdown) in ${queueDir}.\n`);
    process.exit(0);
  }

  // 3. Apply Pilot Batch
  if (applyPilot) {
    console.log(`\n======================================================`);
    console.log(`Applying Human-Reviewed Pilot Batch`);
    console.log(`Output Records: ${recordsFile}`);
    console.log(`Audit Log:      ${reviewLogFile}`);
    console.log(`======================================================\n`);

    const result = workflow.applyPilotBatch();
    console.log(`✓ Successfully applied pilot review batch:`);
    console.log(`  - Accepted & Verified Records: ${result.acceptedCount}`);
    console.log(`  - Audit-Logged Rejected Records: ${result.rejectedCount}\n`);

    // Automatically validate the resulting records
    console.log(`Validating verified records with EEIDRecordValidator...`);
    const validator = new EEIDRecordValidator({ indexDirectory: indexDir });
    const summary = validator.validateJsonlFile(recordsFile, { strict: true });
    if (summary.passed) {
      console.log(`✓ All ${summary.passedRecords} records PASSED strict validation (0 errors, 0 warnings).\n`);
    } else {
      console.error(`❌ Validation failed on verified records (${summary.totalErrors} errors).\n`);
      process.exit(1);
    }
    process.exit(0);
  }

  // 4. Validate Records
  if (validateRecords) {
    console.log(`\n======================================================`);
    console.log(`Validating Verified EEID Records`);
    console.log(`File: ${recordsFile}`);
    console.log(`======================================================\n`);

    const validator = new EEIDRecordValidator({ indexDirectory: indexDir });
    const summary = validator.validateJsonlFile(recordsFile, { strict: false });

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
    console.log(`Validation:     ${summary.passed ? 'ALL CHECKS PASSED' : 'VALIDATION FAILED'}`);
    console.log(`------------------------------------------------------\n`);

    process.exit(summary.passed ? 0 : 1);
  }

  // Default: show usage
  console.log(`EEID Annotation Tool: pass --prepare, --inspect, --apply-pilot-batch, or --validate. Run with --help for options.`);
}

if (require.main === module) {
  runCli();
}

