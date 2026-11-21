import { Request, Response } from 'express';
import { normalizeGitHubUrl, GitHubService } from '../services/githubService';
import { EvidenceService } from '../services/evidenceService';
import { GraphBuilder, EngineeringMemoryGraph } from '../../../graph-engine/src';
import { GraphRepository } from '../services/graphRepository';
import { EeidGraphIngestionService } from '../services/eeidGraphIngestionService';
import {
  analyzeRepositoryFiles,
  DEFAULT_MAX_AST_FILE_BYTES,
  isSupportedSourceFile,
  RepositoryAstAnalysis,
  RepositorySourceInput
} from '../../../analyzer/src/index';
import {
  RepositoryMetadata,
  FileTreeItem,
  CommitItem,
  PullRequestItem,
  IssueItem,
  DependencyItem,
  DependencyExtractionResult,
  NormalizedEvidence,
  AnalysisSummary
} from '../types/evidence';

export interface AnalyzedRepoSnapshot {
  metadata: RepositoryMetadata;
  fileTree: FileTreeItem[];
  commits: CommitItem[];
  pullRequests: PullRequestItem[];
  issues: IssueItem[];
  dependencies: DependencyItem[];
  dependencyExtraction?: DependencyExtractionResult;
  astAnalysis?: RepositoryAstAnalysis;
  sourceContents?: Map<string, string>;
  evidence: NormalizedEvidence[];
  graph: EngineeringMemoryGraph;
  summary: AnalysisSummary;
}

// In-Memory Repository Storage Cache for Phase 1
const repositoryCache = new Map<string, AnalyzedRepoSnapshot>();

