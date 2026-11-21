import { EngineeringMemoryGraph } from '../../../graph-engine/src';
import { FileAstResult } from '../../../analyzer/src/index';
import { NormalizedEvidence } from '../types/evidence.js';
import { AnalyzedRepoSnapshot } from '../controllers/repositoryController.js';
import { GitHubService } from './githubService.js';

export const MULTI_FILE_LIMITS = {
  MAX_TOTAL_FILES: 5,
  MAX_SELECTED_FILE_BYTES: 50 * 1024,
  MAX_RELATED_FILE_BYTES: 15 * 1024,
  MAX_AGGREGATE_SOURCE_BYTES: 80 * 1024,
  MAX_CANDIDATES_TO_ATTEMPT: 8
};

export interface RetrievedSourceRecord {
  id: string;
  filePath: string;
  role: 'selected_file' | 'related_file';
  relationship: string;
  reason: string;
  status: 'RETRIEVED' | 'TRUNCATED' | 'UNAVAILABLE' | 'OMITTED_BUDGET';
  content?: string;
  sizeBytes: number;
  includedBytes: number;
  truncated: boolean;
  lineRange?: { startLine: number; endLine: number; endLineExclusive?: number };
  symbolsSummary?: string[];
  sourceUrl: string;
}

export interface MultiFileContextResult {
  selectedFile?: RetrievedSourceRecord;
  relatedFiles: RetrievedSourceRecord[];
  unavailableFiles: Array<{ filePath: string; relationship: string; reason: string }>;
  omittedFiles: Array<{ filePath: string; relationship: string; reason: string }>;
  sourceEvidenceRecords: NormalizedEvidence[];
  astHighlights: {
    selectedFileSymbols: string[];
    importsSummary: Array<{ source: string; kind: string; resolvedFilePath?: string }>;
    exportsSummary: Array<{ kind: string; exportedNames: string[] }>;
    resolvedCallsSummary: Array<{
      callerName: string;
      calleeText: string;
      targetFilePath?: string;
      targetSymbolName?: string;
      line: number;
    }>;
  } | null;
  stats: {
    includedFilesCount: number;
    totalSourceBytes: number;
    maxFilesLimit: number;
    maxAggregateBytes: number;
    truncatedFilesCount: number;
  };
}

interface RankedCandidate {
  filePath: string;
  relationship: string;
  reason: string;
  score: number;
  focusLine?: number;
}

function normalizeCleanRepoPath(rawPath: string | null | undefined): string | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let cleaned = rawPath.trim();
  if (cleaned.startsWith('file:')) {
    const firstColon = cleaned.indexOf(':', 5);
    cleaned = firstColon !== -1 ? cleaned.slice(firstColon + 1) : cleaned.slice(5);
  }
  cleaned = cleaned.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..') || cleaned.includes(':\\')) return null;
  return cleaned;
}

function extractRepoPrefixFromNodeId(nodeId: string): string | null {
  if (!nodeId.includes(':')) return null;
  const parts = nodeId.split(':');
  if (parts.length >= 3 && ['file', 'function', 'component', 'repository'].includes(parts[0])) {
    return parts[1];
  }
  return null;
}

