/**
 * EngiTrace Part 1 - AI Correctness, Evidence Validation & Hallucination Defense Tests
 */

import { GraphBuilder, RawIngestionData, EngineeringMemoryGraph } from '../../graph-engine/src';
import { GraphRepository } from '../src/services/graphRepository';
import { ChatController } from '../src/controllers/chatController';
import { WhyExplorerService } from '../src/services/whyExplorerService';
import { ImpactAnalysisService } from '../src/services/impactAnalysisService';
import { EvidenceContextBuilder } from '../../ai-engine/services/evidenceContextBuilder';
import { StructuredOutputValidator } from '../../ai-engine/validators/structuredOutputValidator';
import { ProviderService } from '../../ai-engine/services/providerService';
import { GitHubService } from '../src/services/githubService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

function createMockRes() {
  const state: { status: number; json: any } = { status: 200, json: null };
  const res: any = {
    status: (code: number) => {
      state.status = code;
      return res;
    },
    json: (data: any) => {
      state.json = data;
    }
  };
  return { res, state };
}

async function runChatWithMock(
  repositoryId: string,
  body: Record<string, any>,
  mockResponse: any
): Promise<{ status: number; json: any }> {
  const originalQueryGeminiChat = ProviderService.queryGeminiChat;
  const originalFetchFileContent = GitHubService.fetchFileContent;

  ProviderService.queryGeminiChat = async () => mockResponse;
  GitHubService.fetchFileContent = async () => ({
    success: false,
    reason: 'Mocked offline file retrieval'
  });

  try {
    const req: any = { params: { id: repositoryId }, body };
    const { res, state } = createMockRes();
    await ChatController.handleChat(req, res);
    return state;
  } finally {
    ProviderService.queryGeminiChat = originalQueryGeminiChat;
    GitHubService.fetchFileContent = originalFetchFileContent;
  }
}

