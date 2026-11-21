/**
 * EngiTrace Engineering Memory Graph - Deterministic Graph Builder
 */

import {
  GraphNode,
  GraphEdge,
  GraphNodeType,
  EngineeringMemoryGraph,
  GraphSummary,
  EvidenceClassification
} from '../models/graphModel';
import { StandardRelationship } from '../relationships/relationshipRegistry';
import { GraphValidator } from '../validation/graphValidator';

export interface RawIngestionData {
  repository: {
    id: string;
    owner: string;
    repo: string;
    url: string;
    description: string;
    defaultBranch: string;
    language: string;
    stars: number;
    forks: number;
    openIssuesCount: number;
    createdAt: string;
    updatedAt: string;
  };
  fileTree: { path: string; type: 'file' | 'dir'; size?: number; sha?: string }[];
  commits: {
    hash: string;
    shortHash: string;
    message: string;
    authorName: string;
    authorEmail: string;
    date: string;
    url: string;
    parents?: string[];
    files?: { path: string; additions: number; deletions: number; changes: number }[];
  }[];
  pullRequests: {
    id: number;
    number: number;
    title: string;
    body: string;
    author: string;
    state: string;
    createdAt: string;
    url: string;
  }[];
  issues: {
    id: number;
    number: number;
    title: string;
    body: string;
    author: string;
    state: string;
    labels: string[];
    createdAt: string;
    url: string;
  }[];
  dependencies: {
    name: string;
    version: string;
    sourceFile: string;
    ecosystem: string;
    category?: string;
    declaredVersion?: string;
    resolvedVersion?: string;
    lockfileSource?: string;
    isDirect?: boolean;
    isTransitive?: boolean;
    workspaceName?: string;
    manifestType?: string;
  }[];
  transitiveDependencies?: {
    name: string;
    resolvedVersion: string;
    ecosystem: string;
    lockfilePath: string;
    parentPackage?: string;
  }[];
  astAnalysis?: {
    files: Array<{
      filePath: string;
      language: string;
      status: string;
      imports: Array<{
        source: string;
        specifiers: Array<{ localName: string; importedName: string; kind: string }>;
        isTypeOnly: boolean;
        kind: string;
        externalPackageName?: string;
        resolvedFilePath?: string;
        resolutionNote?: string;
        range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
      }>;
      exports: Array<{
        kind: string;
        exportedNames: string[];
        source?: string;
        resolvedSourcePath?: string;
        range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
      }>;
      symbols: Array<{
        id: string;
        name: string;
        qualifiedName: string;
        kind: string;
        filePath: string;
        parentName?: string;
        parameters: Array<{ name: string; typeAnnotation?: string }>;
        isExported: boolean;
        isAsync?: boolean;
        resolvedComponentsUsed?: Array<{
          componentName: string;
          targetFilePath: string;
          targetSymbolId?: string;
        }>;
        range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
      }>;
      calls: Array<{
        callerName: string;
        callerFilePath: string;
        calleeText: string;
        calleeName: string;
        targetKind: string;
        targetFilePath?: string;
        targetSymbolName?: string;
        targetSymbolId?: string;
        resolved: boolean;
        reason?: string;
        range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
      }>;
      parseErrorsCount: number;
      warnings: string[];
      sizeBytes: number;
    }>;
    summary?: object;
  };
  evidenceRecords: {
    id: string;
    repositoryId: string;
    source: string;
    target: string;
    relationshipType: string;
    classification: EvidenceClassification;
    confidence: number;
    title: string;
    description: string;
    sourceUrl: string;
    timestamp: string;
  }[];
}