function normalizeRepoSlug(id: string): string {
  try {
    return decodeURIComponent(id).trim().replace(/^repo-/, '').replace(/\//g, '-').toLowerCase();
  } catch {
    return id.trim().replace(/^repo-/, '').replace(/\//g, '-').toLowerCase();
  }
}

function extractBoundedSnippet(
  fullContent: string,
  maxBytes: number,
  focusLine?: number
): { text: string; truncated: boolean; lineRange?: { startLine: number; endLine: number; endLineExclusive: number } } {
  const bytes = Buffer.byteLength(fullContent, 'utf8');
  const lines = fullContent.split(/\r?\n/);

  if (bytes <= maxBytes) {
    const totalLines = Math.max(1, lines.length);
    return {
      text: fullContent,
      truncated: false,
      lineRange: { startLine: 1, endLine: totalLines, endLineExclusive: totalLines + 1 }
    };
  }

  if (focusLine && focusLine > 1 && lines.length > 0) {
    const startIdx = Math.max(0, focusLine - 35);
    let endIdx = startIdx;
    let accBytes = 0;
    const picked: string[] = [];

    while (endIdx < lines.length) {
      const lineStr = `${endIdx + 1}: ${lines[endIdx]}`;
      const lineBytes = Buffer.byteLength(lineStr + '\n', 'utf8');
      if (accBytes + lineBytes > maxBytes - 120) break;
      picked.push(lineStr);
      accBytes += lineBytes;
      endIdx++;
    }

    if (picked.length > 0) {
      return {
        text: `${picked.join('\n')}\n\n[... Snippet bounded at ${Math.round(maxBytes / 1024)}KB limit (lines ${startIdx + 1}-${endIdx} of ${lines.length}) ...]`,
        truncated: true,
        lineRange: { startLine: startIdx + 1, endLine: endIdx, endLineExclusive: endIdx + 1 }
      };
    }
  }

  const sliceLimit = Math.max(200, maxBytes - 100);
  const sliced = fullContent.slice(0, sliceLimit);
  const approxEndLine = sliced.split(/\r?\n/).length;
  return {
    text: `${sliced}\n\n[... Content truncated at ${Math.round(maxBytes / 1024)}KB related-file limit ...]`,
    truncated: true,
    lineRange: { startLine: 1, endLine: approxEndLine, endLineExclusive: approxEndLine + 1 }
  };
}

export class MultiFileContextService {
  static async retrieveBoundedContext(params: {
    repositoryId: string;
    canonicalRepoId: string;
    owner: string;
    repo: string;
    branch: string;
    selectedFilePath: string | null;
    nodeId: string;
    analysisType: 'WHY' | 'WHAT_IF';
    question: string;
    graph?: EngineeringMemoryGraph;
    snapshot?: AnalyzedRepoSnapshot;
    limits?: Partial<typeof MULTI_FILE_LIMITS>;
  }): Promise<MultiFileContextResult> {
    const limits = { ...MULTI_FILE_LIMITS, ...(params.limits || {}) };
    const {
      canonicalRepoId,
      owner,
      repo,
      branch,
      selectedFilePath,
      nodeId,
      analysisType,
      question,
      graph,
      snapshot
    } = params;

    const qLower = (question || '').toLowerCase();
    const isDependencyQuery = /\b(depend|package|version|librar|npm|pip|cargo|maven|manifest|lockfile|upgrade)\b/.test(qLower);
    const isImpactQuery =
      analysisType === 'WHAT_IF' ||
      /\b(break|impact|remove|delete|change|refactor|affect|caller|consumer|downstream|depend on)\b/.test(qLower);
    const isImplementationQuery = /\b(how|work|implement|call|import|flow|function|class|component|explain|trace)\b/.test(qLower);

    const astByPath = new Map<string, FileAstResult>();
    for (const f of snapshot?.astAnalysis?.files || []) {
      astByPath.set(f.filePath, f);
    }

    const expectedRepoSlug = normalizeRepoSlug(canonicalRepoId);
    const isSameRepoPathNode = (candidateNodeId: string): boolean => {
      const nodeRepo = extractRepoPrefixFromNodeId(candidateNodeId);
      if (!nodeRepo) return true;
      return normalizeRepoSlug(nodeRepo) === expectedRepoSlug;
    };

    const shaByPath = new Map<string, string>();
    for (const item of snapshot?.fileTree || []) {
      if (item.sha) shaByPath.set(item.path, item.sha);
    }

    const candidatesMap = new Map<string, RankedCandidate>();
    const addCandidate = (candidate: RankedCandidate) => {
      const norm = normalizeCleanRepoPath(candidate.filePath);
      if (!norm) return;
      if (selectedFilePath && norm === normalizeCleanRepoPath(selectedFilePath)) return;

      const existing = candidatesMap.get(norm);
      if (!existing || candidate.score > existing.score) {
        candidatesMap.set(norm, { ...candidate, filePath: norm });
      }
    };

    const cleanSelected = normalizeCleanRepoPath(selectedFilePath);

    // 1. Collect candidates from AST of selected file (highest deterministic precision)
    const selectedAst = cleanSelected ? astByPath.get(cleanSelected) : undefined;
    if (selectedAst) {
      for (const imp of selectedAst.imports) {
        if (!imp.resolvedFilePath) continue;
        addCandidate({
          filePath: imp.resolvedFilePath,
          relationship: 'IMPORTS',
          reason: `Directly imported by ${cleanSelected} via "${imp.source}"`,
          score: 120 + (isImplementationQuery ? 80 : 30)
        });
      }

      for (const call of selectedAst.calls) {
        if (!call.resolved || !call.targetFilePath || call.targetFilePath === cleanSelected) continue;
        addCandidate({
          filePath: call.targetFilePath,
          relationship: 'CALLS',
          reason: `Defines symbol "${call.targetSymbolName}" statically called by ${cleanSelected}`,
          score: 115 + (isImplementationQuery ? 75 : 25)
        });
      }

      // Check other files in snapshot AST that import or call selectedFilePath (reverse dependents)
      for (const otherAst of astByPath.values()) {
        if (otherAst.filePath === cleanSelected) continue;
        if (otherAst.imports.some((i) => i.resolvedFilePath === cleanSelected)) {
          addCandidate({
            filePath: otherAst.filePath,
            relationship: 'IMPORTED_BY',
            reason: `Imports ${cleanSelected}`,
            score: 105 + (isImpactQuery ? 95 : 25)
          });
        }
        const callingRef = otherAst.calls.find((c) => c.resolved && c.targetFilePath === cleanSelected);
        if (callingRef) {
          addCandidate({
            filePath: otherAst.filePath,
            relationship: 'CALLED_BY',
            reason: `Statically calls ${callingRef.targetSymbolName || cleanSelected} at L${callingRef.range.startLine}`,
            score: 100 + (isImpactQuery ? 90 : 25),
            focusLine: callingRef.range.startLine
          });
        }
      }
    }

    // 2. Collect candidates from Engineering Memory Graph neighborhood (strictly same repository)
    if (graph && graph.repositoryId && normalizeRepoSlug(graph.repositoryId) === expectedRepoSlug) {
      const targetNode = graph.nodes.find(
        (n) =>
          n.id === nodeId ||
          (n.type === 'DEPENDENCY' && n.label.toLowerCase() === nodeId.replace(/^dependency:/i, '').toLowerCase()) ||
          (cleanSelected && n.type === 'FILE' && normalizeCleanRepoPath(n.metadata?.path as string || n.id) === cleanSelected)
      );
      const targetGraphId = targetNode?.id || nodeId;

      for (const edge of graph.edges) {
        if (edge.source !== targetGraphId && edge.target !== targetGraphId) continue;
        if (!isSameRepoPathNode(edge.source) || !isSameRepoPathNode(edge.target)) continue;

        const neighborId = edge.source === targetGraphId ? edge.target : edge.source;
        const neighborNode = graph.nodes.find((n) => n.id === neighborId);
        if (!neighborNode) continue;

        const rel = edge.relationshipType.toUpperCase();
        const candidatePath = normalizeCleanRepoPath(
          (neighborNode.metadata?.filePath as string) ||
          (neighborNode.metadata?.path as string) ||
          (neighborNode.type === 'FILE' ? neighborNode.id : undefined)
        );

        if (candidatePath) {
          const isReverseEdge = edge.target === targetGraphId;
          let baseScore = 70;
          if (rel === 'IMPORTS') baseScore = isReverseEdge && isImpactQuery ? 185 : 140;
          else if (rel === 'CALLS') baseScore = isReverseEdge && isImpactQuery ? 180 : 135;
          else if (rel === 'CONTAINS' || rel === 'DECLARES' || rel === 'EXPOSES') baseScore = 110;
          else if (rel === 'DEPENDS_ON') baseScore = isImpactQuery ? 130 : 80;

          if (candidatePath.endsWith('package.json') || /requirements\.txt|pyproject\.toml|go\.mod|Cargo\.toml|pom\.xml$/.test(candidatePath)) {
            baseScore += isDependencyQuery ? 120 : 20;
          }

          addCandidate({
            filePath: candidatePath,
            relationship: rel,
            reason: edge.evidence || `Connected via ${rel} edge to ${targetNode?.label || nodeId}`,
            score: baseScore,
            focusLine: (neighborNode.metadata?.lineRange as { startLine?: number } | undefined)?.startLine
          });
        }
      }

      // Always consider relevant repository manifest for dependency/package questions or root nodes
      if (isDependencyQuery || targetNode?.type === 'DEPENDENCY' || !cleanSelected) {
        for (const n of graph.nodes) {
          if (n.type !== 'FILE') continue;
          const p = normalizeCleanRepoPath((n.metadata?.path as string) || n.id);
          if (!p) continue;
          if (/package\.json$|pyproject\.toml$|requirements\.txt$|go\.mod$|Cargo\.toml$|pom\.xml$/.test(p)) {
            addCandidate({
              filePath: p,
              relationship: 'DEPENDS_ON_MANIFEST',
              reason: 'Repository dependency manifest matching query scope',
              score: isDependencyQuery ? 175 : 65
            });
          }
        }
      }
    }

    const sortedCandidates = Array.from(candidatesMap.values()).sort(
      (a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath)
    );

    const relatedFiles: RetrievedSourceRecord[] = [];
    const unavailableFiles: Array<{ filePath: string; relationship: string; reason: string }> = [];
    const omittedFiles: Array<{ filePath: string; relationship: string; reason: string }> = [];
    const sourceEvidenceRecords: NormalizedEvidence[] = [];

    let selectedFileRecord: RetrievedSourceRecord | undefined;
    let aggregateBytesUsed = 0;
    let truncatedCount = 0;
    const loadedShas = new Set<string>();
    const repoSourceUrlBase = `https://github.com/${owner}/${repo}/blob/${branch}`;
    const timestamp = new Date().toISOString();

    // Helper to register grounded evidence for retrieved files
    const registerSourceEvidence = (
      id: string,
      filePath: string,
      relationship: string,
      description: string,
      sourcePathForEdge?: string
    ) => {
      sourceEvidenceRecords.push({
        id,
        repositoryId: canonicalRepoId,
        source: `file:${canonicalRepoId}:${sourcePathForEdge || filePath}`,
        target: `file:${canonicalRepoId}:${filePath}`,
        relationshipType: relationship,
        classification: 'FACT',
        confidence: 1.0,
        title: `Source inspection: ${filePath} (${relationship})`,
        description,
        sourceUrl: `${repoSourceUrlBase}/${filePath}`,
        timestamp
      });
    };

    // Helper to retrieve file content with offline snapshot priority
    const fetchFileContentInternal = async (
      filePath: string
    ): Promise<{ success: boolean; content?: string; reason?: string; truncated?: boolean }> => {
      // 1. Check in-memory sourceContents from snapshot (preserves 100% offline retrieval from pinned snapshot)
      if (snapshot?.sourceContents) {
        const norm = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
        if (snapshot.sourceContents.has(norm)) {
          return { success: true, content: snapshot.sourceContents.get(norm)! };
        }
        for (const [k, v] of snapshot.sourceContents.entries()) {
          const normK = k.replace(/\\/g, '/').replace(/^\/+/, '');
          if (normK === norm || normK.endsWith('/' + norm) || norm.endsWith('/' + normK)) {
            return { success: true, content: v };
          }
        }
      }
      // 2. Fall back to GitHubService (for live remote repos or missing entries)
      return GitHubService.fetchFileContent(owner, repo, filePath, branch);
    };

    // Fetch selected file first (using existing 5-arg signature so test mocks work identically)
    if (cleanSelected) {
      const fetchRes = await fetchFileContentInternal(cleanSelected);
      if (fetchRes.success && typeof fetchRes.content === 'string') {
        const bounded = extractBoundedSnippet(fetchRes.content, limits.MAX_SELECTED_FILE_BYTES);
        const includedBytes = Buffer.byteLength(bounded.text, 'utf8');
        aggregateBytesUsed += includedBytes;
        const sha = shaByPath.get(cleanSelected);
        if (sha) loadedShas.add(sha);

        const isTruncated = Boolean(bounded.truncated || (fetchRes as { truncated?: boolean }).truncated || (fetchRes.reason && fetchRes.reason.toLowerCase().includes('truncated')));
        if (isTruncated) truncatedCount++;

        const evId = `ev-src-selected-${cleanSelected.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const symNames = selectedAst?.symbols.slice(0, 12).map((s) => `${s.kind}:${s.qualifiedName}`) || undefined;

        selectedFileRecord = {
          id: evId,
          filePath: cleanSelected,
          role: 'selected_file',
          relationship: 'TARGET',
          reason: fetchRes.reason || 'RETRIEVED_SUCCESSFULLY',
          status: isTruncated ? 'TRUNCATED' : 'RETRIEVED',
          content: bounded.text,
          sizeBytes: fetchRes.size ?? includedBytes,
          includedBytes,
          truncated: isTruncated,
          lineRange: bounded.lineRange,
          symbolsSummary: symNames,
          sourceUrl: `${repoSourceUrlBase}/${cleanSelected}`
        };

        registerSourceEvidence(
          evId,
          cleanSelected,
          'CONTAINS_FILE',
          `Retrieved source content (${includedBytes} bytes) for selected file ${cleanSelected}.`
        );
      } else {
        unavailableFiles.push({
          filePath: cleanSelected,
          relationship: 'TARGET',
          reason: fetchRes.reason || 'UNAVAILABLE'
        });
      }
    }

    // Fetch top ranked related files strictly respecting MAX_TOTAL_FILES and MAX_AGGREGATE_SOURCE_BYTES
    const remainingSlotsBase = limits.MAX_TOTAL_FILES - (selectedFileRecord ? 1 : 0);
    let attempts = 0;

    for (const candidate of sortedCandidates) {
      if (relatedFiles.length >= remainingSlotsBase || attempts >= limits.MAX_CANDIDATES_TO_ATTEMPT) {
        omittedFiles.push({
          filePath: candidate.filePath,
          relationship: candidate.relationship,
          reason: `Omitted due to max ${limits.MAX_TOTAL_FILES}-file context cap`
        });
        continue;
      }

      const remainingBudget = limits.MAX_AGGREGATE_SOURCE_BYTES - aggregateBytesUsed;
      if (remainingBudget < 512) {
        omittedFiles.push({
          filePath: candidate.filePath,
          relationship: candidate.relationship,
          reason: `Omitted due to ${Math.round(limits.MAX_AGGREGATE_SOURCE_BYTES / 1024)}KB aggregate source budget`
        });
        continue;
      }

      const candidateSha = shaByPath.get(candidate.filePath);
      if (candidateSha && loadedShas.has(candidateSha)) {
        omittedFiles.push({
          filePath: candidate.filePath,
          relationship: candidate.relationship,
          reason: 'Deduplicated identical blob SHA already included in context'
        });
        continue;
      }

      attempts++;
      const perFileBudget = Math.min(limits.MAX_RELATED_FILE_BYTES, remainingBudget);
      const res = await fetchFileContentInternal(candidate.filePath);

      if (!res.success || typeof res.content !== 'string') {
        unavailableFiles.push({
          filePath: candidate.filePath,
          relationship: candidate.relationship,
          reason: res.reason || 'UNAVAILABLE'
        });
        continue;
      }

      const bounded = extractBoundedSnippet(res.content, perFileBudget, candidate.focusLine);
      const includedBytes = Buffer.byteLength(bounded.text, 'utf8');
      if (aggregateBytesUsed + includedBytes > limits.MAX_AGGREGATE_SOURCE_BYTES) {
        omittedFiles.push({
          filePath: candidate.filePath,
          relationship: candidate.relationship,
          reason: `Omitted to stay within ${Math.round(limits.MAX_AGGREGATE_SOURCE_BYTES / 1024)}KB aggregate cap`
        });
        continue;
      }

      aggregateBytesUsed += includedBytes;
      if (candidateSha) loadedShas.add(candidateSha);
      if (bounded.truncated) truncatedCount++;

      const idx = relatedFiles.length + 1;
      const evId = `ev-src-rel-${idx}-${candidate.filePath.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const relAst = astByPath.get(candidate.filePath);
      const symNames = relAst?.symbols.slice(0, 10).map((s) => `${s.kind}:${s.qualifiedName}`) || undefined;

      relatedFiles.push({
        id: evId,
        filePath: candidate.filePath,
        role: 'related_file',
        relationship: candidate.relationship,
        reason: candidate.reason,
        status: bounded.truncated ? 'TRUNCATED' : 'RETRIEVED',
        content: bounded.text,
        sizeBytes: res.size ?? includedBytes,
        includedBytes,
        truncated: bounded.truncated,
        lineRange: bounded.lineRange,
        symbolsSummary: symNames,
        sourceUrl: `${repoSourceUrlBase}/${candidate.filePath}`
      });

      registerSourceEvidence(
        evId,
        candidate.filePath,
        candidate.relationship,
        `${candidate.reason} (${includedBytes} bytes retrieved).`,
        cleanSelected || undefined
      );
    }

    // Add AST structural evidence records for selected file so FACT claims referencing AST imports/calls validate cleanly
    let astHighlights: MultiFileContextResult['astHighlights'] = null;
    if (selectedAst) {
      astHighlights = {
        selectedFileSymbols: selectedAst.symbols.map(
          (s) => `${s.kind} ${s.qualifiedName}(${s.parameters.map((p) => p.name).join(', ')}) [L${s.range.startLine}-L${s.range.endLine}]`
        ),
        importsSummary: selectedAst.imports.map((imp) => ({
          source: imp.source,
          kind: imp.kind,
          resolvedFilePath: imp.resolvedFilePath
        })),
        exportsSummary: selectedAst.exports.map((exp) => ({
          kind: exp.kind,
          exportedNames: exp.exportedNames
        })),
        resolvedCallsSummary: selectedAst.calls
          .filter((c) => c.resolved)
          .slice(0, 20)
          .map((c) => ({
            callerName: c.callerName,
            calleeText: c.calleeText,
            targetFilePath: c.targetFilePath,
            targetSymbolName: c.targetSymbolName,
            line: c.range.startLine
          }))
      };

      selectedAst.imports.forEach((imp, i) => {
        if (!imp.resolvedFilePath) return;
        sourceEvidenceRecords.push({
          id: `ev-ast-imp-${i + 1}-${cleanSelected!.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          repositoryId: canonicalRepoId,
          source: `file:${canonicalRepoId}:${cleanSelected}`,
          target: `file:${canonicalRepoId}:${imp.resolvedFilePath}`,
          relationshipType: 'IMPORTS',
          classification: 'FACT',
          confidence: 1.0,
          title: `${cleanSelected} imports "${imp.source}" -> ${imp.resolvedFilePath}`,
          description: `Tree-sitter AST confirmed relative import of ${imp.resolvedFilePath} at line ${imp.range.startLine}.`,
          sourceUrl: `${repoSourceUrlBase}/${cleanSelected}#L${imp.range.startLine}`,
          timestamp
        });
      });

      selectedAst.calls
        .filter((c) => c.resolved)
        .slice(0, 12)
        .forEach((call, i) => {
          sourceEvidenceRecords.push({
            id: `ev-ast-call-${i + 1}-${cleanSelected!.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
            repositoryId: canonicalRepoId,
            source: `function:${canonicalRepoId}:${cleanSelected}:${call.callerName}`,
            target: `function:${canonicalRepoId}:${call.targetFilePath}:${call.targetSymbolName}`,
            relationshipType: 'CALLS',
            classification: 'FACT',
            confidence: 1.0,
            title: `${call.callerName} calls ${call.calleeText} (${call.targetFilePath})`,
            description: `Statically resolved call to ${call.targetSymbolName} in ${call.targetFilePath} at line ${call.range.startLine}.`,
            sourceUrl: `${repoSourceUrlBase}/${cleanSelected}#L${call.range.startLine}`,
            timestamp
          });
        });
    }

    return {
      selectedFile: selectedFileRecord,
      relatedFiles,
      unavailableFiles,
      omittedFiles,
      sourceEvidenceRecords,
      astHighlights,
      stats: {
        includedFilesCount: (selectedFileRecord ? 1 : 0) + relatedFiles.length,
        totalSourceBytes: aggregateBytesUsed,
        maxFilesLimit: limits.MAX_TOTAL_FILES,
        maxAggregateBytes: limits.MAX_AGGREGATE_SOURCE_BYTES,
        truncatedFilesCount: truncatedCount
      }
    };
  }
}

