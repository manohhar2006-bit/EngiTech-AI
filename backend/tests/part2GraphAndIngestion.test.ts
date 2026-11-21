/**
 * EngiTrace Part 2 (Group C) - Graph Integration, AST Edges & Re-Ingestion Tests
 */

import { analyzeRepositoryFiles } from '../../analyzer/src/index';
import { GraphBuilder, GraphValidator, StandardRelationship } from '../../graph-engine/src';
import { parseDependenciesFromFiles } from '../src/services/manifestParser';
import { GraphRepository } from '../src/services/graphRepository';
import { ImpactAnalysisService } from '../src/services/impactAnalysisService';
import { WhyExplorerService } from '../src/services/whyExplorerService';
import { RepositoryController } from '../src/controllers/repositoryController';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

function createMockRes() {
  let statusCode = 200;
  let body: any = null;
  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: any) {
      body = payload;
      return res;
    }
  };
  return { res, getStatus: () => statusCode, getBody: () => body };
}

async function runTests() {
  console.log('=== Running Part 2 Group C: Graph Integration & Ingestion Pipeline Tests ===\n');

  // C1: Monorepo dependency deduplication + independent per-manifest DEPENDS_ON edges
  console.log('--- C1: Monorepo graph deduplication & edge preservation ---');
  const parsedMono = parseDependenciesFromFiles([
    {
      path: 'packages/web/package.json',
      content: JSON.stringify({ name: '@mono/web', dependencies: { react: '^19.0.0', axios: '^1.7.0' } })
    },
    {
      path: 'packages/admin/package.json',
      content: JSON.stringify({ name: '@mono/admin', dependencies: { react: '^18.2.0' } })
    }
  ]);

  const astRes = await analyzeRepositoryFiles({
    files: [
      {
        filePath: 'packages/web/src/auth.ts',
        content: `export function verifyJwt(token: string) { return token.length > 5; }\n`
      },
      {
        filePath: 'packages/web/src/api.ts',
        content: `import { verifyJwt } from './auth';\nexport function handleReq(t: string) { return verifyJwt(t); }\n`
      },
      {
        filePath: 'packages/web/src/unrelated.ts',
        content: `export function formatMoney(cents: number) { return cents / 100; }\n`
      }
    ]
  });

  const monoGraph = GraphBuilder.buildGraph({
    repository: {
      id: 'repo-c1-mono',
      owner: 'acme',
      repo: 'monorepo',
      url: 'https://github.com/acme/monorepo',
      description: 'Monorepo test',
      defaultBranch: 'main',
      language: 'TypeScript',
      stars: 10,
      forks: 1,
      openIssuesCount: 0,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z'
    },
    fileTree: [
      { path: 'packages/web/package.json', type: 'file' },
      { path: 'packages/admin/package.json', type: 'file' },
      { path: 'packages/web/src/auth.ts', type: 'file' },
      { path: 'packages/web/src/api.ts', type: 'file' },
      { path: 'packages/web/src/unrelated.ts', type: 'file' }
    ],
    commits: [
      {
        hash: 'a111111111111111',
        shortHash: 'a111111',
        message: 'feat: initial auth and unrelated formatting',
        authorName: 'Dev One',
        authorEmail: 'dev@acme.test',
        date: '2025-01-02T10:00:00Z',
        url: 'https://github.com/acme/monorepo/commit/a1111111',
        files: [
          { path: 'packages/web/src/auth.ts', additions: 5, deletions: 0, changes: 5 },
          { path: 'packages/web/src/unrelated.ts', additions: 5, deletions: 0, changes: 5 }
        ]
      }
    ],
    pullRequests: [],
    issues: [],
    dependencies: parsedMono.directDependencies,
    transitiveDependencies: parsedMono.transitiveDependencies,
    astAnalysis: astRes,
    evidenceRecords: []
  });

  const validation = GraphValidator.validate(monoGraph.nodes, monoGraph.edges);
  assert(validation.isValid, 'Monorepo + AST graph passes GraphValidator cleanly');

  const reactNodes = monoGraph.nodes.filter((n) => n.id === 'dependency:npm:react');
  assert(reactNodes.length === 1, 'Shared dependency react deduplicated into 1 ecosystem-aware DEPENDENCY node (dependency:npm:react)');
  assert(
    Array.isArray(reactNodes[0].metadata.declarations) &&
    (reactNodes[0].metadata.declarations as any[]).length === 2,
    'Preserves both workspace version declarations inside shared DEPENDENCY metadata'
  );

  const reactDepEdges = monoGraph.edges.filter(
    (e) => e.relationshipType === StandardRelationship.DEPENDS_ON && e.target === 'dependency:npm:react'
  );
  assert(reactDepEdges.length === 2, 'Preserves TWO distinct DEPENDS_ON edges (one per monorepo manifest)');

  // C2: AST DECLARES, EXPOSES, IMPORTS, CALLS edges & non-fabrication over co-modified analyzed files
  console.log('\n--- C2: AST graph edges & heuristic gating ---');
  assert(
    monoGraph.edges.some(
      (e) =>
        e.relationshipType === StandardRelationship.IMPORTS &&
        e.source === 'file:repo-c1-mono:packages/web/src/api.ts' &&
        e.target === 'file:repo-c1-mono:packages/web/src/auth.ts'
    ),
    'Creates FACT IMPORTS edge from api.ts -> auth.ts'
  );
  assert(
    monoGraph.edges.some((e) => e.relationshipType === StandardRelationship.DECLARES && e.target.includes('verifyJwt')),
    'Creates FACT DECLARES edge for AST function verifyJwt'
  );
  assert(
    monoGraph.edges.some((e) => e.relationshipType === StandardRelationship.EXPOSES && e.target.includes('verifyJwt')),
    'Creates FACT EXPOSES edge for exported function verifyJwt'
  );
  assert(
    monoGraph.edges.some(
      (e) =>
        e.relationshipType === StandardRelationship.CALLS &&
        e.source.includes('handleReq') &&
        e.target.includes('verifyJwt')
    ),
    'Creates FACT CALLS edge from handleReq -> verifyJwt'
  );
  assert(
    !monoGraph.edges.some(
      (e) =>
        e.id.startsWith('edge-struct-') &&
        ((e.source.includes('auth.ts') && e.target.includes('unrelated.ts')) ||
          (e.source.includes('unrelated.ts') && e.target.includes('auth.ts')))
    ),
    'Does NOT fabricate heuristic co-modification DEPENDS_ON edge between two AST-analyzed unrelated files'
  );

  // C3 & C4: Downstream ImpactAnalysisService & WhyExplorerService traverse AST edges accurately
  console.log('\n--- C3 & C4: WHAT_IF Impact & WHY Explorer on AST graph ---');
  GraphRepository.saveGraph('repo-c1-mono', monoGraph);
  const authImpact = ImpactAnalysisService.analyzeImpact({
    repositoryId: 'repo-c1-mono',
    nodeId: 'file:repo-c1-mono:packages/web/src/auth.ts',
    operation: 'REMOVE',
    maxDepth: 3
  });
  assert(
    authImpact.directImpact.some((n) => n.id.includes('api.ts') || n.id.includes('verifyJwt')) ||
    authImpact.indirectImpact.some((n) => n.id.includes('api.ts') || n.id.includes('handleReq')),
    'ImpactAnalysisService detects downstream api.ts / handleReq when auth.ts is impacted'
  );

  const fnNode = monoGraph.nodes.find((n) => n.type === 'FUNCTION' && n.label === 'verifyJwt')!;
  const whyFn = WhyExplorerService.executeQuery({ repositoryId: 'repo-c1-mono', nodeId: fnNode.id });
  assert(whyFn.target.id === fnNode.id && whyFn.historicalChain.length >= 2, 'WhyExplorerService traces AST FUNCTION node cleanly via DECLARES/FILE/COMMIT');

  // C5: End-to-end RepositoryController.analyzeRepository + clean re-ingestion removing stale packages
  console.log('\n--- C5: RepositoryController live-API-mocked ingestion & clean re-ingestion ---');
  const unrelatedRepoId = 'repo-unrelated-keep';
  GraphRepository.saveGraph(unrelatedRepoId, monoGraph);

  let phase = 1;
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/repos/acme/service-one')) {
        return new Response(
          JSON.stringify({
            id: 999001,
            name: 'service-one',
            full_name: 'acme/service-one',
            html_url: 'https://github.com/acme/service-one',
            description: 'Test repo',
            default_branch: 'main',
            language: 'TypeScript',
            stargazers_count: 5,
            forks_count: 1,
            open_issues_count: 0,
            private: false,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-05T00:00:00Z'
          }),
          { status: 200 }
        );
      }

      if (url.includes('/git/trees/')) {
        return new Response(
          JSON.stringify({
            tree: [
              { path: 'package.json', type: 'blob', size: 120, sha: `sha-pkg-${phase}` },
              { path: 'package-lock.json', type: 'blob', size: 300, sha: `sha-lock-${phase}` },
              { path: 'src/index.ts', type: 'blob', size: 120, sha: `sha-idx-${phase}` },
              { path: 'src/util.ts', type: 'blob', size: 80, sha: `sha-util-${phase}` }
            ]
          }),
          { status: 200 }
        );
      }

      if (url.includes('/commits')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/pulls')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/issues')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      if (url.includes('/contents/package.json')) {
        const deps = phase === 1 ? { lodash: '^4.17.21' } : { fastify: '^5.1.0' };
        return new Response(JSON.stringify({ name: 'service-one', dependencies: deps }), { status: 200 });
      }
      if (url.includes('/contents/package-lock.json')) {
        const pkgLock =
          phase === 1
            ? {
              lockfileVersion: 3,
              packages: {
                '': { dependencies: { lodash: '^4.17.21' } },
                'node_modules/lodash': { version: '4.17.21' },
                'node_modules/transitive-a': { version: '1.0.0' }
              }
            }
            : {
              lockfileVersion: 3,
              packages: {
                '': { dependencies: { fastify: '^5.1.0' } },
                'node_modules/fastify': { version: '5.1.2' },
                'node_modules/avvio': { version: '9.0.0' }
              }
            };
        return new Response(JSON.stringify(pkgLock), { status: 200 });
      }
      if (url.includes('/contents/src/util.ts')) {
        return new Response(`export function cleanId(s: string) { return s.trim(); }\n`, { status: 200 });
      }
      if (url.includes('/contents/src/index.ts')) {
        return new Response(
          `import { cleanId } from './util';\nexport function boot(raw: string) { return cleanId(raw); }\n`,
          { status: 200 }
        );
      }

      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    // Run 1st ingestion (lodash + AST)
    const mock1 = createMockRes();
    await RepositoryController.analyzeRepository({ body: { url: 'acme/service-one' } } as any, mock1.res);
    assert(mock1.getStatus() === 200, '1st ingestion succeeds with HTTP 200');
    const body1 = mock1.getBody();
    assert(body1.dependencyExtraction.directCount === 1 && body1.dependencyExtraction.transitiveCount === 1, '1st ingestion keeps direct=1 separate from transitive=1');
    assert(body1.astSummary.analyzedFiles === 2 && body1.astSummary.resolvedCalls >= 1, '1st ingestion analyzes src/index.ts and src/util.ts with Tree-sitter');

    const g1 = GraphRepository.getGraph(body1.repository.id)!;
    assert(g1 !== undefined && g1.nodes.some((n) => n.id === 'dependency:npm:lodash'), '1st ingestion graph contains dependency:npm:lodash');
    assert(!g1.nodes.some((n) => n.id === 'dependency:npm:express' || n.id === 'dependency:npm:react'), 'No hardcoded stub packages present');

    // Run 2nd ingestion with changed manifest (lodash removed, fastify added)
    phase = 2;
    const mock2 = createMockRes();
    await RepositoryController.analyzeRepository({ body: { url: 'acme/service-one' } } as any, mock2.res);
    assert(mock2.getStatus() === 200, 'Re-ingestion succeeds with HTTP 200');

    const g2 = GraphRepository.getGraph(mock2.getBody().repository.id)!;
    assert(g2 !== undefined && !g2.nodes.some((n) => n.id === 'dependency:npm:lodash'), 'Re-ingestion drops removed lodash dependency cleanly');
    assert(g2.nodes.some((n) => n.id === 'dependency:npm:fastify'), 'Re-ingestion adds updated fastify dependency cleanly');
    assert(GraphRepository.getGraph(unrelatedRepoId) !== undefined, 'Unrelated cached repository graph remains untouched after re-ingestion');
  } finally {
    globalThis.fetch = origFetch;
  }

  // C6: Polyglot ecosystem isolation (npm 'redis' vs pip 'redis' in the same repository)
  console.log('\n--- C6: Polyglot ecosystem-aware dependency ID separation ---');
  const polyDeps = parseDependenciesFromFiles([
    { path: 'frontend/package.json', content: JSON.stringify({ dependencies: { redis: '^4.7.0' } }) },
    { path: 'worker/requirements.txt', content: 'redis>=5.0.0\n' }
  ]);
  const polyGraph = GraphBuilder.buildGraph({
    repository: {
      id: 'repo-c6-poly',
      owner: 'acme',
      repo: 'polyglot',
      url: 'https://github.com/acme/polyglot',
      description: 'Polyglot test',
      defaultBranch: 'main',
      language: 'TypeScript',
      stars: 1,
      forks: 0,
      openIssuesCount: 0,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z'
    },
    fileTree: [
      { path: 'frontend/package.json', type: 'file' },
      { path: 'worker/requirements.txt', type: 'file' }
    ],
    commits: [],
    pullRequests: [],
    issues: [],
    dependencies: polyDeps.directDependencies,
    evidenceRecords: []
  });
  const npmRedis = polyGraph.nodes.find((n) => n.id === 'dependency:npm:redis');
  const pipRedis = polyGraph.nodes.find((n) => n.id === 'dependency:pip:redis');
  assert(
    npmRedis !== undefined &&
    pipRedis !== undefined &&
    npmRedis.sourceReference.includes('npmjs.com/package/redis') &&
    pipRedis.sourceReference.includes('pypi.org/project/redis/'),
    'Separates polyglot same-name packages cleanly into dependency:npm:redis and dependency:pip:redis with distinct ecosystem references'
  );
  assert(
    polyGraph.edges.some((e) => e.source.endsWith('frontend/package.json') && e.target === 'dependency:npm:redis' && e.relationshipType === 'DEPENDS_ON') &&
    polyGraph.edges.some((e) => e.source.endsWith('worker/requirements.txt') && e.target === 'dependency:pip:redis' && e.relationshipType === 'DEPENDS_ON'),
    'Links each manifest to its ecosystem-specific DEPENDENCY node'
  );

  console.log('\n✅ ALL PART 2 GROUP C GRAPH INTEGRATION & INGESTION TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('Group C test failure:', err);
  process.exit(1);
});