// Helper function to seed default repositories when empty
export function ensureSeededRepositories(): void {
  if (repositoryCache.size > 0) {
    if (!EeidGraphIngestionService.isIngested()) {
      EeidGraphIngestionService.ingestEeidRepositories();
    }
    return;
  }

  const now = new Date().toISOString();
  const tenMinsAgo = new Date(Date.now() - 600000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();

  // 1. facebook/react
  const reactMetadata: RepositoryMetadata = {
    id: 'repo-facebook-react',
    url: 'https://github.com/facebook/react',
    owner: 'facebook',
    repo: 'react',
    name: 'facebook/react',
    description: 'The library for web and native user interfaces.',
    defaultBranch: 'main',
    language: 'JavaScript',
    stars: 231000,
    forks: 46200,
    openIssuesCount: 1420,
    isPrivate: false,
    createdAt: '2013-05-24T16:15:54Z',
    updatedAt: now
  };

  const reactCommits: CommitItem[] = [
    {
      hash: '8af42d9102938475',
      shortHash: '8af42d9',
      message: 'fix(renderer): resolve reconciliation timeout on large fiber trees (#142)',
      authorName: 'Sophie Alpert',
      authorEmail: 'sophie@fb.com',
      date: '2025-08-20T10:00:00Z',
      url: 'https://github.com/facebook/react/commit/8af42d9102938475',
      changedFilesCount: 4,
      parents: ['5e22ff1139201949']
    },
    {
      hash: '5e22ff1139201949',
      shortHash: '5e22ff1',
      message: 'Merge pull request #145 from facebook/compiler-auto-memoization',
      authorName: 'Andrew Clark',
      authorEmail: 'acdlite@fb.com',
      date: '2025-08-19T18:00:00Z',
      url: 'https://github.com/facebook/react/commit/5e22ff1139201949',
      changedFilesCount: 6,
      parents: ['4c11ae8839201948', '7d33ef0029384715']
    },
    {
      hash: '7d33ef0029384715',
      shortHash: '7d33ef0',
      message: 'feat(compiler): add auto-memoization pass for inline JSX',
      authorName: 'Satoshi Shindo',
      authorEmail: 'satoshi@fb.com',
      date: '2025-08-18T16:45:00Z',
      url: 'https://github.com/facebook/react/commit/7d33ef0029384715',
      changedFilesCount: 5,
      parents: ['3b11cd9910293842']
    },
    {
      hash: '3b11cd9910293842',
      shortHash: '3b11cd9',
      message: 'feat(compiler): initial memoization graph engine',
      authorName: 'Satoshi Shindo',
      authorEmail: 'satoshi@fb.com',
      date: '2025-08-16T11:00:00Z',
      url: 'https://github.com/facebook/react/commit/3b11cd9910293842',
      changedFilesCount: 3,
      parents: ['9f22be1102938471']
    },
    {
      hash: '4c11ae8839201948',
      shortHash: '4c11ae8',
      message: 'refactor(scheduler): update concurrent priority queue dispatcher (#280)',
      authorName: 'Andrew Clark',
      authorEmail: 'acdlite@fb.com',
      date: '2025-08-17T14:30:00Z',
      url: 'https://github.com/facebook/react/commit/4c11ae8839201948',
      changedFilesCount: 3,
      parents: ['9f22be1102938471']
    },
    {
      hash: '9f22be1102938471',
      shortHash: '9f22be1',
      message: 'docs: update hook dependencies reference and compiler guidelines',
      authorName: 'Dan Abramov',
      authorEmail: 'dan@fb.com',
      date: '2025-08-15T09:15:00Z',
      url: 'https://github.com/facebook/react/commit/9f22be1102938471',
      changedFilesCount: 2,
      parents: []
    }
  ];

  const reactFiles: FileTreeItem[] = [
    { path: 'packages/react/src/React.js', type: 'file', size: 4200, extension: 'js' },
    { path: 'packages/react/src/ReactBaseClasses.js', type: 'file', size: 2800, extension: 'js' },
    { path: 'packages/react/src/ReactCreateRef.js', type: 'file', size: 1200, extension: 'js' },
    { path: 'packages/react/src/ReactElement.js', type: 'file', size: 6200, extension: 'js' },
    { path: 'packages/react/src/ReactHooks.js', type: 'file', size: 3100, extension: 'js' },
    { path: 'packages/react-dom/src/client/ReactDOM.js', type: 'file', size: 5500, extension: 'js' },
    { path: 'packages/react-dom/src/client/ReactDOMRoot.js', type: 'file', size: 8500, extension: 'js' },
    { path: 'packages/react-dom/src/client/ReactDOMLegacy.js', type: 'file', size: 9800, extension: 'js' },
    { path: 'packages/react-reconciler/src/ReactFiberScheduler.js', type: 'file', size: 14200, extension: 'js' },
    { path: 'packages/react-reconciler/src/ReactFiberWorkLoop.js', type: 'file', size: 22000, extension: 'js' },
    { path: 'packages/react-reconciler/src/ReactFiberRoot.js', type: 'file', size: 6800, extension: 'js' },
    { path: 'packages/react-reconciler/src/ReactFiberReconciler.js', type: 'file', size: 18500, extension: 'js' },
    { path: 'packages/scheduler/src/Scheduler.js', type: 'file', size: 7600, extension: 'js' },
    { path: 'packages/scheduler/src/SchedulerPriorities.js', type: 'file', size: 1400, extension: 'js' },
    { path: 'packages/shared/ReactSymbols.js', type: 'file', size: 2100, extension: 'js' },
    { path: 'packages/shared/ReactSharedInternals.js', type: 'file', size: 1500, extension: 'js' },
    { path: 'scripts/rollup/config.js', type: 'file', size: 4500, extension: 'js' },
    { path: 'scripts/jest/config.js', type: 'file', size: 3200, extension: 'js' },
    { path: 'fixtures/fiber-debugger/src/index.js', type: 'file', size: 900, extension: 'js' },
    { path: 'fixtures/fiber-debugger/src/App.js', type: 'file', size: 2400, extension: 'js' },
    { path: 'package.json', type: 'file', size: 1800, extension: 'json' },
    { path: 'README.md', type: 'file', size: 3800, extension: 'md' },
    { path: 'LICENSE', type: 'file', size: 1100, extension: 'txt' },
    { path: '.gitignore', type: 'file', size: 450, extension: '' }
  ];

  const reactPullRequests: PullRequestItem[] = [
    { id: 142, number: 142, title: 'Fix reconciliation timeout', body: 'Resolves fiber tree stall', author: 'sophiealpert', state: 'merged', createdAt: '2025-08-19T00:00:00Z', url: 'https://github.com/facebook/react/pull/142' }
  ];

  const reactIssues: IssueItem[] = [
    { id: 142, number: 142, title: 'Reconciliation timeout under heavy render loop', body: 'Fiber scheduler locks under high frame rate', author: 'gaearon', state: 'closed', labels: ['bug'], createdAt: '2025-08-18T00:00:00Z', url: 'https://github.com/facebook/react/issues/142' }
  ];

  const reactDependencies: DependencyItem[] = [
    { name: 'loose-envify', version: '^1.1.0', sourceFile: 'package.json', ecosystem: 'npm' },
    { name: 'object-assign', version: '^4.1.1', sourceFile: 'package.json', ecosystem: 'npm' }
  ];

  const reactEvidence: NormalizedEvidence[] = [
    {
      id: 'ev-react-1',
      repositoryId: 'repo-facebook-react',
      source: 'commit:8af42d',
      target: 'issue:142',
      relationshipType: 'REFERENCES_ISSUE',
      classification: 'FACT',
      confidence: 0.95,
      title: 'Commit #8af42d explicitly resolves Issue #142',
      description: 'Commit message contains resolution keyword "fix #142".',
      sourceUrl: 'https://github.com/facebook/react/commit/8af42d91',
      timestamp: now
    },
    {
      id: 'ev-react-2',
      repositoryId: 'repo-facebook-react',
      source: 'author:sophie-alpert',
      target: 'commit:8af42d',
      relationshipType: 'AUTHORED',
      classification: 'FACT',
      confidence: 1.0,
      title: 'Sophie Alpert authored commit #8af42d',
      description: 'Direct Git author signature recorded in commit history.',
      sourceUrl: 'https://github.com/facebook/react/commit/8af42d91',
      timestamp: now
    },
    {
      id: 'ev-react-3',
      repositoryId: 'repo-facebook-react',
      source: 'pr:142',
      target: 'issue:142',
      relationshipType: 'RESOLVED_BY',
      classification: 'INFERENCE',
      confidence: 0.88,
      title: 'PR #142 correlates with reconciliation timeout issue',
      description: 'PR description mentions related issue ticket without explicit keyword.',
      sourceUrl: 'https://github.com/facebook/react/pull/142',
      timestamp: now
    }
  ];

  const reactSummary: AnalysisSummary = {
    repository: reactMetadata,
    totalFiles: 420,
    totalCommits: 30,
    totalPullRequests: 20,
    totalIssues: 20,
    totalDependencies: 12,
    totalEvidenceRecords: 48,
    analyzedAt: now,
    factCount: 32,
    inferenceCount: 12,
    unknownCount: 4,
    recentCommits: reactCommits
  };

  const reactGraph = GraphBuilder.buildGraph({
    repository: reactMetadata,
    fileTree: reactFiles,
    commits: reactCommits,
    pullRequests: reactPullRequests,
    issues: reactIssues,
    dependencies: reactDependencies,
    evidenceRecords: reactEvidence
  });

  GraphRepository.saveGraph(reactMetadata.id, reactGraph, ['facebook-react', 'react']);
  const reactSnapshot: AnalyzedRepoSnapshot = {
    metadata: reactMetadata,
    fileTree: reactFiles,
    commits: reactCommits,
    pullRequests: reactPullRequests,
    issues: reactIssues,
    dependencies: reactDependencies,
    evidence: reactEvidence,
    graph: reactGraph,
    summary: reactSummary
  };
  repositoryCache.set(reactMetadata.id, reactSnapshot);
  repositoryCache.set('facebook-react', reactSnapshot);

  // 2. codeorigin/engineering-core
  const coreMetadata: RepositoryMetadata = {
    id: 'repo-codeorigin-core',
    url: 'https://github.com/codeorigin/engineering-core',
    owner: 'codeorigin',
    repo: 'engineering-core',
    name: 'codeorigin/engineering-core',
    description: 'Core Engineering Memory Graph construction and evidence normalization engine.',
    defaultBranch: 'main',
    language: 'TypeScript',
    stars: 1240,
    forks: 185,
    openIssuesCount: 12,
    isPrivate: false,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: tenMinsAgo
  };

  const coreCommits: CommitItem[] = [
    {
      hash: '3f901a8820194817',
      shortHash: '3f901a8',
      message: 'feat(graph): introduce multi-hop neighborhood query engine',
      authorName: 'Elena Rostova',
      authorEmail: 'elena@codeorigin.dev',
      date: '2025-08-21T10:30:00Z',
      url: 'https://github.com/codeorigin/engineering-core/commit/3f901a8820194817',
      changedFilesCount: 5,
      parents: ['7b44ce1129384712']
    },
    {
      hash: '7b44ce1129384712',
      shortHash: '7b44ce1',
      message: 'fix(evidence): resolve relationship classification confidence score calculation',
      authorName: 'Alex Rivera',
      authorEmail: 'alex@codeorigin.dev',
      date: '2025-08-20T16:00:00Z',
      url: 'https://github.com/codeorigin/engineering-core/commit/7b44ce1129384712',
      changedFilesCount: 2,
      parents: []
    }
  ];

  const coreFiles: FileTreeItem[] = [
    { path: 'src/graph/GraphBuilder.ts', type: 'file', size: 9400, extension: 'ts' },
    { path: 'src/evidence/EvidenceNormalizer.ts', type: 'file', size: 6800, extension: 'ts' },
    { path: 'package.json', type: 'file', size: 1400, extension: 'json' }
  ];

  const corePullRequests: PullRequestItem[] = [];
  const coreIssues: IssueItem[] = [];
  const coreDependencies: DependencyItem[] = [
    { name: 'typescript', version: '^5.7.0', sourceFile: 'package.json', ecosystem: 'npm' }
  ];

  const coreEvidence: NormalizedEvidence[] = [
    {
      id: 'ev-core-1',
      repositoryId: 'repo-codeorigin-core',
      source: 'commit:3f901a',
      target: 'file:src/graph/GraphBuilder.ts',
      relationshipType: 'MODIFIED',
      classification: 'FACT',
      confidence: 1.0,
      title: 'GraphBuilder extended with multi-hop neighborhood engine',
      description: 'Commit #3f901a added GraphQueryEngine.getNeighborhood method.',
      sourceUrl: 'https://github.com/codeorigin/engineering-core/commit/3f901a88',
      timestamp: tenMinsAgo
    }
  ];

  const coreSummary: AnalysisSummary = {
    repository: coreMetadata,
    totalFiles: 180,
    totalCommits: 52,
    totalPullRequests: 24,
    totalIssues: 18,
    totalDependencies: 16,
    totalEvidenceRecords: 91,
    analyzedAt: tenMinsAgo,
    factCount: 65,
    inferenceCount: 20,
    unknownCount: 6,
    recentCommits: coreCommits
  };

  const coreGraph = GraphBuilder.buildGraph({
    repository: coreMetadata,
    fileTree: coreFiles,
    commits: coreCommits,
    pullRequests: corePullRequests,
    issues: coreIssues,
    dependencies: coreDependencies,
    evidenceRecords: coreEvidence
  });

  GraphRepository.saveGraph(coreMetadata.id, coreGraph, ['codeorigin-engineering-core', 'codeorigin-core']);
  const coreSnapshot: AnalyzedRepoSnapshot = {
    metadata: coreMetadata,
    fileTree: coreFiles,
    commits: coreCommits,
    pullRequests: corePullRequests,
    issues: coreIssues,
    dependencies: coreDependencies,
    evidence: coreEvidence,
    graph: coreGraph,
    summary: coreSummary
  };
  repositoryCache.set(coreMetadata.id, coreSnapshot);
  repositoryCache.set('codeorigin-engineering-core', coreSnapshot);

  // 3. codeorigin/payment-gateway
  const payMetadata: RepositoryMetadata = {
    id: 'repo-payment-gateway',
    url: 'https://github.com/codeorigin/payment-gateway',
    owner: 'codeorigin',
    repo: 'payment-gateway',
    name: 'codeorigin/payment-gateway',
    description: 'High-throughput PCI-DSS payment processing & idempotency service.',
    defaultBranch: 'main',
    language: 'TypeScript',
    stars: 840,
    forks: 92,
    openIssuesCount: 45,
    isPrivate: false,
    createdAt: '2024-03-10T14:20:00Z',
    updatedAt: twoHoursAgo
  };

  const payCommits: CommitItem[] = [
    {
      hash: '5a11029384759f12',
      shortHash: '5a11029',
      message: 'fix(cache): add Redis caching wrapper to prevent DB lock (#142)',
      authorName: 'Alex Rivera',
      authorEmail: 'alex@codeorigin.dev',
      date: '2025-08-21T08:00:00Z',
      url: 'https://github.com/codeorigin/payment-gateway/commit/5a11029384759f12',
      changedFilesCount: 3,
      parents: ['2c99384712019488']
    },
    {
      hash: '2c99384712019488',
      shortHash: '2c99384',
      message: 'refactor(auth): introduce stateless RS256 JWT validation (#280)',
      authorName: 'Elena Rostova',
      authorEmail: 'elena@codeorigin.dev',
      date: '2025-08-20T11:00:00Z',
      url: 'https://github.com/codeorigin/payment-gateway/commit/2c99384712019488',
      changedFilesCount: 2,
      parents: []
    }
  ];

  const payFiles: FileTreeItem[] = [
    { path: 'src/PaymentService.ts', type: 'file', size: 4200, extension: 'ts' },
    { path: 'src/middleware/AuthMiddleware.ts', type: 'file', size: 3100, extension: 'ts' },
    { path: 'package.json', type: 'file', size: 1800, extension: 'json' }
  ];

  const payPullRequests: PullRequestItem[] = [];
  const payIssues: IssueItem[] = [];
  const payDependencies: DependencyItem[] = [
    { name: 'ioredis', version: '^5.3.0', sourceFile: 'package.json', ecosystem: 'npm' },
    { name: 'jsonwebtoken', version: '^9.0.2', sourceFile: 'package.json', ecosystem: 'npm' }
  ];

  const payEvidence: NormalizedEvidence[] = [
    {
      id: 'ev-pay-1',
      repositoryId: 'repo-payment-gateway',
      source: 'commit:5a1102',
      target: 'file:src/PaymentService.ts',
      relationshipType: 'MODIFIED',
      classification: 'FACT',
      confidence: 1.0,
      title: 'PaymentService updated with Redis idempotency cache',
      description: 'Added Redis caching fallback to handle database locks during high traffic.',
      sourceUrl: 'https://github.com/codeorigin/payment-gateway/commit/5a110293',
      timestamp: twoHoursAgo
    }
  ];

  const paySummary: AnalysisSummary = {
    repository: payMetadata,
    totalFiles: 96,
    totalCommits: 24,
    totalPullRequests: 12,
    totalIssues: 15,
    totalDependencies: 8,
    totalEvidenceRecords: 37,
    analyzedAt: twoHoursAgo,
    factCount: 22,
    inferenceCount: 10,
    unknownCount: 5,
    recentCommits: payCommits
  };

  const payGraph = GraphBuilder.buildGraph({
    repository: payMetadata,
    fileTree: payFiles,
    commits: payCommits,
    pullRequests: payPullRequests,
    issues: payIssues,
    dependencies: payDependencies,
    evidenceRecords: payEvidence
  });

  GraphRepository.saveGraph(payMetadata.id, payGraph, ['codeorigin-payment-gateway', 'payment-gateway']);
  const paySnapshot: AnalyzedRepoSnapshot = {
    metadata: payMetadata,
    fileTree: payFiles,
    commits: payCommits,
    pullRequests: payPullRequests,
    issues: payIssues,
    dependencies: payDependencies,
    evidence: payEvidence,
    graph: payGraph,
    summary: paySummary
  };
  repositoryCache.set(payMetadata.id, paySnapshot);
  repositoryCache.set('codeorigin-payment-gateway', paySnapshot);

  // Ingest official EEID pilot repositories into GraphRepository and repositoryCache
  EeidGraphIngestionService.ingestEeidRepositories();
}

/**
 * Helper to register repository snapshots with aliases into repositoryCache
 */
export function registerSnapshot(snapshot: AnalyzedRepoSnapshot, aliases: string[] = []): void {
  repositoryCache.set(snapshot.metadata.id, snapshot);
  for (const alias of aliases) {
    repositoryCache.set(alias, snapshot);
  }
}

export class RepositoryController {
  /**
   * POST /api/v1/repositories/analyze
   * Body: { url: "https://github.com/facebook/react" }
   */
  static async analyzeRepository(req: Request, res: Response): Promise<void> {
    try {
      const { url } = req.body as { url?: string };
      if (!url) {
        res.status(400).json({ error: 'Repository URL is required. Example: https://github.com/owner/repository' });
        return;
      }

      // Step 1: Validate & Normalize URL
      const { owner, repo } = normalizeGitHubUrl(url);

      console.log(`[RepositoryController] Starting ingestion pipeline for ${owner}/${repo}...`);

      // Step 2: Fetch Repository Metadata
      const { metadata, useToken } = await GitHubService.fetchRepositoryMetadata(owner, repo);

      // Step 3: Fetch File Structure
      const fileTree = await GitHubService.fetchFileTree(owner, repo, metadata.defaultBranch, useToken);

      // Step 4: Fetch Commits
      const commits = await GitHubService.fetchCommits(owner, repo, 30, useToken);

      // Step 5: Fetch Pull Requests & Issues
      const [pullRequests, issues] = await Promise.all([
        GitHubService.fetchPullRequests(owner, repo, 20, useToken),
        GitHubService.fetchIssues(owner, repo, 20, useToken)
      ]);

      // Step 6: Extract Real Dependencies from Repository Manifests & Lockfiles
      const dependencyExtraction = await GitHubService.extractDependencies(fileTree, {
        owner,
        repo,
        branch: metadata.defaultBranch,
        useToken
      });
      const dependencies = dependencyExtraction.directDependencies;

      // Step 6.5: Bounded Source Retrieval & Tree-sitter AST Analysis
      const recentCommitPaths = new Set<string>();
      for (const c of commits) {
        for (const f of c.files || []) {
          recentCommitPaths.add(f.path.replace(/\\/g, '/').replace(/^\/+/, ''));
        }
      }

      const ignoredAstDirs = new Set([
        'node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'vendor', 'out'
      ]);

      const supportedCandidates = fileTree
        .filter((item) => {
          if (item.type !== 'file') return false;
          const clean = item.path.replace(/\\/g, '/');
          const lower = clean.toLowerCase();
          if (lower.endsWith('.min.js') || lower.endsWith('.bundle.js')) return false;
          if (clean.split('/').some((seg) => ignoredAstDirs.has(seg))) return false;
          return isSupportedSourceFile(clean);
        })
        .sort((a, b) => {
          const score = (p: string) => {
            const lower = p.toLowerCase();
            let s = 0;
            if (recentCommitPaths.has(p)) s += 100;
            if (/(^|\/)(src|app|lib|server|backend|frontend|packages)\//.test(lower)) s += 30;
            if (/(index|main|app|server|controller|service|route|component)/.test(lower)) s += 20;
            if (!/(\.test\.|\.spec\.|__tests__)/.test(lower)) s += 15;
            s -= p.split('/').length * 3;
            return s;
          };
          return score(b.path) - score(a.path) || a.path.localeCompare(b.path);
        })
        .slice(0, 60);

      const astBlobCache = new Map<
        string,
        { success: boolean; content?: string; size?: number; reason?: string; truncated?: boolean; rateLimited?: boolean }
      >();

      const fetchedAstBatch = await GitHubService.fetchFilesBatch({
        owner,
        repo,
        branch: metadata.defaultBranch,
        useToken,
        items: supportedCandidates,
        concurrency: 5,
        maxBytes: DEFAULT_MAX_AST_FILE_BYTES,
        truncate: false,
        blobCache: astBlobCache
      });

      const sourceContents = new Map<string, string>();
      const astInputs: RepositorySourceInput[] = [];

      for (const candidate of supportedCandidates) {
        const res = fetchedAstBatch.get(candidate.path);
        if (res?.success && typeof res.content === 'string') {
          sourceContents.set(candidate.path, res.content);
          astInputs.push({
            filePath: candidate.path,
            content: res.content,
            sizeBytes: res.size ?? res.content.length
          });
        } else if (res?.reason && res.reason.toLowerCase().includes('size limit')) {
          astInputs.push({
            filePath: candidate.path,
            sizeBytes: res.size ?? candidate.size,
            skippedReason: res.reason
          });
        }
      }

      const astAnalysis = await analyzeRepositoryFiles({
        files: astInputs,
        repoFilePaths: fileTree.filter((f) => f.type === 'file').map((f) => f.path),
        maxFileSizeBytes: DEFAULT_MAX_AST_FILE_BYTES
      });

      // Step 7: Normalize Evidence Records
      const { evidenceRecords, summary } = EvidenceService.normalizeEvidence(
        metadata,
        commits,
        pullRequests,
        issues,
        dependencies
      );

      summary.totalFiles = fileTree.length;
      summary.recentCommits = commits;
      summary.dependencyStats = {
        directCount: summary.totalDependencies,
        transitiveCount: dependencyExtraction.transitiveDependencies.length,
        manifestCount: dependencyExtraction.manifests.length,
        lockfileCount: dependencyExtraction.lockfiles.length,
        ecosystems: Array.from(new Set(dependencies.map((d) => d.ecosystem)))
      };
      summary.astStats = {
        supportedFilesCount: astAnalysis.summary.supportedFiles,
        analyzedFilesCount: astAnalysis.summary.analyzedFiles,
        partiallyAnalyzedFilesCount: astAnalysis.summary.partiallyAnalyzedFiles,
        parseErrorFilesCount: astAnalysis.summary.parseErrorFiles,
        skippedSizeLimitCount: astAnalysis.summary.skippedSizeLimitFiles,
        unsupportedLanguageCount: astAnalysis.summary.unsupportedLanguageFiles,
        totalSymbols: astAnalysis.summary.totalSymbols,
        totalImports: astAnalysis.summary.totalImports,
        resolvedImports: astAnalysis.summary.resolvedInternalImports,
        unresolvedImports: astAnalysis.summary.unresolvedImports,
        confirmedCalls: astAnalysis.summary.resolvedCalls,
        unresolvedCalls: astAnalysis.summary.unresolvedCalls
      };

      // Step 8: Construct Engineering Memory Graph (Phase 2)
      const graph = GraphBuilder.buildGraph({
        repository: metadata,
        fileTree,
        commits,
        pullRequests,
        issues,
        dependencies,
        transitiveDependencies: dependencyExtraction.transitiveDependencies,
        astAnalysis,
        evidenceRecords
      });

      // Clear stale cache entries for the same repository before saving fresh snapshot
      for (const [key, cached] of repositoryCache.entries()) {
        if (
          cached.metadata.id === metadata.id ||
          cached.metadata.name.toLowerCase() === metadata.name.toLowerCase()
        ) {
          repositoryCache.delete(key);
        }
      }

      // Save graph in GraphRepository (cleanly replaces previous graph on re-ingestion)
      GraphRepository.saveGraph(metadata.id, graph, [`${owner}-${repo}`]);

      const snapshot: AnalyzedRepoSnapshot = {
        metadata,
        fileTree,
        commits,
        pullRequests,
        issues,
        dependencies,
        dependencyExtraction,
        astAnalysis,
        sourceContents,
        evidence: evidenceRecords,
        graph,
        summary
      };

      // Store in memory cache
      repositoryCache.set(metadata.id, snapshot);
      // Also cache by owner-repo slug
      repositoryCache.set(`${owner}-${repo}`, snapshot);

      console.log(`[RepositoryController] Ingested ${owner}/${repo}: ${graph.nodes.length} nodes, ${graph.edges.length} edges in Engineering Memory Graph.`);

      res.status(200).json({
        message: 'Repository analysis and Engineering Memory Graph construction complete',
        summary,
        repository: metadata,
        graphSummary: graph.summary,
        dependencyExtraction: {
          directCount: summary.totalDependencies,
          declarationsCount: dependencies.length,
          transitiveCount: dependencyExtraction.transitiveDependencies.length,
          manifests: dependencyExtraction.manifests,
          lockfiles: dependencyExtraction.lockfiles,
          warnings: dependencyExtraction.warnings
        },
        astSummary: astAnalysis.summary,
        stats: {
          filesCount: fileTree.length,
          commitsCount: commits.length,
          pullRequestsCount: pullRequests.length,
          issuesCount: issues.length,
          dependenciesCount: summary.totalDependencies,
          transitiveDependenciesCount: dependencyExtraction.transitiveDependencies.length,
          astAnalyzedFilesCount: astAnalysis.summary.analyzedFiles,
          astSymbolsCount: astAnalysis.summary.totalSymbols,
          evidenceCount: evidenceRecords.length,
          graphNodesCount: graph.nodes.length,
          graphEdgesCount: graph.edges.length,
          factCount: graph.summary.factCount,
          inferenceCount: graph.summary.inferenceCount,
          unknownCount: graph.summary.unknownCount
        }
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze GitHub repository';
      console.error(`[RepositoryController] Analysis error:`, errorMessage);

      // Graceful fallback for default seeded repositories if live API fetch fails
      try {
        const { url } = req.body as { url?: string };
        if (url) {
          const { owner, repo } = normalizeGitHubUrl(url);
          const slug = `${owner}/${repo}`.toLowerCase();
          const defaultSlugs = ['facebook/react', 'codeorigin/engineering-core', 'codeorigin/payment-gateway'];

          if (defaultSlugs.includes(slug)) {
            console.log(`[RepositoryController] Ingestion API failed. Re-seeding and falling back to cached snapshot for ${owner}/${repo}...`);
            ensureSeededRepositories();

            let cachedKey = 'repo-facebook-react';
            if (slug.includes('engineering-core')) cachedKey = 'repo-codeorigin-core';
            if (slug.includes('payment-gateway')) cachedKey = 'repo-payment-gateway';

            const snapshot = repositoryCache.get(cachedKey);
            if (snapshot) {
              GraphRepository.saveGraph(snapshot.metadata.id, snapshot.graph, [`${owner}-${repo}`]);

              res.status(200).json({
                message: 'Repository analysis complete (Pre-seeded fallback loaded)',
                summary: snapshot.summary,
                repository: snapshot.metadata,
                graphSummary: snapshot.graph.summary,
                stats: {
                  filesCount: snapshot.fileTree.length,
                  commitsCount: snapshot.commits.length,
                  pullRequestsCount: snapshot.pullRequests.length,
                  issuesCount: snapshot.issues.length,
                  dependenciesCount: snapshot.dependencies.length,
                  evidenceCount: snapshot.evidence.length,
                  graphNodesCount: snapshot.graph.nodes.length,
                  graphEdgesCount: snapshot.graph.edges.length,
                  factCount: snapshot.graph.summary.factCount,
                  inferenceCount: snapshot.graph.summary.inferenceCount,
                  unknownCount: snapshot.graph.summary.unknownCount
                }
              });
              return;
            }
          }
        }
      } catch (fallbackErr) {
        console.error(`[RepositoryController] Pre-seeded fallback failed:`, fallbackErr);
      }

      let statusCode = 400;
      if (errorMessage.includes('401') || errorMessage.includes('invalid or expired')) {
        statusCode = 401;
      } else if (errorMessage.includes('404') || errorMessage.includes('could not find')) {
        statusCode = 404;
      } else if (errorMessage.includes('rate limit')) {
        statusCode = 429;
      }

      res.status(statusCode).json({ error: errorMessage });
    }
  }

  /**
   * Helper to retrieve cached repository snapshot by ID or slug
   * Enforces exact matching precedence before fallback matching to eliminate cross-repo confusion.
   */
  static getSnapshot(repositoryId: string): AnalyzedRepoSnapshot | undefined {
    ensureSeededRepositories();
    if (!repositoryId) return undefined;
    if (repositoryCache.has(repositoryId)) return repositoryCache.get(repositoryId);
    const decoded = decodeURIComponent(repositoryId);
    if (repositoryCache.has(decoded)) return repositoryCache.get(decoded);

    const cleanId = decoded.replace(/^repo-/, '').toLowerCase();
    const slugVariants = [
      cleanId,
      `repo-${cleanId}`,
      cleanId.replace(/\//g, '-'),
      cleanId.replace(/-/g, '/')
    ];

    // Pass 1: Exact key, metadata.id, or metadata.name matching
    for (const [key, snap] of repositoryCache.entries()) {
      const kLow = key.toLowerCase();
      const idLow = snap.metadata.id.toLowerCase();
      const nameLow = snap.metadata.name.toLowerCase();
      for (const variant of slugVariants) {
        if (kLow === variant || idLow === variant || nameLow === variant) {
          return snap;
        }
      }
    }

    // Pass 2: Boundary-aware suffix/prefix match
    for (const [key, snap] of repositoryCache.entries()) {
      const kLow = key.toLowerCase();
      const idLow = snap.metadata.id.toLowerCase();
      if (
        kLow.endsWith('/' + cleanId) ||
        kLow.endsWith('-' + cleanId) ||
        idLow.endsWith('/' + cleanId) ||
        idLow.endsWith('-' + cleanId)
      ) {
        return snap;
      }
    }
    return undefined;
  }

  /**
   * GET /api/v1/repositories
   */
  static getRepositories(_req: Request, res: Response): void {
    ensureSeededRepositories();
    const list: AnalysisSummary[] = [];
    const seen = new Set<string>();

    repositoryCache.forEach((snapshot) => {
      if (!seen.has(snapshot.metadata.id)) {
        seen.add(snapshot.metadata.id);
        list.push(snapshot.summary);
      }
    });

    res.json({ repositories: list });
  }

  /**
   * GET /api/v1/repositories/:id
   */
  static getRepositoryById(req: Request, res: Response): void {
    ensureSeededRepositories();
    const { id } = req.params;
    const snapshot = repositoryCache.get(id);

    if (!snapshot) {
      res.status(404).json({ error: `Repository "${id}" not found. Please analyze it first.` });
      return;
    }

    res.json({
      summary: snapshot.summary,
      repository: snapshot.metadata
    });
  }

  /**
   * GET /api/v1/repositories/:id/commits
   */
  static getCommits(req: Request, res: Response): void {
    ensureSeededRepositories();
    const { id } = req.params;
    const snapshot = repositoryCache.get(id);

    if (!snapshot) {
      res.status(404).json({ error: `Repository "${id}" not found.` });
      return;
    }

    res.json({ commits: snapshot.commits });
  }

  /**
   * GET /api/v1/repositories/:id/files
   */
  static getFiles(req: Request, res: Response): void {
    ensureSeededRepositories();
    const { id } = req.params;
    const snapshot = repositoryCache.get(id);

    if (!snapshot) {
      res.status(404).json({ error: `Repository "${id}" not found.` });
      return;
    }

    res.json({ fileTree: snapshot.fileTree });
  }

  /**
   * GET /api/v1/repositories/:id/issues
   */
  static getIssues(req: Request, res: Response): void {
    ensureSeededRepositories();
    const { id } = req.params;
    const snapshot = repositoryCache.get(id);

    if (!snapshot) {
      res.status(404).json({ error: `Repository "${id}" not found.` });
      return;
    }

    res.json({
      issues: snapshot.issues,
      pullRequests: snapshot.pullRequests
    });
  }

  /**
   * GET /api/v1/repositories/:id/evidence
   */
  static getEvidence(req: Request, res: Response): void {
    ensureSeededRepositories();
    const { id } = req.params;
    const snapshot = repositoryCache.get(id);

    if (!snapshot) {
      res.status(404).json({ error: `Repository "${id}" not found.` });
      return;
    }

    res.json({
      summary: snapshot.summary,
      evidence: snapshot.evidence
    });
  }
}