export class GraphBuilder {
  /**
   * Deterministically construct Engineering Memory Graph from normalized Phase 1 evidence & ingestion data
   */
  static buildGraph(data: RawIngestionData): EngineeringMemoryGraph {
    const nodesMap = new Map<string, GraphNode>();
    const edgesList: GraphEdge[] = [];
    const now = new Date().toISOString();

    const repoId = data.repository.id;
    const repoCanonicalId = `repository:${data.repository.owner}/${data.repository.repo}`;

    // 1. Create Canonical Repository Node
    nodesMap.set(repoCanonicalId, {
      id: repoCanonicalId,
      type: 'REPOSITORY',
      label: `${data.repository.owner}/${data.repository.repo}`,
      sublabel: data.repository.language || 'Codebase',
      metadata: {
        url: data.repository.url,
        description: data.repository.description,
        stars: data.repository.stars,
        forks: data.repository.forks,
        openIssuesCount: data.repository.openIssuesCount,
        transitiveDependenciesCount: data.transitiveDependencies?.length ?? 0,
        astSummary: data.astAnalysis?.summary
      },
      sourceReference: data.repository.url,
      createdAt: data.repository.createdAt || now,
      updatedAt: data.repository.updatedAt || now
    });

    // Helper to get or create File Node
    const getOrCreateFileNode = (path: string): string => {
      const id = `file:${repoId}:${path}`;
      if (!nodesMap.has(id)) {
        // Search for actual commits modifying this file
        const fileCommits = (data.commits || []).filter((c) =>
          c.files ? c.files.some((f) => f.path === path) : false
        );
        const sortedCommits = [...fileCommits].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        const earliestCommit = sortedCommits[0];
        const latestCommit = sortedCommits[sortedCommits.length - 1];

        const fileCreatedAt = earliestCommit?.date || data.repository.createdAt || now;
        const fileUpdatedAt = latestCommit?.date || data.repository.updatedAt || fileCreatedAt;

        nodesMap.set(id, {
          id,
          type: 'FILE',
          label: path.split('/').pop() || path,
          sublabel: path,
          metadata: {
            path,
            date: fileUpdatedAt,
            timestamp: fileUpdatedAt,
            authorDate: latestCommit?.date,
            commitSha: latestCommit?.hash,
            hash: latestCommit?.hash,
            author: latestCommit?.authorName,
            description: latestCommit?.message
          },
          sourceReference: `${data.repository.url}/blob/${data.repository.defaultBranch}/${path}`,
          createdAt: fileCreatedAt,
          updatedAt: fileUpdatedAt
        });

        // Add edge: REPOSITORY -> CONTAINS -> FILE
        edgesList.push({
          id: `edge-repo-file-${repoId}-${path.replace(/[/.]/g, '_')}`,
          source: repoCanonicalId,
          target: id,
          relationshipType: StandardRelationship.CONTAINS,
          evidence: `File ${path} is part of repository file tree`,
          confidence: 1.0,
          sourceUrl: `${data.repository.url}/tree/${data.repository.defaultBranch}/${path}`,
          timestamp: fileUpdatedAt,
          classification: 'FACT'
        });
      }
      return id;
    };

    // Helper to get or create Author Node
    const getOrCreateAuthorNode = (name: string): string => {
      const normalizedName = name.replace(/\s+/g, '-').toLowerCase();
      const id = `author:${normalizedName}`;
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          type: 'AUTHOR',
          label: name,
          sublabel: 'Contributor',
          metadata: { author: name },
          sourceReference: `https://github.com/${name}`,
          createdAt: now,
          updatedAt: now
        });
      }
      return id;
    };

    const getDependencyReferenceUrl = (name: string, ecosystem: string): string => {
      switch (ecosystem) {
        case 'npm':
          return `https://www.npmjs.com/package/${name}`;
        case 'pip':
          return `https://pypi.org/project/${name}/`;
        case 'cargo':
          return `https://crates.io/crates/${name}`;
        case 'go':
          return `https://pkg.go.dev/${name}`;
        case 'maven': {
          const parts = name.split(':');
          return parts.length === 2
            ? `https://mvnrepository.com/artifact/${parts[0]}/${parts[1]}`
            : `https://central.sonatype.com/search?q=${encodeURIComponent(name)}`;
        }
        default:
          return `${data.repository.url}/blob/${data.repository.defaultBranch}`;
      }
    };

    // Helper to get or create shared Dependency Node (ecosystem-aware) preserving multi-manifest declarations
    const getOrCreateDependencyNode = (dep: RawIngestionData['dependencies'][0]): string => {
      const ecosystem = (dep.ecosystem || 'other').toLowerCase();
      const id = `dependency:${ecosystem}:${dep.name}`;
      const declaredVer = dep.declaredVersion || dep.version;
      const declEntry = {
        sourceFile: dep.sourceFile,
        category: dep.category || 'dependencies',
        declaredVersion: declaredVer,
        resolvedVersion: dep.resolvedVersion,
        lockfileSource: dep.lockfileSource,
        ecosystem,
        workspaceName: dep.workspaceName
      };

      const existing = nodesMap.get(id);
      if (!existing) {
        nodesMap.set(id, {
          id,
          type: 'DEPENDENCY',
          label: dep.name,
          sublabel: `${declaredVer} (${dep.ecosystem})`,
          metadata: {
            name: dep.name,
            version: declaredVer,
            declaredVersion: declaredVer,
            resolvedVersion: dep.resolvedVersion,
            lockfileSource: dep.lockfileSource,
            category: dep.category || 'dependencies',
            ecosystem: dep.ecosystem,
            workspaceName: dep.workspaceName,
            isDirect: true,
            declarations: [declEntry]
          },
          sourceReference: getDependencyReferenceUrl(dep.name, dep.ecosystem),
          createdAt: now,
          updatedAt: now
        });
      } else {
        const declarations = Array.isArray(existing.metadata.declarations)
          ? (existing.metadata.declarations as Array<typeof declEntry>)
          : [];
        const dupIdx = declarations.findIndex(
          (d) => d.sourceFile === declEntry.sourceFile && d.category === declEntry.category
        );
        if (dupIdx === -1) {
          declarations.push(declEntry);
        }
        existing.metadata.declarations = declarations;
        const distinctVersions = Array.from(new Set(declarations.map((d) => d.declaredVersion)));
        if (distinctVersions.length > 1) {
          existing.sublabel = `${distinctVersions.join(' | ')} (${existing.metadata.ecosystem || dep.ecosystem})`;
        }
      }
      return id;
    };

    // Helper to get or create Commit Node
    const getOrCreateCommitNode = (commit: RawIngestionData['commits'][0]): string => {
      const id = `commit:${commit.shortHash}`;
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          type: 'COMMIT',
          label: `Commit #${commit.shortHash}`,
          sublabel: commit.message.split('\n')[0].substring(0, 50),
          metadata: {
            hash: commit.hash,
            author: commit.authorName,
            date: commit.date,
            description: commit.message,
            parents: commit.parents || []
          },
          sourceReference: commit.url,
          createdAt: commit.date,
          updatedAt: commit.date
        });
      } else {
        const existingNode = nodesMap.get(id);
        if (existingNode && commit.parents && commit.parents.length > 0) {
          existingNode.metadata.parents = commit.parents;
        }
      }
      return id;
    };

    // Helper to get or create PR Node
    const getOrCreatePRNode = (pr: RawIngestionData['pullRequests'][0]): string => {
      const id = `pull_request:${repoId}:${pr.number}`;
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          type: 'PULL_REQUEST',
          label: `PR #${pr.number}`,
          sublabel: pr.title,
          metadata: {
            number: pr.number,
            author: pr.author,
            state: pr.state,
            description: pr.body
          },
          sourceReference: pr.url,
          createdAt: pr.createdAt,
          updatedAt: pr.createdAt
        });
      }
      return id;
    };

    // Helper to get or create Issue Node
    const getOrCreateIssueNode = (issue: RawIngestionData['issues'][0]): string => {
      const id = `issue:${repoId}:${issue.number}`;
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          type: 'ISSUE',
          label: `Issue #${issue.number}`,
          sublabel: issue.title,
          metadata: {
            number: issue.number,
            author: issue.author,
            state: issue.state,
            description: issue.body
          },
          sourceReference: issue.url,
          createdAt: issue.createdAt,
          updatedAt: issue.createdAt
        });
      }
      return id;
    };

    // 2. Populate File Nodes from file tree
    (data.fileTree || []).forEach((f) => {
      if (f.type === 'file') {
        getOrCreateFileNode(f.path);
      }
    });

    // 3. Process Commits -> Nodes & Edges
    (data.commits || []).forEach((commit) => {
      const commitNodeId = getOrCreateCommitNode(commit);

      // Commit -> PARENT_OF -> Child Commit (Parent commit preceded child commit)
      if (commit.parents && commit.parents.length > 0) {
        commit.parents.forEach((parentHash) => {
          const parentShort = parentHash.substring(0, 7);
          const parentCommitNodeId = `commit:${parentShort}`;
          const parentObj = data.commits.find((c) => c.hash === parentHash || c.shortHash === parentShort);
          if (parentObj) {
            getOrCreateCommitNode(parentObj);
          } else if (!nodesMap.has(parentCommitNodeId)) {
            nodesMap.set(parentCommitNodeId, {
              id: parentCommitNodeId,
              type: 'COMMIT',
              label: `Commit #${parentShort}`,
              sublabel: 'Parent commit',
              metadata: { hash: parentHash, date: commit.date },
              sourceReference: `${data.repository.url}/commit/${parentHash}`,
              createdAt: commit.date,
              updatedAt: commit.date
            });
          }
          edgesList.push({
            id: `edge-parent-${parentShort}-${commit.shortHash}`,
            source: parentCommitNodeId,
            target: commitNodeId,
            relationshipType: StandardRelationship.PARENT_OF,
            evidence: `Commit #${commit.shortHash} has parent commit #${parentShort}`,
            confidence: 1.0,
            sourceUrl: commit.url,
            timestamp: commit.date,
            classification: 'FACT'
          });
        });
      }

      // Commit -> AUTHORED_BY -> Author
      if (commit.authorName) {
        const authorNodeId = getOrCreateAuthorNode(commit.authorName);
        edgesList.push({
          id: `edge-auth-${commit.shortHash}`,
          source: commitNodeId,
          target: authorNodeId,
          relationshipType: StandardRelationship.AUTHORED_BY,
          evidence: `Commit #${commit.shortHash} authored by ${commit.authorName}`,
          confidence: 1.0,
          sourceUrl: commit.url,
          timestamp: commit.date,
          classification: 'FACT'
        });
      }

      // Commit -> MODIFIED / CHANGED -> Files
      if (commit.files && commit.files.length > 0) {
        commit.files.slice(0, 5).forEach((f) => {
          const fileNodeId = getOrCreateFileNode(f.path);
          edgesList.push({
            id: `edge-mod-${commit.shortHash}-${f.path.replace(/[/.]/g, '_')}`,
            source: commitNodeId,
            target: fileNodeId,
            relationshipType: StandardRelationship.MODIFIED,
            evidence: `Commit #${commit.shortHash} changed ${f.path} (+${f.additions} -${f.deletions})`,
            confidence: 1.0,
            sourceUrl: commit.url,
            timestamp: commit.date,
            classification: 'FACT'
          });
        });
      }

      // Commit -> RESOLVES / REFERENCES -> Issue
      const issueMatches = Array.from(commit.message.matchAll(/#(\d+)/g));
      issueMatches.forEach((m) => {
        const issueNum = parseInt(m[1], 10);
        const existingIssue = (data.issues || []).find((i) => i.number === issueNum);
        const issueNodeId = existingIssue
          ? getOrCreateIssueNode(existingIssue)
          : `issue:${repoId}:${issueNum}`;

        if (!nodesMap.has(issueNodeId)) {
          nodesMap.set(issueNodeId, {
            id: issueNodeId,
            type: 'ISSUE',
            label: `Issue #${issueNum}`,
            sublabel: `Referenced in commit #${commit.shortHash}`,
            metadata: { number: issueNum },
            sourceReference: `${data.repository.url}/issues/${issueNum}`,
            createdAt: commit.date,
            updatedAt: commit.date
          });
        }

        const isExplicitFix = /(fix|fixes|close|closes|resolve|resolves)\s+#\d+/i.test(commit.message);
        edgesList.push({
          id: `edge-commit-issue-${commit.shortHash}-${issueNum}`,
          source: commitNodeId,
          target: issueNodeId,
          relationshipType: isExplicitFix ? StandardRelationship.RESOLVES : StandardRelationship.REFERENCES,
          evidence: isExplicitFix
            ? `Commit message explicitly resolves Issue #${issueNum}`
            : `Commit message references Issue #${issueNum}`,
          confidence: isExplicitFix ? 0.95 : 0.80,
          sourceUrl: commit.url,
          timestamp: commit.date,
          classification: isExplicitFix ? 'FACT' : 'INFERENCE'
        });
      });
    });

    // 4. Process Pull Requests -> Nodes & Edges
    (data.pullRequests || []).forEach((pr) => {
      const prNodeId = getOrCreatePRNode(pr);

      // PR -> AUTHORED_BY -> Author
      if (pr.author) {
        const authorNodeId = getOrCreateAuthorNode(pr.author);
        edgesList.push({
          id: `edge-pr-auth-${pr.number}`,
          source: prNodeId,
          target: authorNodeId,
          relationshipType: StandardRelationship.AUTHORED_BY,
          evidence: `Pull Request #${pr.number} authored by ${pr.author}`,
          confidence: 1.0,
          sourceUrl: pr.url,
          timestamp: pr.createdAt,
          classification: 'FACT'
        });
      }

      // PR -> RESOLVES -> Issue
      const prIssueMatches = Array.from(pr.body.matchAll(/#(\d+)/g));
      prIssueMatches.forEach((m) => {
        const issueNum = parseInt(m[1], 10);
        const existingIssue = (data.issues || []).find((i) => i.number === issueNum);
        const issueNodeId = existingIssue
          ? getOrCreateIssueNode(existingIssue)
          : `issue:${repoId}:${issueNum}`;

        if (!nodesMap.has(issueNodeId)) {
          nodesMap.set(issueNodeId, {
            id: issueNodeId,
            type: 'ISSUE',
            label: `Issue #${issueNum}`,
            sublabel: `Referenced in PR #${pr.number}`,
            metadata: { number: issueNum },
            sourceReference: `${data.repository.url}/issues/${issueNum}`,
            createdAt: pr.createdAt,
            updatedAt: pr.createdAt
          });
        }

        const isExplicitFix = /(fix|fixes|close|closes|resolve|resolves)\s+#\d+/i.test(pr.body);
        edgesList.push({
          id: `edge-pr-issue-${pr.number}-${issueNum}`,
          source: prNodeId,
          target: issueNodeId,
          relationshipType: isExplicitFix ? StandardRelationship.RESOLVES : StandardRelationship.REFERENCES,
          evidence: isExplicitFix
            ? `Pull Request #${pr.number} explicitly resolves Issue #${issueNum}`
            : `Pull Request #${pr.number} description mentions Issue #${issueNum}`,
          confidence: isExplicitFix ? 0.98 : 0.85,
          sourceUrl: pr.url,
          timestamp: pr.createdAt,
          classification: isExplicitFix ? 'FACT' : 'INFERENCE'
        });
      });
    });

    // 5. Process Issues
    (data.issues || []).forEach((issue) => {
      const issueNodeId = getOrCreateIssueNode(issue);
      if (issue.author) {
        const authorNodeId = getOrCreateAuthorNode(issue.author);
        edgesList.push({
          id: `edge-issue-auth-${issue.number}`,
          source: issueNodeId,
          target: authorNodeId,
          relationshipType: StandardRelationship.AUTHORED_BY,
          evidence: `Issue #${issue.number} created by ${issue.author}`,
          confidence: 1.0,
          sourceUrl: issue.url,
          timestamp: issue.createdAt,
          classification: 'FACT'
        });
      }
    });

    // 6. Process Direct Dependencies -> Shared Nodes & Per-Manifest Edges
    (data.dependencies || []).forEach((dep) => {
      const depNodeId = getOrCreateDependencyNode(dep);
      const fileNodeId = getOrCreateFileNode(dep.sourceFile);
      const safeEcosystem = (dep.ecosystem || 'other').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeSource = dep.sourceFile.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeCat = (dep.category || 'dependencies').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeName = dep.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const declaredVer = dep.declaredVersion || dep.version;
      const lockedSuffix = dep.resolvedVersion ? ` (locked: ${dep.resolvedVersion})` : '';

      edgesList.push({
        id: `edge-dep-${safeEcosystem}-${safeSource}-${safeCat}-${safeName}`,
        source: fileNodeId,
        target: depNodeId,
        relationshipType: StandardRelationship.DEPENDS_ON,
        evidence: `Manifest ${dep.sourceFile} (${dep.category || 'dependencies'}) declares dependency ${dep.name}@${declaredVer}${lockedSuffix}`,
        confidence: 1.0,
        sourceUrl: `${data.repository.url}/blob/${data.repository.defaultBranch}/${dep.sourceFile}`,
        timestamp: now,
        classification: 'FACT',
        metadata: {
          packageName: dep.name,
          declaredVersion: declaredVer,
          resolvedVersion: dep.resolvedVersion,
          lockfileSource: dep.lockfileSource,
          category: dep.category || 'dependencies',
          ecosystem: dep.ecosystem,
          sourceManifest: dep.sourceFile,
          workspaceName: dep.workspaceName,
          isDirect: dep.isDirect !== false
        }
      });
    });

    // 6.25. Integrate Tree-sitter AST Symbols, Imports & Resolved Calls
    const astAnalyzedPaths = new Set<string>();
    const symbolIdToGraphNodeId = new Map<string, string>();
    const astFileResultMap = new Map<string, NonNullable<RawIngestionData['astAnalysis']>['files'][0]>();

    (data.astAnalysis?.files || []).forEach((fileAst) => {
      astFileResultMap.set(fileAst.filePath, fileAst);
      const fileNodeId = getOrCreateFileNode(fileAst.filePath);
      const fileNode = nodesMap.get(fileNodeId);

      if (fileAst.status === 'ANALYZED' || fileAst.status === 'PARTIALLY_ANALYZED') {
        astAnalyzedPaths.add(fileAst.filePath);
      }

      const interfaces = fileAst.symbols.filter((s) => s.kind === 'interface').map((s) => ({
        name: s.name,
        isExported: s.isExported,
        range: s.range
      }));
      const typeAliases = fileAst.symbols.filter((s) => s.kind === 'type_alias').map((s) => ({
        name: s.name,
        isExported: s.isExported,
        range: s.range
      }));

      if (fileNode) {
        fileNode.metadata.language = fileAst.language;
        fileNode.metadata.analysisStatus = fileAst.status;
        fileNode.metadata.parseErrorsCount = fileAst.parseErrorsCount;
        fileNode.metadata.exports = fileAst.exports;
        fileNode.metadata.unresolvedImports = fileAst.imports
          .filter((imp) => !imp.resolvedFilePath && imp.kind !== 'external_package')
          .map((imp) => ({ source: imp.source, note: imp.resolutionNote }));
        fileNode.metadata.externalImports = fileAst.imports
          .filter((imp) => imp.kind === 'external_package')
          .map((imp) => imp.externalPackageName || imp.source);
        if (interfaces.length > 0) fileNode.metadata.interfaces = interfaces;
        if (typeAliases.length > 0) fileNode.metadata.typeAliases = typeAliases;
      }

      if (fileAst.status !== 'ANALYZED' && fileAst.status !== 'PARTIALLY_ANALYZED') {
        return;
      }

      // Create COMPONENT / FUNCTION nodes + DECLARES / EXPOSES edges
      fileAst.symbols.forEach((sym) => {
        if (sym.kind === 'interface' || sym.kind === 'type_alias') return;

        const graphNodeType: GraphNodeType =
          sym.kind === 'component' || sym.kind === 'class' ? 'COMPONENT' : 'FUNCTION';
        const safeSymPart = sym.qualifiedName.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const safeFilePart = sym.filePath.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const symNodeId = `${graphNodeType.toLowerCase()}:${repoId}:${sym.filePath}:${sym.qualifiedName}:${sym.range.startLine}`;
        const lineAnchor = `${data.repository.url}/blob/${data.repository.defaultBranch}/${sym.filePath}#L${sym.range.startLine}-L${sym.range.endLine}`;

        if (!nodesMap.has(symNodeId)) {
          nodesMap.set(symNodeId, {
            id: symNodeId,
            type: graphNodeType,
            label: sym.qualifiedName,
            sublabel: sym.filePath,
            metadata: {
              path: sym.filePath,
              filePath: sym.filePath,
              symbolKind: sym.kind,
              qualifiedName: sym.qualifiedName,
              parentName: sym.parentName,
              parameters: sym.parameters,
              isExported: sym.isExported,
              isAsync: sym.isAsync,
              lineRange: { startLine: sym.range.startLine, endLine: sym.range.endLine },
              language: fileAst.language
            },
            sourceReference: lineAnchor,
            createdAt: now,
            updatedAt: now
          });
        }

        symbolIdToGraphNodeId.set(sym.id, symNodeId);

        edgesList.push({
          id: `edge-decl-${repoId}-${safeFilePart}-${safeSymPart}-${sym.range.startLine}`,
          source: fileNodeId,
          target: symNodeId,
          relationshipType: StandardRelationship.DECLARES,
          evidence: `${sym.filePath} declares ${sym.kind} "${sym.qualifiedName}" (L${sym.range.startLine}-L${sym.range.endLine})`,
          confidence: 1.0,
          sourceUrl: lineAnchor,
          timestamp: now,
          classification: 'FACT',
          metadata: {
            symbolKind: sym.kind,
            lineRange: sym.range
          }
        });

        if (sym.isExported) {
          edgesList.push({
            id: `edge-exp-${repoId}-${safeFilePart}-${safeSymPart}-${sym.range.startLine}`,
            source: fileNodeId,
            target: symNodeId,
            relationshipType: StandardRelationship.EXPOSES,
            evidence: `${sym.filePath} exports ${sym.kind} "${sym.qualifiedName}" (L${sym.range.startLine})`,
            confidence: 1.0,
            sourceUrl: lineAnchor,
            timestamp: now,
            classification: 'FACT'
          });
        }
      });

      // Verified internal IMPORTS edges (FILE -> FILE)
      fileAst.imports.forEach((imp, impIdx) => {
        if (!imp.resolvedFilePath) return;
        const targetFileNodeId = getOrCreateFileNode(imp.resolvedFilePath);
        const safeSrc = fileAst.filePath.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const safeTgt = imp.resolvedFilePath.replace(/[^a-zA-Z0-9_.-]/g, '_');
        edgesList.push({
          id: `edge-imp-${repoId}-${safeSrc}-${safeTgt}-${impIdx}`,
          source: fileNodeId,
          target: targetFileNodeId,
          relationshipType: StandardRelationship.IMPORTS,
          evidence: `${fileAst.filePath} imports "${imp.source}" resolved to ${imp.resolvedFilePath} (L${imp.range.startLine})`,
          confidence: 1.0,
          sourceUrl: `${data.repository.url}/blob/${data.repository.defaultBranch}/${fileAst.filePath}#L${imp.range.startLine}`,
          timestamp: now,
          classification: 'FACT',
          metadata: {
            specifier: imp.source,
            specifiers: imp.specifiers,
            isTypeOnly: imp.isTypeOnly,
            lineRange: imp.range
          }
        });
      });
    });

    // Second pass over AST for cross-file resolved CALLS and Component CONTAINS edges
    (data.astAnalysis?.files || []).forEach((fileAst) => {
      if (fileAst.status !== 'ANALYZED' && fileAst.status !== 'PARTIALLY_ANALYZED') return;
      const fileNodeId = `file:${repoId}:${fileAst.filePath}`;

      fileAst.symbols.forEach((sym) => {
        const parentCompNodeId = symbolIdToGraphNodeId.get(sym.id);
        if (!parentCompNodeId || !sym.resolvedComponentsUsed?.length) return;

        sym.resolvedComponentsUsed.forEach((compRef, idx) => {
          const childCompNodeId = compRef.targetSymbolId
            ? symbolIdToGraphNodeId.get(compRef.targetSymbolId)
            : undefined;
          if (!childCompNodeId || childCompNodeId === parentCompNodeId) return;

          edgesList.push({
            id: `edge-comp-contains-${repoId}-${sym.name}-${compRef.componentName}-${idx}`,
            source: parentCompNodeId,
            target: childCompNodeId,
            relationshipType: StandardRelationship.CONTAINS,
            evidence: `Component "${sym.name}" in ${fileAst.filePath} renders <${compRef.componentName} /> (${compRef.targetFilePath})`,
            confidence: 1.0,
            sourceUrl: `${data.repository.url}/blob/${data.repository.defaultBranch}/${fileAst.filePath}#L${sym.range.startLine}`,
            timestamp: now,
            classification: 'FACT'
          });
        });
      });

      fileAst.calls.forEach((call, idx) => {
        if (!call.resolved || !call.targetSymbolId) return;
        const targetNodeId = symbolIdToGraphNodeId.get(call.targetSymbolId);
        if (!targetNodeId) return;

        let callerNodeId = fileNodeId;
        if (call.callerName !== '<module>') {
          const callerSym = fileAst.symbols.find((s) => s.qualifiedName === call.callerName);
          const mappedCaller = callerSym ? symbolIdToGraphNodeId.get(callerSym.id) : undefined;
          if (mappedCaller) callerNodeId = mappedCaller;
        }
        if (callerNodeId === targetNodeId) return;

        edgesList.push({
          id: `edge-call-${repoId}-${fileAst.filePath.replace(/[^a-zA-Z0-9_-]/g, '_')}-${idx}`,
          source: callerNodeId,
          target: targetNodeId,
          relationshipType: StandardRelationship.CALLS,
          evidence: `${call.callerName} in ${fileAst.filePath} (L${call.range.startLine}) calls ${call.calleeText} -> ${call.targetSymbolName} (${call.targetFilePath})`,
          confidence: 1.0,
          sourceUrl: `${data.repository.url}/blob/${data.repository.defaultBranch}/${fileAst.filePath}#L${call.range.startLine}`,
          timestamp: now,
          classification: 'FACT',
          metadata: {
            calleeText: call.calleeText,
            targetKind: call.targetKind,
            lineRange: call.range
          }
        });
      });
    });

    // 6.5. Extract Inter-File & Test Structural Code Relationships
    const fileNodes = Array.from(nodesMap.values()).filter((n) => n.type === 'FILE');

    // 6.5a. Link Test Files to Source Files (skip guessing if test file already has resolved AST IMPORTS)
    fileNodes.forEach((node) => {
      const lowerPath = (node.metadata.path as string || node.id).toLowerCase();
      const isTest = lowerPath.includes('.test.') || lowerPath.includes('.spec.') || lowerPath.includes('__tests__') || lowerPath.includes('/test/');

      if (isTest) {
        const cleanName = node.label.replace(/(\.test|\.spec)/i, '');
        const match = fileNodes.find((n) => n.id !== node.id && (n.label === cleanName || n.label.startsWith(cleanName.split('.')[0])));

        if (match) {
          const alreadyImported = edgesList.some(
            (e) => e.source === node.id && e.target === match.id && e.relationshipType === StandardRelationship.IMPORTS
          );
          if (!alreadyImported) {
            edgesList.push({
              id: `edge-test-${node.id.replace(/[:/.]/g, '_')}-${match.id.replace(/[:/.]/g, '_')}`,
              source: node.id,
              target: match.id,
              relationshipType: StandardRelationship.DEPENDS_ON,
              evidence: `Test suite ${node.label} directly covers component ${match.label}`,
              confidence: 0.95,
              sourceUrl: node.sourceReference,
              timestamp: now,
              classification: 'FACT'
            });
          }
        }
      }
    });

    // 6.5b. Extract Structural Code Edges from Co-modified Commit Clusters ONLY when files lack full AST coverage
    (data.commits || []).forEach((commit) => {
      if (!commit.files || commit.files.length < 2) return;
      const changedFileIds = commit.files.slice(0, 10).map((f) => getOrCreateFileNode(f.path));

      for (let i = 0; i < changedFileIds.length; i++) {
        for (let j = i + 1; j < changedFileIds.length; j++) {
          const idA = changedFileIds[i];
          const idB = changedFileIds[j];
          const nodeA = nodesMap.get(idA);
          const nodeB = nodesMap.get(idB);
          if (!nodeA || !nodeB) continue;

          const pathA = (nodeA.metadata.path as string || '');
          const pathB = (nodeB.metadata.path as string || '');
          // If both files were deterministically AST-analyzed, do not fabricate heuristic co-modification dependencies
          if (astAnalyzedPaths.has(pathA) && astAnalyzedPaths.has(pathB)) {
            continue;
          }

          // Determine directionality based on software layering conventions (Controller -> Service -> Util/Repo)
          let source = idA;
          let target = idB;

          const lowerA = pathA.toLowerCase();
          const lowerB = pathB.toLowerCase();

          if (lowerA.includes('controller') || lowerA.includes('route') || lowerA.includes('page') || lowerA.includes('view')) {
            source = idA;
            target = idB;
          } else if (lowerB.includes('controller') || lowerB.includes('route') || lowerB.includes('page') || lowerB.includes('view')) {
            source = idB;
            target = idA;
          } else if (lowerA.includes('service') || lowerA.includes('workflow')) {
            source = idB.includes('controller') || idB.includes('route') ? idB : idA;
            target = idB.includes('controller') || idB.includes('route') ? idA : idB;
          }

          // Check for existing edge between source and target
          const edgeExists = edgesList.some((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source));
          if (!edgeExists) {
            edgesList.push({
              id: `edge-struct-${commit.shortHash}-${i}-${j}`,
              source,
              target,
              relationshipType: StandardRelationship.DEPENDS_ON,
              evidence: `Component ${nodesMap.get(source)?.label} co-evolved with ${nodesMap.get(target)?.label} in commit #${commit.shortHash}`,
              confidence: 0.85,
              sourceUrl: commit.url,
              timestamp: commit.date,
              classification: 'INFERENCE'
            });
          }
        }
      }
    });

    // 7. Validate Nodes and Edges using GraphValidator
    const rawNodes = Array.from(nodesMap.values());
    const validationResult = GraphValidator.validate(rawNodes, edgesList);

    if (validationResult.rejectedEdgeErrors.length > 0) {
      console.warn(`[GraphBuilder] Rejected ${validationResult.rejectedEdgeErrors.length} malformed edges.`);
    }

    const finalNodes = validationResult.validNodes;
    const finalEdges = validationResult.validEdges;

    // Compute node connection degrees
    const degreeMap = new Map<string, number>();
    finalEdges.forEach((e) => {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
    });

    finalNodes.forEach((node) => {
      node.metadata.degree = degreeMap.get(node.id) || 0;
    });

    // Calculate Summary Stats
    const nodesByType: Record<GraphNodeType, number> = {
      REPOSITORY: 0,
      FILE: 0,
      FUNCTION: 0,
      COMPONENT: 0,
      COMMIT: 0,
      PULL_REQUEST: 0,
      ISSUE: 0,
      DECISION: 0,
      INCIDENT: 0,
      DEPENDENCY: 0,
      OUTCOME: 0,
      AUTHOR: 0
    };

    finalNodes.forEach((n) => {
      nodesByType[n.type] = (nodesByType[n.type] || 0) + 1;
    });

    const edgesByType: Record<string, number> = {};
    let factCount = 0;
    let inferenceCount = 0;
    let unknownCount = 0;

    finalEdges.forEach((e) => {
      edgesByType[e.relationshipType] = (edgesByType[e.relationshipType] || 0) + 1;
      if (e.classification === 'FACT') factCount++;
      else if (e.classification === 'INFERENCE') inferenceCount++;
      else if (e.classification === 'UNKNOWN') unknownCount++;
    });

    // Top 5 most connected nodes
    const topConnectedNodes = [...finalNodes]
      .sort((a, b) => (b.metadata.degree as number) - (a.metadata.degree as number))
      .slice(0, 5)
      .map((n) => ({
        id: n.id,
        label: n.label,
        type: n.type,
        connectionCount: n.metadata.degree as number
      }));

    const summary: GraphSummary = {
      repositoryId: repoId,
      totalNodes: finalNodes.length,
      totalEdges: finalEdges.length,
      nodesByType,
      edgesByType,
      factCount,
      inferenceCount,
      unknownCount,
      topConnectedNodes,
      builtAt: now
    };

    return {
      repositoryId: repoId,
      nodes: finalNodes,
      edges: finalEdges,
      summary
    };
  }
}
