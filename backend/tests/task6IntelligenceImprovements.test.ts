import assert from 'assert';
import { GraphQueryEngine, EngineeringMemoryGraph, GraphNode, GraphEdge } from '../../graph-engine/src';
import { WhyExplorerService } from '../src/services/whyExplorerService';
import { ImpactAnalysisService } from '../src/services/impactAnalysisService';
import { GraphRepository } from '../src/services/graphRepository';
import { RepositoryController, registerSnapshot } from '../src/controllers/repositoryController';
import { StructuredOutputValidator } from '../../ai-engine/validators/structuredOutputValidator';
import { ProviderService } from '../../ai-engine/services/providerService';
import { getChatSystemPrompt, CHAT_PROMPT_VERSION_V1, CHAT_PROMPT_VERSION_V2 } from '../../ai-engine/prompts/chatPrompts';
import { AIContext } from '../../ai-engine/types/aiContext';
import { redactSecrets } from '../src/security/secretRedactor';
import { MultiFileContextService } from '../src/services/multiFileContextService';

console.log('======================================================');
console.log('🧪 RUNNING ENGITRACE TASK 6 INTELLIGENCE IMPROVEMENTS TEST SUITE');
console.log('======================================================\n');

async function runTests() {
  // --------------------------------------------------------------------------
  // TEST GROUP 1: Graph Traversal & Directed Pathing
  // --------------------------------------------------------------------------
  console.log('--- 1. Testing Graph Directionality & findPath Options ---');
  {
    // A -> B -> C, but C does NOT point to A
    const sampleGraph: EngineeringMemoryGraph = {
      repositoryId: 'test-graph-repo',
      nodes: [
        { id: 'node-A', type: 'FILE', label: 'A.ts', metadata: {}, sourceReference: '', createdAt: '', updatedAt: '' },
        { id: 'node-B', type: 'FILE', label: 'B.ts', metadata: {}, sourceReference: '', createdAt: '', updatedAt: '' },
        { id: 'node-C', type: 'FILE', label: 'C.ts', metadata: {}, sourceReference: '', createdAt: '', updatedAt: '' }
      ],
      edges: [
        { id: 'edge-AB', source: 'node-A', target: 'node-B', relationshipType: 'IMPORTS', evidence: '', classification: 'FACT' },
        { id: 'edge-BC', source: 'node-B', target: 'node-C', relationshipType: 'IMPORTS', evidence: '', classification: 'FACT' }
      ],
      summary: {} as any
    };

    // Forward path A -> C
    const forwardUndirected = GraphQueryEngine.findPath(sampleGraph, 'node-A', 'node-C');
    assert.strictEqual(forwardUndirected.found, true, 'Undirected search finds path A -> C');
    assert.strictEqual(forwardUndirected.nodes.length, 3, 'Path A -> C has 3 nodes');

    const forwardDirected = GraphQueryEngine.findPath(sampleGraph, 'node-A', 'node-C', { directed: true });
    assert.strictEqual(forwardDirected.found, true, 'Directed search finds valid downstream path A -> C');

    // Reverse path C -> A should NOT exist in directed mode
    const reverseDirected = GraphQueryEngine.findPath(sampleGraph, 'node-C', 'node-A', { directed: true });
    assert.strictEqual(reverseDirected.found, false, 'Directed search correctly respects edge direction (C cannot reach A)');

    // Reverse path C -> A DOES exist in default undirected mode
    const reverseUndirected = GraphQueryEngine.findPath(sampleGraph, 'node-C', 'node-A');
    assert.strictEqual(reverseUndirected.found, true, 'Default backward-compatible search finds undirected path C -> A');
    console.log('✓ findPath correctly differentiates directed vs undirected traversals');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Historical Chain Prioritization in getHistoricalChain
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing getHistoricalChain Prioritization ---');
  {
    // A file with multiple edges: repository CONTAINS file, author AUTHORED, commit MODIFIED file
    const sampleGraph: EngineeringMemoryGraph = {
      repositoryId: 'test-hist-repo',
      nodes: [
        { id: 'repo:root', type: 'REPOSITORY', label: 'root', metadata: {}, sourceReference: '', createdAt: '', updatedAt: '' },
        { id: 'file:test.ts', type: 'FILE', label: 'test.ts', metadata: {}, sourceReference: '', createdAt: '', updatedAt: '' },
        { id: 'commit:c1', type: 'COMMIT', label: 'c1', metadata: { hash: 'c1' }, sourceReference: '', createdAt: '', updatedAt: '' },
        { id: 'pr:p1', type: 'PULL_REQUEST', label: 'p1', metadata: {}, sourceReference: '', createdAt: '', updatedAt: '' },
        { id: 'issue:i1', type: 'ISSUE', label: 'i1', metadata: {}, sourceReference: '', createdAt: '', updatedAt: '' }
      ],
      edges: [
        // Intentionally place CONTAINS first to verify it does not blindly follow first edge
        { id: 'e-contains', source: 'repo:root', target: 'file:test.ts', relationshipType: 'CONTAINS', evidence: '', classification: 'FACT' },
        { id: 'e-mod', source: 'commit:c1', target: 'file:test.ts', relationshipType: 'MODIFIED', evidence: 'Fixed auth', classification: 'FACT' },
        { id: 'e-impl', source: 'pr:p1', target: 'commit:c1', relationshipType: 'IMPLEMENTED', evidence: 'PR 1', classification: 'FACT' },
        { id: 'e-res', source: 'pr:p1', target: 'issue:i1', relationshipType: 'RESOLVES', evidence: 'Resolves issue', classification: 'FACT' }
      ],
      summary: {} as any
    };

    const res = GraphQueryEngine.getHistoricalChain(sampleGraph, 'file:test.ts');
    assert.strictEqual(res.chain[0].node.id, 'file:test.ts', 'Step 1 is target file');
    assert.strictEqual(res.chain[1].node.id, 'commit:c1', 'Step 2 prioritized COMMIT over REPOSITORY container');
    assert.strictEqual(res.chain[2].node.id, 'pr:p1', 'Step 3 prioritized PULL_REQUEST');
    assert.strictEqual(res.chain[3].node.id, 'issue:i1', 'Step 4 prioritized ISSUE');
    console.log('✓ getHistoricalChain prioritizes canonical File -> Commit -> PR -> Issue path');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Historical Cutoff Enforcement in WhyExplorerService
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing Historical Cutoff Timestamp Enforcement ---');
  {
    const cutoffDate = '2026-11-02T20:15:26Z';
    const preCutoffCommitDate = '2026-11-01T12:00:00Z';
    const postCutoffCommitDate = '2026-11-05T12:00:00Z'; // Occurred after snapshot cutoff!

    const cutoffGraph: EngineeringMemoryGraph = {
      repositoryId: 'test-cutoff-repo',
      nodes: [
        { id: 'file:auth.ts', type: 'FILE', label: 'auth.ts', metadata: { path: 'auth.ts' }, sourceReference: '', createdAt: cutoffDate, updatedAt: cutoffDate },
        {
          id: 'commit:pre',
          type: 'COMMIT',
          label: 'pre-cutoff-commit',
          metadata: { hash: 'pre123', date: preCutoffCommitDate, timestamp: preCutoffCommitDate },
          sourceReference: '',
          createdAt: preCutoffCommitDate,
          updatedAt: preCutoffCommitDate
        },
        {
          id: 'commit:post',
          type: 'COMMIT',
          label: 'post-cutoff-commit',
          metadata: { hash: 'post999', date: postCutoffCommitDate, timestamp: postCutoffCommitDate },
          sourceReference: '',
          createdAt: postCutoffCommitDate,
          updatedAt: postCutoffCommitDate
        }
      ],
      edges: [
        // Post-cutoff commit placed first in array
        {
          id: 'edge-post',
          source: 'commit:post',
          target: 'file:auth.ts',
          relationshipType: 'MODIFIED',
          evidence: 'Subsequent fix',
          timestamp: postCutoffCommitDate,
          classification: 'FACT'
        },
        {
          id: 'edge-pre',
          source: 'commit:pre',
          target: 'file:auth.ts',
          relationshipType: 'MODIFIED',
          evidence: 'Original introductory commit',
          timestamp: preCutoffCommitDate,
          classification: 'FACT'
        }
      ],
      summary: {} as any
    };

    GraphRepository.saveGraph('test-cutoff-repo', cutoffGraph);

    // Execute WHY query with explicit cutoff timestamp
    const whyResult = WhyExplorerService.executeQuery({
      repositoryId: 'test-cutoff-repo',
      nodeId: 'file:auth.ts',
      options: { snapshotCutoff: cutoffDate }
    });

    const chainNodeIds = whyResult.historicalChain.map((s) => s.node.id);
    assert(chainNodeIds.includes('commit:pre'), 'Pre-cutoff commit is included in historical chain');
    assert(!chainNodeIds.includes('commit:post'), 'Post-cutoff commit is STRICTLY excluded by snapshot cutoff');
    console.log('✓ WhyExplorerService strictly excludes events occurring after the snapshot cutoff');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Canonical repositoryId in WhyExplorer Evidence Records
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Testing Canonical repositoryId Assignment in WhyExplorer ---');
  {
    const whyResult = WhyExplorerService.executeQuery({
      repositoryId: 'test-cutoff-repo',
      nodeId: 'file:auth.ts'
    });

    assert(whyResult.evidence.length > 0, 'Evidence records generated');
    for (const ev of whyResult.evidence) {
      assert.strictEqual(ev.repositoryId, 'test-cutoff-repo', 'Evidence repositoryId matches canonical repository ID');
      assert.notStrictEqual(ev.repositoryId, 'file:auth.ts', 'Evidence repositoryId is not leaking target node ID placeholder');
    }
    console.log('✓ Evidence records carry canonical repository ID without placeholder leakage');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Impact Analysis Directionality for EXPOSES
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Testing Impact Analysis EXPOSES Forward Traversal ---');
  {
    const impactGraph: EngineeringMemoryGraph = {
      repositoryId: 'test-exposes-repo',
      nodes: [
        { id: 'file:server.ts', type: 'FILE', label: 'server.ts', metadata: { path: 'server.ts' }, sourceReference: '', createdAt: '', updatedAt: '' },
        { id: 'function:startServer', type: 'FUNCTION', label: 'startServer', metadata: {}, sourceReference: '', createdAt: '', updatedAt: '' },
        { id: 'function:stopServer', type: 'FUNCTION', label: 'stopServer', metadata: {}, sourceReference: '', createdAt: '', updatedAt: '' }
      ],
      edges: [
        { id: 'e-exp1', source: 'file:server.ts', target: 'function:startServer', relationshipType: 'EXPOSES', evidence: 'Exports startServer', classification: 'FACT' },
        { id: 'e-exp2', source: 'file:server.ts', target: 'function:stopServer', relationshipType: 'DECLARES', evidence: 'Declares stopServer', classification: 'FACT' }
      ],
      summary: {} as any
    };

    GraphRepository.saveGraph('test-exposes-repo', impactGraph);

    // Analyzing removal of server.ts must affect both startServer (EXPOSES) and stopServer (DECLARES)
    const impact = ImpactAnalysisService.analyzeImpact({
      repositoryId: 'test-exposes-repo',
      nodeId: 'file:server.ts',
      operation: 'REMOVE'
    });

    const directIds = impact.directImpact.map((n) => n.id);
    assert(directIds.includes('function:startServer'), 'Removing file affects exported function via EXPOSES edge');
    assert(directIds.includes('function:stopServer'), 'Removing file affects declared function via DECLARES edge');
    assert(impact.impactScore > 0, 'Impact score reflects affected child symbols');
    console.log('✓ EXPOSES relationships properly propagate forward container impact');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 6: Hallucination Defense: Inferred Evidence Cannot Back FACT Claims
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Testing StructuredOutputValidator Epistemological Defense ---');
  {
    const mockContext: AIContext = {
      target: { id: 'file:app.ts', type: 'FILE', label: 'app.ts', metadata: {}, sourceReference: '', createdAt: '', updatedAt: '' },
      question: 'Why was this file changed?',
      historicalChain: [],
      evidence: [
        {
          id: 'ev-fact-1',
          repositoryId: 'repo-epistemic',
          source: 'commit:1',
          target: 'file:app.ts',
          relationshipType: 'MODIFIED',
          classification: 'FACT',
          confidence: 1.0,
          title: 'Direct modification',
          description: 'Git commit modified file'
        },
        {
          id: 'ev-inf-1',
          repositoryId: 'repo-epistemic',
          source: 'author:alex',
          target: 'issue:42',
          relationshipType: 'RELATED_TO',
          classification: 'INFERENCE',
          confidence: 0.6,
          title: 'Plausible ticket connection',
          description: 'Inferred link based on timestamp'
        }
      ],
      facts: [],
      inferences: [],
      unknowns: [],
      relationships: [],
      metadata: { repositoryId: 'repo-epistemic', totalEvidenceCount: 2, contextBuiltAt: '' },
      sourceLinks: []
    };

    // Scenario A: Legitimate FACT claim citing FACT evidence -> Remains FACT
    const responseWithFact = {
      answer: 'Commit 1 modified app.ts.',
      claims: [
        { text: 'Commit 1 modified app.ts', classification: 'FACT', evidenceIds: ['ev-fact-1'] }
      ]
    };
    const validResult = StructuredOutputValidator.validate(responseWithFact, mockContext);
    assert.strictEqual(validResult.claims[0].classification, 'FACT', 'Legitimate FACT claim with FACT evidence stays FACT');

    // Scenario B: Claim labeled FACT but citing ONLY INFERENCE evidence -> Must be downgraded to INFERENCE
    const responseWithPseuoFact = {
      answer: 'Alex Rivera resolved issue 42.',
      claims: [
        { text: 'Alex Rivera resolved issue 42', classification: 'FACT', evidenceIds: ['ev-inf-1'] }
      ]
    };
    const interceptedResult = StructuredOutputValidator.validate(responseWithPseuoFact, mockContext);
    assert.strictEqual(
      interceptedResult.claims[0].classification,
      'INFERENCE',
      'Epistemic defense: Claim asserting FACT backed solely by INFERENCE evidence is downgraded to INFERENCE'
    );
    assert(
      interceptedResult.validationLog.some((log) => log.includes('Epistemological Defense')),
      'Validation log records epistemological defense intervention'
    );
    console.log('✓ StructuredOutputValidator prevents inferred evidence from being reported as confirmed FACT');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 7: Repository Matching Precedence in getSnapshot
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Testing Repository Exact Matching Precedence ---');
  {
    // Seed two repositories where one slug is a substring of another
    const snap1: any = {
      metadata: { id: 'repo-express', name: 'express', defaultBranch: 'main', updatedAt: '2026-11-01T00:00:00Z' },
      fileTree: [],
      commits: [],
      dependencies: [],
      evidence: [],
      summary: { repository: { id: 'repo-express' } }
    };
    const snap2: any = {
      metadata: { id: 'repo-express-session', name: 'express-session', defaultBranch: 'main', updatedAt: '2026-11-01T00:00:00Z' },
      fileTree: [],
      commits: [],
      dependencies: [],
      evidence: [],
      summary: { repository: { id: 'repo-express-session' } }
    };

    registerSnapshot(snap1, ['express', 'repo-express']);
    registerSnapshot(snap2, ['express-session', 'repo-express-session']);

    const found1 = RepositoryController.getSnapshot('express');
    assert.strictEqual(found1?.metadata.id, 'repo-express', 'Exact match for "express" resolves to repo-express');

    const found2 = RepositoryController.getSnapshot('express-session');
    assert.strictEqual(found2?.metadata.id, 'repo-express-session', 'Exact match for "express-session" resolves to repo-express-session');

    console.log('✓ Exact repository match takes strict precedence over substring matching');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 8: Source Line Range Half-Open Interval Support
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Testing Source Line Range Half-Open Interval ---');
  {
    const fullSource = 'line1\nline2\nline3\nline4\nline5\n';
    const mockSnapshot: any = {
      sourceContents: new Map([['src/test.ts', fullSource]]),
      fileTree: [{ path: 'src/test.ts', sha: 'sha-test' }],
      metadata: { id: 'repo-test', defaultBranch: 'main' }
    };

    const ctx = await MultiFileContextService.retrieveBoundedContext({
      repositoryId: 'repo-test',
      canonicalRepoId: 'repo-test',
      owner: 'test',
      repo: 'test',
      branch: 'main',
      selectedFilePath: 'src/test.ts',
      nodeId: 'file:repo-test:src/test.ts',
      analysisType: 'WHY',
      question: 'Explain test.ts',
      snapshot: mockSnapshot
    });

    assert(ctx.selectedFile, 'Selected file retrieved');
    assert.strictEqual(ctx.selectedFile?.lineRange?.startLine, 1, 'startLine is 1');
    assert.strictEqual(ctx.selectedFile?.lineRange?.endLine, 6, 'endLine inclusive is 6');
    assert.strictEqual(ctx.selectedFile?.lineRange?.endLineExclusive, 7, 'endLineExclusive is 7 [1, 7)');
    console.log('✓ Source line intervals explicitly expose 1-based start-inclusive end-exclusive ranges');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 9: Prompt Versioning & Feature Flagging
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Testing Prompt Versioning Architecture ---');
  {
    const promptOptions = {
      nodeId: 'file:test.ts',
      analysisType: 'WHY',
      intentInstructions: 'Explain historical reasons.'
    };

    // Default version should be v2 (improved)
    const defaultPrompt = getChatSystemPrompt(promptOptions);
    assert.strictEqual(defaultPrompt.version, CHAT_PROMPT_VERSION_V2, 'Default prompt is chat.v2');
    assert(defaultPrompt.prompt.includes('STRICT TEMPORAL SNAPSHOT BOUNDARY ENFORCEMENT'), 'v2 prompt includes snapshot boundary rules');

    // Explicit v1 request or env toggle should return v1 (exact pre-Task-6 baseline)
    const v1Prompt = getChatSystemPrompt({ ...promptOptions, version: 'v1' });
    assert.strictEqual(v1Prompt.version, CHAT_PROMPT_VERSION_V1, 'v1 prompt returns chat.v1 baseline');
    assert(!v1Prompt.prompt.includes('STRICT TEMPORAL SNAPSHOT BOUNDARY ENFORCEMENT'), 'v1 prompt preserves exact pre-Task-6 baseline text');
    console.log('✓ Prompt versioning allows switching between pre-Task-6 baseline and Task 6 improved version');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 10: Secret Redaction in Error Payloads
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Testing Secret Redactor in Error Responses ---');
  {
    const sensitiveErrorMsg = 'Failed to connect to Google API using key AIzaSyA1234567890abcdefghijklmnopqrstuv at https://generativelanguage.googleapis.com?key=AIzaSyA1234567890abcdefghijklmnopqrstuv';
    const redacted = redactSecrets(sensitiveErrorMsg);
    assert(!redacted.includes('AIzaSyA1234567890abcdefghijklmnopqrstuv'), 'API key is fully redacted from error message');
    assert(redacted.includes('[REDACTED_API_KEY]'), 'Redaction placeholder present');
    console.log('✓ Sensitive credentials and tokens are redacted from error output');
  }

  console.log('\n======================================================');
  console.log('✅ ALL TASK 6 INTELLIGENCE IMPROVEMENTS TESTS PASSED CLEANLY');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TASK 6 TEST SUITE FAILED:', err);
  process.exit(1);
});
