/**
 * EngiTrace Part 2 (Group A) - Real Dependency Manifest & Lockfile Extraction Tests
 */

import { parseDependenciesFromFiles } from '../src/services/manifestParser';
import { GitHubService } from '../src/services/githubService';
import { EvidenceService } from '../src/services/evidenceService';
import { FileTreeItem, RepositoryMetadata } from '../src/types/evidence';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

async function runTests() {
  console.log('=== Running Part 2 Group A: Dependency Manifest & Lockfile Extraction Tests ===\n');

  // A1: Real package.json extraction across all 4 dependency categories without hardcoded stubs
  console.log('--- A1: Root package.json parsing across all 4 categories ---');
  const rootPkg = JSON.stringify({
    name: '@acme/api',
    dependencies: { fastify: '^4.28.0', zod: '^3.23.0' },
    devDependencies: { vitest: '^2.0.0' },
    peerDependencies: { pino: '^9.0.0' },
    optionalDependencies: { fsevents: '^2.3.3' }
  });

  const a1 = parseDependenciesFromFiles([{ path: 'package.json', content: rootPkg }]);
  assert(a1.directDependencies.length === 5, 'Extracts exact count of declared packages (5)');
  assert(!a1.directDependencies.some((d) => d.name === 'express' || d.name === 'react'), 'No hardcoded stub express/react injected');
  const fastifyDep = a1.directDependencies.find((d) => d.name === 'fastify');
  assert(
    fastifyDep?.declaredVersion === '^4.28.0' &&
      fastifyDep?.category === 'dependencies' &&
      fastifyDep?.workspaceName === '@acme/api' &&
      fastifyDep?.sourceFile === 'package.json' &&
      fastifyDep?.ecosystem === 'npm' &&
      fastifyDep?.isDirect === true &&
      fastifyDep?.resolvedVersion === undefined,
    'Preserves name, declared version range, category, workspaceName, and undefined resolvedVersion when no lockfile exists'
  );
  assert(a1.directDependencies.find((d) => d.name === 'vitest')?.category === 'devDependencies', 'Classifies devDependencies');
  assert(a1.directDependencies.find((d) => d.name === 'pino')?.category === 'peerDependencies', 'Classifies peerDependencies');
  assert(a1.directDependencies.find((d) => d.name === 'fsevents')?.category === 'optionalDependencies', 'Classifies optionalDependencies');

  // A2: Monorepo multi-manifest parsing preserving independent paths & differing version constraints
  console.log('\n--- A2: Monorepo multi-manifest support ---');
  const monoWeb = JSON.stringify({
    name: '@acme/web',
    dependencies: { react: '^19.0.0', axios: '^1.7.0' }
  });
  const monoAdmin = JSON.stringify({
    name: '@acme/admin',
    dependencies: { react: '^18.2.0' },
    devDependencies: { eslint: '^9.0.0' }
  });
  const a2 = parseDependenciesFromFiles([
    { path: 'packages/web/package.json', content: monoWeb },
    { path: 'packages/admin/package.json', content: monoAdmin }
  ]);
  const reactWeb = a2.directDependencies.find((d) => d.name === 'react' && d.sourceFile === 'packages/web/package.json');
  const reactAdmin = a2.directDependencies.find((d) => d.name === 'react' && d.sourceFile === 'packages/admin/package.json');
  assert(reactWeb?.version === '^19.0.0' && reactWeb?.workspaceName === '@acme/web', 'Preserves web workspace react@^19.0.0');
  assert(reactAdmin?.version === '^18.2.0' && reactAdmin?.workspaceName === '@acme/admin', 'Preserves admin workspace react@^18.2.0 without overwriting');

  // A3: Malformed manifest handling safely isolated from sibling valid manifests
  console.log('\n--- A3: Malformed manifest resilience ---');
  const a3 = parseDependenciesFromFiles([
    { path: 'packages/broken/package.json', content: '{ bad json: ' },
    { path: 'packages/ok/package.json', content: JSON.stringify({ dependencies: { chalk: '^5.3.0' } }) }
  ]);
  assert(a3.manifests.find((m) => m.manifestPath === 'packages/broken/package.json')?.status === 'MALFORMED', 'Reports MALFORMED status for invalid JSON');
  assert(a3.directDependencies.length === 1 && a3.directDependencies[0].name === 'chalk', 'Sibling valid manifest still parsed cleanly');

  // A4: Repository with no manifests yields empty dependencies (zero core-runtime stub)
  console.log('\n--- A4: Empty / manifest-free repo honest empty state ---');
  const noManifestTree: FileTreeItem[] = [
    { path: 'README.md', type: 'file' },
    { path: 'src/index.ts', type: 'file' }
  ];
  const a4 = await GitHubService.extractDependencies(noManifestTree);
  assert(a4.directDependencies.length === 0 && a4.transitiveDependencies.length === 0, 'Returns zero dependencies (no core-runtime stub) when no manifests present');

  // A5: Lockfile handling (package-lock.json, pnpm-lock.yaml, yarn.lock) separates direct vs transitive cleanly
  console.log('\n--- A5: Lockfile direct vs transitive separation & version resolution ---');
  const pkgLock = JSON.stringify({
    name: 'demo-app',
    lockfileVersion: 3,
    packages: {
      '': { name: 'demo-app', dependencies: { axios: '^1.7.0' } },
      'node_modules/axios': { version: '1.7.4' },
      'node_modules/follow-redirects': { version: '1.15.6' },
      'node_modules/proxy-from-env': { version: '1.1.0' }
    }
  });
  const a5NpmLock = parseDependenciesFromFiles(
    [{ path: 'package.json', content: JSON.stringify({ name: 'demo-app', dependencies: { axios: '^1.7.0' } }) }],
    [{ path: 'package-lock.json', content: pkgLock }]
  );
  const directAxios = a5NpmLock.directDependencies.find((d) => d.name === 'axios');
  assert(directAxios?.declaredVersion === '^1.7.0' && directAxios?.resolvedVersion === '1.7.4', 'Preserves declared ^1.7.0 AND records locked 1.7.4 from package-lock.json');
  assert(a5NpmLock.directDependencies.length === 1, 'Direct count remains 1 (not inflated by transitive packages)');
  assert(
    a5NpmLock.transitiveDependencies.length === 2 &&
      a5NpmLock.transitiveDependencies.some((t) => t.name === 'follow-redirects' && t.resolvedVersion === '1.15.6'),
    'Separates transitive dependencies cleanly into transitiveDependencies'
  );

  // pnpm-lock.yaml & yarn.lock test
  const pnpmYaml = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      zod:
        specifier: ^3.23.0
        version: 3.23.8
packages:
  zod@3.23.8: {}
  undici@6.19.2: {}
`;
  const a5Pnpm = parseDependenciesFromFiles(
    [{ path: 'package.json', content: JSON.stringify({ dependencies: { zod: '^3.23.0' } }) }],
    [{ path: 'pnpm-lock.yaml', content: pnpmYaml }]
  );
  assert(a5Pnpm.directDependencies[0]?.resolvedVersion === '3.23.8', 'Resolves locked version from pnpm-lock.yaml');
  assert(a5Pnpm.transitiveDependencies.length === 1 && a5Pnpm.transitiveDependencies[0].name === 'undici', 'Separates transitive packages in pnpm-lock.yaml');

  const yarnLock = `# yarn lockfile v1
"lodash@^4.17.21":
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"

"ms@^2.1.2":
  version "2.1.3"
`;
  const a5Yarn = parseDependenciesFromFiles(
    [{ path: 'package.json', content: JSON.stringify({ dependencies: { lodash: '^4.17.21' } }) }],
    [{ path: 'yarn.lock', content: yarnLock }]
  );
  assert(a5Yarn.directDependencies[0]?.resolvedVersion === '4.17.21', 'Resolves locked version from yarn.lock v1');
  assert(a5Yarn.transitiveDependencies.some((t) => t.name === 'ms' && t.resolvedVersion === '2.1.3'), 'Extracts transitive packages from yarn.lock');

  // A6: Additional Ecosystems (Python requirements.txt & pyproject.toml, Go go.mod, Rust Cargo.toml, Java pom.xml)
  console.log('\n--- A6: Additional Ecosystem Parsers (Python, Go, Rust, Maven) ---');
  const reqTxt = `
# Core framework
fastapi[all]==0.115.0 ; python_version >= "3.10"
pydantic>=2.7.0,<3.0
-r base.txt
`;
  const pyproject = `
[project]
name = "ml-worker"
dependencies = ["httpx>=0.27.0", "numpy==2.1.0"]

[project.optional-dependencies]
dev = ["pytest>=8.3.0"]
`;
  const goMod = `
module github.com/acme/gateway

go 1.22

require (
\tgithub.com/gin-gonic/gin v1.10.0
\tgolang.org/x/sys v0.21.0 // indirect
)
`;
  const cargoToml = `
[package]
name = "edge-proxy"

[dependencies]
tokio = { version = "1.40.0", features = ["full"] }
serde = "1.0.210"

[dev-dependencies]
criterion = "0.5"
`;
  const pomXml = `
<project>
  <groupId>com.acme</groupId>
  <artifactId>ledger-service</artifactId>
  <properties>
    <jackson.version>2.17.2</jackson.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
      <version>\${jackson.version}</version>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.11.0</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
`;
  const a6 = parseDependenciesFromFiles([
    { path: 'services/api/requirements.txt', content: reqTxt },
    { path: 'services/worker/pyproject.toml', content: pyproject },
    { path: 'services/gw/go.mod', content: goMod },
    { path: 'crates/proxy/Cargo.toml', content: cargoToml },
    { path: 'java/ledger/pom.xml', content: pomXml }
  ]);
  assert(a6.directDependencies.some((d) => d.ecosystem === 'pip' && d.name === 'fastapi' && d.version === '==0.115.0'), 'Parses Python requirements.txt accurately');
  assert(a6.directDependencies.some((d) => d.ecosystem === 'pip' && d.name === 'httpx' && d.workspaceName === 'ml-worker'), 'Parses Python pyproject.toml [project].dependencies');
  assert(a6.directDependencies.some((d) => d.ecosystem === 'pip' && d.name === 'pytest' && d.category === 'devDependencies'), 'Parses Python pyproject.toml optional dev dependencies');
  assert(a6.directDependencies.some((d) => d.ecosystem === 'go' && d.name === 'github.com/gin-gonic/gin' && d.version === 'v1.10.0'), 'Parses direct Go module dependency from go.mod');
  assert(
    !a6.directDependencies.some((d) => d.name === 'golang.org/x/sys') &&
      a6.transitiveDependencies.some((t) => t.name === 'golang.org/x/sys'),
    'Separates Go // indirect dependencies from direct dependencies'
  );
  assert(a6.directDependencies.some((d) => d.ecosystem === 'cargo' && d.name === 'tokio' && d.version === '1.40.0'), 'Parses Cargo.toml inline table dependencies');
  assert(a6.directDependencies.some((d) => d.ecosystem === 'cargo' && d.name === 'criterion' && d.category === 'devDependencies'), 'Parses Cargo.toml dev-dependencies');
  assert(a6.directDependencies.some((d) => d.ecosystem === 'maven' && d.name === 'com.fasterxml.jackson.core:jackson-databind' && d.version === '2.17.2'), 'Parses Maven pom.xml and resolves local property');
  assert(a6.directDependencies.some((d) => d.ecosystem === 'maven' && d.name === 'org.junit.jupiter:junit-jupiter' && d.category === 'devDependencies'), 'Classifies Maven test scope as devDependencies');

  // A7: GitHubService.extractDependencies with mocked GitHub raw fetch
  console.log('\n--- A7: GitHubService.extractDependencies async GitHub fetch mock ---');
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('package.json')) {
        return new Response(JSON.stringify({ name: 'fetched-app', dependencies: { fastify: '^5.0.0' } }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const fetchedRes = await GitHubService.extractDependencies(
      [{ path: 'package.json', type: 'file', size: 80, sha: 'blob123' }],
      { owner: 'acme', repo: 'web', branch: 'main', useToken: false }
    );
    assert(fetchedRes.directDependencies.length === 1 && fetchedRes.directDependencies[0].name === 'fastify', 'GitHubService.extractDependencies fetches and parses live package.json cleanly');
  } finally {
    globalThis.fetch = origFetch;
  }

  // A8: EvidenceService unique monorepo dependency evidence IDs
  console.log('\n--- A8: EvidenceService unique IDs across monorepo declarations ---');
  const dummyRepo: RepositoryMetadata = {
    id: 'repo-mono',
    url: 'https://github.com/acme/mono',
    owner: 'acme',
    repo: 'mono',
    name: 'acme/mono',
    description: 'Monorepo',
    defaultBranch: 'main',
    language: 'TypeScript',
    stars: 1,
    forks: 0,
    openIssuesCount: 0,
    isPrivate: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z'
  };
  const evOut = EvidenceService.normalizeEvidence(dummyRepo, [], [], [], a2.directDependencies);
  const depEvIds = evOut.evidenceRecords.map((e) => e.id);
  assert(new Set(depEvIds).size === depEvIds.length, 'Monorepo EvidenceService produces distinct non-colliding evidence IDs');
  assert(evOut.summary.totalDependencies === 3, 'summary.totalDependencies counts 3 distinct direct packages (react, axios, eslint)');

  console.log('\n✅ ALL PART 2 GROUP A DEPENDENCY EXTRACTION TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('Group A test failure:', err);
  process.exit(1);
});