async function runTests() {
  console.log('=== Running EngiTrace Part 1 Chat Validation & Hallucination Defense Tests ===\n');

  // Setup Repo A
  const repoAIngestion: RawIngestionData = {
    repository: {
      id: 'repo-alpha-validation',
      owner: 'acme',
      repo: 'alpha-service',
      url: 'https://github.com/acme/alpha-service',
      description: 'Alpha Service',
      defaultBranch: 'main',
      language: 'TypeScript',
      stars: 20,
      forks: 3,
      openIssuesCount: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-06-01T00:00:00Z'
    },
    fileTree: [
      { path: 'src/auth.ts', type: 'file' },
      { path: 'src/lonely.ts', type: 'file' }
    ],
    commits: [
      {
        hash: '1111aaaa2222bbbb3333cccc4444dddd5555eeee',
        shortHash: '1111aaa',
        message: 'feat(auth): add token verification resolves #12',
        authorName: 'Alice Chen',
        authorEmail: 'alice@acme.dev',
        date: '2025-05-10T10:00:00Z',
        url: 'https://github.com/acme/alpha-service/commit/1111aaa',
        files: [{ path: 'src/auth.ts', additions: 42, deletions: 0, changes: 42 }]
      }
    ],
    pullRequests: [
      {
        id: 12,
        number: 12,
        title: 'Add JWT Token Verification',
        body: 'Fixes #12 by enforcing signature checks.',
        author: 'Alice Chen',
        state: 'merged',
        createdAt: '2025-05-09T08:00:00Z',
        url: 'https://github.com/acme/alpha-service/pull/12'
      }
    ],
    issues: [
      {
        id: 12,
        number: 12,
        title: 'Require JWT verification',
        body: 'Auth endpoints must validate tokens.',
        author: 'Security Team',
        state: 'closed',
        labels: ['security'],
        createdAt: '2025-05-08T08:00:00Z',
        url: 'https://github.com/acme/alpha-service/issues/12'
      }
    ],
    dependencies: [],
    evidenceRecords: []
  };

  // Setup Repo B (distinct repository for isolation tests)
  const repoBIngestion: RawIngestionData = {
    repository: {
      id: 'repo-beta-validation',
      owner: 'acme',
      repo: 'beta-billing',
      url: 'https://github.com/acme/beta-billing',
      description: 'Beta Billing',
      defaultBranch: 'main',
      language: 'TypeScript',
      stars: 10,
      forks: 1,
      openIssuesCount: 0,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-06-01T00:00:00Z'
    },
    fileTree: [
      { path: 'src/billing.ts', type: 'file' },
      { path: 'src/ledger.ts', type: 'file' },
      { path: 'src/invoice.ts', type: 'file' }
    ],
    commits: [
      {
        hash: '9999ffff8888eeee7777dddd6666cccc5555bbbb',
        shortHash: '9999fff',
        message: 'feat(billing): initialize billing pipeline',
        authorName: 'Bob Patel',
        authorEmail: 'bob@acme.dev',
        date: '2025-05-20T12:00:00Z',
        url: 'https://github.com/acme/beta-billing/commit/9999fff',
        files: [
          { path: 'src/billing.ts', additions: 30, deletions: 0, changes: 30 },
          { path: 'src/ledger.ts', additions: 20, deletions: 0, changes: 20 },
          { path: 'src/invoice.ts', additions: 15, deletions: 0, changes: 15 }
        ]
      }
    ],
    pullRequests: [],
    issues: [],
    dependencies: [],
    evidenceRecords: []
  };

  const graphA = GraphBuilder.buildGraph(repoAIngestion);
  const graphB = GraphBuilder.buildGraph(repoBIngestion);
  GraphRepository.saveGraph('repo-alpha-validation', graphA);
  GraphRepository.saveGraph('repo-beta-validation', graphB);

  const authWhyResult = WhyExplorerService.executeQuery({
    repositoryId: 'repo-alpha-validation',
    nodeId: 'file:repo-alpha-validation:src/auth.ts'
  });
  const authContext = EvidenceContextBuilder.buildContext(authWhyResult);
  const validAuthEvId = authContext.evidence[0].id;
  const infAuthEvId = authContext.evidence.find((e) => e.id !== validAuthEvId)?.id || validAuthEvId;

  // --- TEST 1: Valid FACT claim ---
  console.log('--- TEST 1: Valid FACT claim ---');
  const t1 = await runChatWithMock(
    'repo-alpha-validation',
    {
      nodeId: 'file:repo-alpha-validation:src/auth.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Why does src/auth.ts exist?' }]
    },
    {
      answer: 'src/auth.ts was modified in commit 1111aaa by Alice Chen.',
      claims: [
        {
          text: 'src/auth.ts was modified in commit 1111aaa.',
          classification: 'FACT',
          evidenceIds: [validAuthEvId]
        }
      ],
      suggestedFollowUps: ['What depends on src/auth.ts?'],
      provider: 'GEMINI',
      model: 'gemini-3.6-flash',
      isFallback: false
    }
  );
  assert(t1.status === 200, 'TEST 1: Returns HTTP 200');
  assert(t1.json.claims.length === 1, 'TEST 1: Returns 1 validated claim');
  assert(t1.json.claims[0].classification === 'FACT', 'TEST 1: Valid FACT claim retains FACT classification');
  assert(
    t1.json.claims[0].evidenceIds.length === 1 && t1.json.claims[0].evidenceIds[0] === validAuthEvId,
    'TEST 1: Valid evidence ID is preserved'
  );

  // --- TEST 2: FACT with nonexistent evidence ---
  console.log('\n--- TEST 2: FACT with nonexistent evidence ---');
  const t2 = await runChatWithMock(
    'repo-alpha-validation',
    {
      nodeId: 'file:repo-alpha-validation:src/auth.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Why does src/auth.ts exist?' }]
    },
    {
      answer: 'src/auth.ts uses Redis Cluster.',
      claims: [
        {
          text: 'src/auth.ts uses Redis Cluster for session locking.',
          classification: 'FACT',
          evidenceIds: ['nonexistent-ev-999']
        }
      ],
      suggestedFollowUps: [],
      provider: 'GEMINI',
      model: 'gemini-3.6-flash',
      isFallback: false
    }
  );
  assert(t2.status === 200, 'TEST 2: Returns HTTP 200');
  assert(t2.json.claims[0].classification === 'UNKNOWN', 'TEST 2: FACT citing nonexistent evidence downgraded to UNKNOWN');
  assert(t2.json.claims[0].evidenceIds.length === 0, 'TEST 2: Invalid evidence ID removed and no fake evidence added');

  // --- TEST 3: FACT with no evidence IDs ---
  console.log('\n--- TEST 3: FACT with no evidence IDs ---');
  const t3 = await runChatWithMock(
    'repo-alpha-validation',
    {
      nodeId: 'file:repo-alpha-validation:src/auth.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Why does src/auth.ts exist?' }]
    },
    {
      answer: 'src/auth.ts uses React hooks and Express.',
      claims: [
        {
          text: 'src/auth.ts uses Express middleware.',
          classification: 'FACT',
          evidenceIds: []
        },
        {
          text: 'src/auth.ts connects to DynamoDB.',
          classification: 'FACT'
        }
      ],
      suggestedFollowUps: [],
      provider: 'GEMINI',
      model: 'gemini-3.6-flash',
      isFallback: false
    }
  );
  assert(t3.status === 200, 'TEST 3: Returns HTTP 200');
  assert(t3.json.claims.length === 2, 'TEST 3: Both claims returned');
  assert(t3.json.claims[0].classification === 'UNKNOWN', 'TEST 3: FACT with empty evidenceIds downgraded to UNKNOWN');
  assert(t3.json.claims[1].classification === 'UNKNOWN', 'TEST 3: FACT with missing evidenceIds downgraded to UNKNOWN');

  // --- TEST 4: INFERENCE claim ---
  console.log('\n--- TEST 4: INFERENCE claim ---');
  const t4 = await runChatWithMock(
    'repo-alpha-validation',
    {
      nodeId: 'file:repo-alpha-validation:src/auth.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Why was JWT verification introduced?' }]
    },
    {
      answer: '**Inference:** Security review likely motivated JWT checks.',
      claims: [
        {
          text: 'JWT verification was likely introduced to address security issue #12.',
          classification: 'INFERENCE',
          evidenceIds: [infAuthEvId],
          reasoning: 'Commit 1111aaa references issue #12 opened by Security Team.'
        }
      ],
      suggestedFollowUps: [],
      provider: 'GEMINI',
      model: 'gemini-3.6-flash',
      isFallback: false
    }
  );
  assert(t4.status === 200, 'TEST 4: Returns HTTP 200');
  assert(t4.json.claims[0].classification === 'INFERENCE', 'TEST 4: INFERENCE classification preserved');
  assert(t4.json.claims[0].evidenceIds[0] === infAuthEvId, 'TEST 4: Valid supporting evidence ID preserved');
  assert(
    t4.json.claims[0].reasoning === 'Commit 1111aaa references issue #12 opened by Security Team.',
    'TEST 4: Reasoning text retained in chat response'
  );

  // --- TEST 5: Invalid classification ---
  console.log('\n--- TEST 5: Invalid classification ---');
  const t5 = await runChatWithMock(
    'repo-alpha-validation',
    {
      nodeId: 'file:repo-alpha-validation:src/auth.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Explain src/auth.ts' }]
    },
    {
      answer: 'Explanation text.',
      claims: [
        { text: 'Unsupported classification string', classification: 'VERIFIED_FACT', evidenceIds: [validAuthEvId] },
        { text: 'Missing classification field', evidenceIds: [validAuthEvId] },
        { text: 'Non-string classification field', classification: 123, evidenceIds: [validAuthEvId] },
        { text: 'Lowercase valid fact', classification: ' fact ', evidenceIds: [validAuthEvId] }
      ],
      suggestedFollowUps: [],
      provider: 'GEMINI',
      model: 'gemini-3.6-flash',
      isFallback: false
    }
  );
  assert(t5.status === 200, 'TEST 5: Returns HTTP 200 without crashing on invalid classifications');
  assert(t5.json.claims[0].classification === 'UNKNOWN', 'TEST 5: Unsupported string classification defaults to UNKNOWN, never FACT');
  assert(t5.json.claims[1].classification === 'UNKNOWN', 'TEST 5: Missing classification defaults to UNKNOWN, never FACT');
  assert(t5.json.claims[2].classification === 'UNKNOWN', 'TEST 5: Non-string classification handled safely as UNKNOWN');
  assert(t5.json.claims[3].classification === 'FACT', 'TEST 5: Whitespace/lowercase " fact " with valid evidence normalizes cleanly');

  // --- TEST 6: Cross-repository & Cross-investigation evidence ---
  console.log('\n--- TEST 6: Cross-repository evidence & request isolation ---');
  // 6A: Direct validator test with cross-repo evidence item injected into context
  const contaminatedContext = {
    ...authContext,
    metadata: { ...authContext.metadata, repositoryId: 'repo-alpha-validation' },
    evidence: [
      ...authContext.evidence,
      {
        id: 'ev-beta-only-999',
        repositoryId: 'repo-beta-validation',
        source: 'commit:9999fff',
        target: 'file:repo-beta-validation:src/billing.ts',
        relationshipType: 'MODIFIED',
        classification: 'FACT' as const,
        confidence: 1.0,
        title: 'Foreign Repo Evidence',
        description: 'Belongs to repo-beta',
        sourceUrl: 'https://github.com/acme/beta-billing/commit/9999fff',
        timestamp: '2025-05-20T12:00:00Z'
      }
    ]
  };
  const crossRepoValidation = StructuredOutputValidator.validate(
    {
      summary: 'Test',
      claims: [
        {
          text: 'Claim citing foreign repository evidence.',
          classification: 'FACT',
          evidenceIds: ['ev-beta-only-999']
        }
      ]
    },
    contaminatedContext
  );
  assert(
    crossRepoValidation.claims[0].classification === 'UNKNOWN' && crossRepoValidation.claims[0].evidenceIds.length === 0,
    'TEST 6A: Validator rejects evidence belonging to another repository'
  );

  // 6B: ChatController request for repo-alpha citing repo-beta evidence or unretrieved ev-rec-99
  const lonelyWhy = WhyExplorerService.executeQuery({
    repositoryId: 'repo-alpha-validation',
    nodeId: 'file:repo-alpha-validation:src/lonely.ts'
  });
  // lonely.ts only has CONTAINS edge (ev-rec-1), whereas billing.ts in repo-beta has more edges (ev-rec-2, ev-rec-3, ev-rec-4)
  const betaWhy = WhyExplorerService.executeQuery({
    repositoryId: 'repo-beta-validation',
    nodeId: 'file:repo-beta-validation:src/billing.ts'
  });
  assert(betaWhy.evidence.length > lonelyWhy.evidence.length, 'TEST 6 setup: repo-beta node has more evidence records than repo-alpha lonely.ts');
  const betaOnlyEvId = betaWhy.evidence[betaWhy.evidence.length - 1].id;

  const t6 = await runChatWithMock(
    'repo-alpha-validation',
    {
      nodeId: 'file:repo-alpha-validation:src/lonely.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Why does src/lonely.ts exist?' }]
    },
    {
      answer: 'Claiming cross-repo evidence.',
      claims: [
        {
          text: 'Cross-repo or unretrieved evidence claim.',
          classification: 'FACT',
          evidenceIds: [betaOnlyEvId, 'ev-imp-edge-from-beta']
        }
      ],
      suggestedFollowUps: [],
      provider: 'GEMINI',
      model: 'gemini-3.6-flash',
      isFallback: false
    }
  );
  assert(t6.json.claims[0].classification === 'UNKNOWN', 'TEST 6B: ChatController rejects unretrieved/cross-repo evidence IDs');
  assert(t6.json.claims[0].evidenceIds.length === 0, 'TEST 6B: No foreign evidence IDs retained');

  // --- TEST 7: Mixed valid and invalid evidence + duplicate IDs ---
  console.log('\n--- TEST 7: Mixed valid and invalid evidence + duplicates ---');
  const t7 = await runChatWithMock(
    'repo-alpha-validation',
    {
      nodeId: 'file:repo-alpha-validation:src/auth.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Why does src/auth.ts exist?' }]
    },
    {
      answer: 'src/auth.ts was added in commit 1111aaa.',
      claims: [
        {
          text: 'src/auth.ts was modified in commit 1111aaa.',
          classification: 'FACT',
          evidenceIds: [validAuthEvId, 'bogus-id-1', validAuthEvId, 'bogus-id-2', '   ']
        }
      ],
      suggestedFollowUps: [],
      provider: 'GEMINI',
      model: 'gemini-3.6-flash',
      isFallback: false
    }
  );
  assert(t7.json.claims[0].classification === 'FACT', 'TEST 7: FACT retained when at least one valid evidence ID survives');
  assert(
    t7.json.claims[0].evidenceIds.length === 1 && t7.json.claims[0].evidenceIds[0] === validAuthEvId,
    'TEST 7: Invalid IDs removed and duplicate valid IDs deduplicated'
  );

  // --- TEST 8: Malformed model responses ---
  console.log('\n--- TEST 8: Malformed model response handling ---');
  const fencedJson = ProviderService.parseAndNormalizeChatResponse(
    '```json\n{"answer":"Fenced answer","claims":[{"text":"C1","classification":"FACT","evidenceIds":["ev-1"]}],"suggestedFollowUps":["Q1?"]}\n```',
    'src/auth.ts',
    'gemini-3.6-flash'
  );
  assert(fencedJson !== null && fencedJson.answer === 'Fenced answer' && fencedJson.claims.length === 1, 'TEST 8A: Parses JSON inside markdown code fences');

  const proseWithGraphBlock = ProviderService.parseAndNormalizeChatResponse(
    'Here is the relationship:\n```graph\nA ├── [CONTAINS] ──→ B\n```\nEnd of answer.',
    'src/auth.ts',
    'gemini-3.6-flash'
  );
  assert(
    proseWithGraphBlock !== null &&
      proseWithGraphBlock.answer.includes('Here is the relationship:') &&
      proseWithGraphBlock.answer.includes('End of answer.') &&
      proseWithGraphBlock.claims.length === 0,
    'TEST 8B: Non-JSON prose with ```graph block preserves full prose without fabricating claims'
  );

  assert(
    ProviderService.parseAndNormalizeChatResponse('{"claims": []}', 'src/auth.ts') === null,
    'TEST 8C: JSON missing answer field is rejected safely'
  );
  assert(
    ProviderService.parseAndNormalizeChatResponse('{"answer": 42}', 'src/auth.ts') === null,
    'TEST 8D: JSON with non-string answer is rejected safely'
  );
  assert(
    ProviderService.parseAndNormalizeChatResponse('{"answer": "truncated', 'src/auth.ts') === null,
    'TEST 8E: Truncated broken JSON is rejected safely'
  );
  assert(
    ProviderService.parseAndNormalizeChatResponse('   ', 'src/auth.ts') === null,
    'TEST 8F: Empty whitespace output is rejected safely'
  );

  // ChatController handling of malformed provider output
  const t8MalformedFields = await runChatWithMock(
    'repo-alpha-validation',
    {
      nodeId: 'file:repo-alpha-validation:src/auth.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Why does src/auth.ts exist?' }]
    },
    {
      answer: 'Valid answer string.',
      claims: 'not-an-array',
      suggestedFollowUps: { bad: true },
      provider: 'GEMINI',
      model: 'gemini-3.6-flash',
      isFallback: false
    }
  );
  assert(
    t8MalformedFields.status === 200 &&
      Array.isArray(t8MalformedFields.json.claims) &&
      t8MalformedFields.json.claims.length === 0 &&
      Array.isArray(t8MalformedFields.json.suggestedFollowUps) &&
      t8MalformedFields.json.suggestedFollowUps.length === 0,
    'TEST 8G: ChatController safely normalizes non-array claims and suggestedFollowUps'
  );

  const t8MissingAnswer = await runChatWithMock(
    'repo-alpha-validation',
    {
      nodeId: 'file:repo-alpha-validation:src/auth.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Why does src/auth.ts exist?' }]
    },
    {
      claims: [{ text: 'Orphan claim', classification: 'FACT', evidenceIds: [] }]
    }
  );
  assert(
    t8MissingAnswer.status === 200 &&
      t8MissingAnswer.json.isFallback === true &&
      t8MissingAnswer.json.provider === 'LOCAL_FALLBACK' &&
      !t8MissingAnswer.json.claims.some((c: any) => c.classification === 'FACT' && c.evidenceIds.length === 0),
    'TEST 8H: Missing answer triggers local fallback safely with no unsupported FACT claims'
  );

  // --- TEST 9: Local fallback on HTTP 503 ---
  console.log('\n--- TEST 9: Local fallback when Gemini returns HTTP 503 ---');
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalFetchFile = GitHubService.fetchFileContent;
  process.env.GEMINI_API_KEY = 'test-fake-key-for-mock-503';
  globalThis.fetch = (async () => ({
    ok: false,
    status: 503,
    headers: { get: () => null },
    text: async () => 'Service Unavailable'
  })) as any;
  GitHubService.fetchFileContent = async () => ({
    success: true,
    content: 'export function verifyToken() { return true; }',
    size: 44,
    reason: 'RETRIEVED_SUCCESSFULLY'
  });

  try {
    const reqFallback: any = {
      params: { id: 'repo-alpha-validation' },
      body: {
        nodeId: 'file:repo-alpha-validation:src/auth.ts',
        analysisType: 'WHY',
        messages: [{ role: 'user', content: 'Explain src/auth.ts' }]
      }
    };
    const { res: resFallback, state: fallbackState } = createMockRes();
    await ChatController.handleChat(reqFallback, resFallback);

    assert(fallbackState.status === 200, 'TEST 9: HTTP 503 returns 200 via local fallback');
    assert(fallbackState.json.isFallback === true, 'TEST 9: Preserves isFallback: true');
    assert(fallbackState.json.provider === 'LOCAL_FALLBACK', 'TEST 9: Preserves provider: LOCAL_FALLBACK');
    assert(typeof fallbackState.json.answer === 'string' && fallbackState.json.answer.includes('HTTP 503'), 'TEST 9: Includes fallback notice');
    assert(
      fallbackState.json.claims.every((c: any) => c.classification !== 'FACT' || (Array.isArray(c.evidenceIds) && c.evidenceIds.length > 0)),
      'TEST 9: Local fallback emits zero unsupported FACT claims'
    );
    assert(
      fallbackState.json.claims.some((c: any) => c.classification === 'FACT' && c.evidenceIds.length > 0),
      'TEST 9: Local fallback cites real graph evidence ID on verified FACT claim'
    );
  } finally {
    globalThis.fetch = originalFetch;
    GitHubService.fetchFileContent = originalFetchFile;
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  }

  // --- TEST 10: Regression - Deterministic WHAT_IF preservation + validation ---
  console.log('\n--- TEST 10: WHAT_IF deterministic impact + evidence validation ---');
  const now = new Date().toISOString();
  const impactGraph: EngineeringMemoryGraph = {
    repositoryId: 'repo-whatif-regression',
    nodes: [
      { id: 'file:repo-whatif-regression:src/core.ts', type: 'FILE', label: 'core.ts', metadata: { path: 'src/core.ts' }, sourceReference: '', createdAt: now, updatedAt: now },
      { id: 'file:repo-whatif-regression:src/api.ts', type: 'FILE', label: 'api.ts', metadata: { path: 'src/api.ts' }, sourceReference: '', createdAt: now, updatedAt: now }
    ],
    edges: [
      {
        id: 'edge-api-core',
        source: 'file:repo-whatif-regression:src/api.ts',
        target: 'file:repo-whatif-regression:src/core.ts',
        relationshipType: 'DEPENDS_ON',
        evidence: 'api.ts imports core.ts',
        confidence: 1.0,
        sourceUrl: 'https://github.com/acme/test/blob/main/src/api.ts',
        timestamp: now,
        classification: 'FACT'
      }
    ],
    summary: {
      repositoryId: 'repo-whatif-regression',
      totalNodes: 2,
      totalEdges: 1,
      nodesByType: { REPOSITORY: 0, FILE: 2, FUNCTION: 0, COMPONENT: 0, COMMIT: 0, PULL_REQUEST: 0, ISSUE: 0, DECISION: 0, INCIDENT: 0, DEPENDENCY: 0, OUTCOME: 0, AUTHOR: 0 },
      edgesByType: { DEPENDS_ON: 1 },
      factCount: 1,
      inferenceCount: 0,
      unknownCount: 0,
      topConnectedNodes: [],
      builtAt: now
    }
  };
  GraphRepository.saveGraph('repo-whatif-regression', impactGraph);

  const deterministicBefore = ImpactAnalysisService.analyzeImpact({
    repositoryId: 'repo-whatif-regression',
    nodeId: 'file:repo-whatif-regression:src/core.ts',
    operation: 'REMOVE',
    maxDepth: 3
  });
  const validImpEvId = deterministicBefore.evidence[0].id;

  const t10 = await runChatWithMock(
    'repo-whatif-regression',
    {
      nodeId: 'file:repo-whatif-regression:src/core.ts',
      analysisType: 'WHAT_IF',
      messages: [{ role: 'user', content: 'What happens if I remove core.ts?' }]
    },
    {
      answer: 'Removing core.ts directly impacts api.ts.',
      claims: [
        { text: 'api.ts directly depends on core.ts.', classification: 'FACT', evidenceIds: [validImpEvId] },
        { text: 'billing-worker.ts will crash.', classification: 'FACT', evidenceIds: ['fake-imp-999'] }
      ],
      suggestedFollowUps: ['What mitigation is needed?'],
      provider: 'GEMINI',
      model: 'gemini-3.6-flash',
      isFallback: false
    }
  );

  const deterministicAfter = ImpactAnalysisService.analyzeImpact({
    repositoryId: 'repo-whatif-regression',
    nodeId: 'file:repo-whatif-regression:src/core.ts',
    operation: 'REMOVE',
    maxDepth: 3
  });

  assert(t10.status === 200, 'TEST 10: WHAT_IF chat returns HTTP 200');
  assert(t10.json.claims[0].classification === 'FACT' && t10.json.claims[0].evidenceIds[0] === validImpEvId, 'TEST 10: Valid WHAT_IF evidence ID preserved');
  assert(t10.json.claims[1].classification === 'UNKNOWN' && t10.json.claims[1].evidenceIds.length === 0, 'TEST 10: Hallucinated WHAT_IF breakage downgraded to UNKNOWN');
  assert(
    deterministicBefore.impactScore === deterministicAfter.impactScore &&
      deterministicBefore.impactLevel === deterministicAfter.impactLevel &&
      deterministicBefore.directImpact.length === deterministicAfter.directImpact.length,
    'TEST 10: Deterministic WHAT_IF scoring and traversal remain untouched'
  );

  // --- TEST 11: End-to-end HTTP 200 mocked-fetch through ProviderService.queryGeminiChat + StructuredOutputValidator ---
  console.log('\n--- TEST 11: End-to-end HTTP 200 mocked-fetch fenced JSON -> ChatController + Validator ---');
  const origFetch11 = globalThis.fetch;
  const origKey11 = process.env.GEMINI_API_KEY;
  const origFile11 = GitHubService.fetchFileContent;

  const fencedGeminiBody = [
    '```json',
    JSON.stringify({
      answer: 'src/auth.ts implements token verification and was touched in commit 1111aaa.',
      claims: [
        {
          text: 'src/auth.ts was updated in commit 1111aaa.',
          classification: 'FACT',
          evidenceIds: [validAuthEvId]
        },
        {
          text: 'src/auth.ts connects directly to Stripe Billing.',
          classification: 'FACT',
          evidenceIds: ['ev-hallucinated-e2e']
        },
        {
          text: 'Token verification was added to gate authenticated routes.',
          classification: 'INFERENCE',
          reasoning: 'Inferred from commit 1111aaa message referencing token verification and issue #12.',
          evidenceIds: [infAuthEvId]
        }
      ],
      suggestedFollowUps: ['Which routes depend on src/auth.ts?']
    }),
    '```'
  ].join('\n');

  process.env.GEMINI_API_KEY = 'test-fake-key-for-mock-200';
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: fencedGeminiBody }]
          }
        }
      ]
    }),
    text: async () =>
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: fencedGeminiBody }] } }]
      })
  })) as any;
  GitHubService.fetchFileContent = async () => ({
    success: false,
    reason: 'Mocked offline file retrieval'
  });

  try {
    const reqE2e: any = {
      params: { id: 'repo-alpha-validation' },
      body: {
        nodeId: 'file:repo-alpha-validation:src/auth.ts',
        analysisType: 'WHY',
        messages: [{ role: 'user', content: 'Explain src/auth.ts end to end' }]
      }
    };
    const { res: resE2e, state: e2eState } = createMockRes();
    await ChatController.handleChat(reqE2e, resE2e);

    assert(e2eState.status === 200, 'TEST 11: End-to-end HTTP 200 fetch flow returns 200');
    assert(e2eState.json.provider === 'GEMINI' && e2eState.json.isFallback === false, 'TEST 11: Reports GEMINI provider and isFallback: false');
    assert(e2eState.json.claims.length === 3, 'TEST 11: Preserves all 3 structured claims');
    assert(
      e2eState.json.claims[0].classification === 'FACT' &&
        e2eState.json.claims[0].evidenceIds.length === 1 &&
        e2eState.json.claims[0].evidenceIds[0] === validAuthEvId,
      'TEST 11: Valid FACT claim with retrieved evidence ID survives validator'
    );
    assert(
      e2eState.json.claims[1].classification === 'UNKNOWN' &&
        Array.isArray(e2eState.json.claims[1].evidenceIds) &&
        e2eState.json.claims[1].evidenceIds.length === 0,
      'TEST 11: Unsupported FACT claim from fenced Gemini response downgraded to UNKNOWN'
    );
    assert(
      e2eState.json.claims[2].classification === 'INFERENCE' &&
        typeof e2eState.json.claims[2].reasoning === 'string' &&
        e2eState.json.claims[2].reasoning.includes('issue #12') &&
        e2eState.json.claims[2].evidenceIds.includes(infAuthEvId),
      'TEST 11: INFERENCE claim retains classification, reasoning, and verified evidence'
    );
    assert(
      Array.isArray(e2eState.json.suggestedFollowUps) && e2eState.json.suggestedFollowUps[0] === 'Which routes depend on src/auth.ts?',
      'TEST 11: Preserves suggestedFollowUps contract'
    );
  } finally {
    globalThis.fetch = origFetch11;
    GitHubService.fetchFileContent = origFile11;
    if (origKey11 === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = origKey11;
    }
  }

  console.log('\n=====================================================================');
  console.log('🎉 ALL PART 1 CHAT VALIDATION & HALLUCINATION DEFENSE TESTS PASSED!');
  console.log('=====================================================================\n');
}

runTests().catch((err) => {
  console.error('❌ PART 1 TEST SUITE FAILED:', err);
  process.exit(1);
});
