/**
 * EngiTrace Chat Retries, 503 Handling, and File Context Unit Tests
 */

import { GraphBuilder, RawIngestionData } from '../../graph-engine/src';
import { GraphRepository } from '../src/services/graphRepository';
import { ChatController } from '../src/controllers/chatController';
import { ProviderService } from '../../ai-engine/services/providerService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

async function runTests() {
  console.log('=== Running EngiTrace Chat Retries, 503 Handling, and File Context Tests ===\n');

  // 1. Setup Mock Ingestion Data for morluto/rea with docs/architecture.mermaid
  const sampleIngestion: RawIngestionData = {
    repository: {
      id: 'repo-morluto-rea',
      owner: 'morluto',
      repo: 'rea',
      url: 'https://github.com/morluto/rea',
      description: 'Real Estate Architecture System',
      defaultBranch: 'main',
      language: 'TypeScript',
      stars: 45,
      forks: 8,
      openIssuesCount: 2,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-05-20T00:00:00Z'
    },
    fileTree: [
      { path: 'docs/architecture.mermaid', type: 'file' },
      { path: 'src/index.ts', type: 'file' }
    ],
    commits: [
      {
        hash: 'e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3',
        shortHash: 'e4f5a6b',
        message: 'docs: add architecture Mermaid diagram',
        authorName: 'Morluto Maintainer',
        authorEmail: 'dev@morluto.com',
        date: '2025-05-15T12:00:00Z',
        url: 'https://github.com/morluto/rea/commit/e4f5a6b',
        files: [{ path: 'docs/architecture.mermaid', additions: 15, deletions: 0, changes: 15 }]
      }
    ],
    pullRequests: [],
    issues: [],
    dependencies: [],
    evidenceRecords: []
  };

  const graph = GraphBuilder.buildGraph(sampleIngestion);
  GraphRepository.saveGraph('repo-morluto-rea', graph, ['morluto/rea', 'morluto-rea']);

  // --- Test 1: Local Fallback Generator with Mermaid Diagram Content ---
  console.log('--- 1. Testing Evidence-Grounded Local Fallback Generator (Mermaid Content) ---');

  const mockContextWithMermaid = JSON.stringify({
    repositoryId: 'morluto/rea',
    selectedNode: {
      id: 'docs/architecture.mermaid',
      label: 'docs/architecture.mermaid',
      type: 'FILE',
      filePath: 'docs/architecture.mermaid',
      fileContent: `graph TD\n  Client[Frontend Client] --> API[API Gateway]\n  API --> Auth[Auth Service]\n  API --> DB[(Database)]`,
      fileContentStatus: 'RETRIEVED_SUCCESSFULLY',
      isMermaidDiagram: true,
      commitSha: 'e4f5a6b7c8d9',
      author: 'Morluto Maintainer',
      commitMessage: 'docs: add architecture Mermaid diagram'
    },
    connectedEdges: [
      { source: 'morluto/rea', target: 'docs/architecture.mermaid', relationshipType: 'CONTAINS' }
    ]
  });

  const fallbackResult = ProviderService.generateLocalFallbackResponse(
    mockContextWithMermaid,
    [{ role: 'user', content: 'explain about this file' }],
    'WHY',
    'docs/architecture.mermaid',
    'HTTP 503 Service Unavailable'
  );

  assert(fallbackResult.provider === 'LOCAL_FALLBACK', 'Provider is LOCAL_FALLBACK');
  assert(fallbackResult.isFallback === true, 'isFallback is true');
  assert(typeof fallbackResult.answer === 'string', 'Returns string answer');
  assert(fallbackResult.answer.includes('Mermaid Architecture Diagram') || fallbackResult.answer.includes('architecture diagram file'), 'Recognizes Mermaid diagram file');
  assert(fallbackResult.answer.includes('Frontend Client'), 'Parses Mermaid node labels in fallback');
  assert(fallbackResult.answer.includes('API Gateway'), 'Parses Mermaid API Gateway component');
  assert(fallbackResult.answer.includes('HTTP 503 Service Unavailable'), 'Includes user-friendly availability notice');
  assert(fallbackResult.answer.includes('CONTAINS'), 'Includes graph relationships in fallback answer');
  assert(Array.isArray(fallbackResult.suggestedFollowUps), 'Provides suggested follow-ups');

  // --- Test 2: Local Fallback Generator with Inaccessible Content ---
  console.log('\n--- 2. Testing Local Fallback Generator (Inaccessible File Content) ---');

  const mockContextMissingFile = JSON.stringify({
    repositoryId: 'morluto/rea',
    selectedNode: {
      id: 'docs/missing.mermaid',
      label: 'docs/missing.mermaid',
      type: 'FILE',
      filePath: 'docs/missing.mermaid',
      fileContent: undefined,
      fileContentStatus: 'File "docs/missing.mermaid" not found in repository',
      isMermaidDiagram: true
    }
  });

  const fallbackMissingResult = ProviderService.generateLocalFallbackResponse(
    mockContextMissingFile,
    [{ role: 'user', content: 'Explain this file' }],
    'WHY',
    'docs/missing.mermaid',
    'HTTP 429 Quota Exceeded'
  );

  assert(fallbackMissingResult.answer.includes('could not be accessed'), 'States that source file content could not be accessed');
  assert(fallbackMissingResult.claims.some((c: any) => c.classification === 'UNKNOWN'), 'Includes UNKNOWN claim for missing file content');

  // --- Test 3: Chat Controller for docs/architecture.mermaid ---
  console.log('\n--- 3. Testing Chat Controller for docs/architecture.mermaid ---');

  let resStatus = 200;
  let resJson: any = null;

  const req: any = {
    params: { id: 'morluto/rea' },
    body: {
      nodeId: 'docs/architecture.mermaid',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'explain about this file' }],
      nodeMetadata: {
        filePath: 'docs/architecture.mermaid',
        name: 'docs/architecture.mermaid',
        type: 'FILE'
      }
    }
  };

  const res: any = {
    status: (code: number) => { resStatus = code; return res; },
    json: (data: any) => { resJson = data; }
  };

  await ChatController.handleChat(req, res);

  assert(resStatus === 200, 'Chat controller returns HTTP 200');
  assert(typeof resJson.answer === 'string' && resJson.answer.length > 0, 'Answer is a non-empty string');
  assert(!resJson.answer.startsWith('⚠️ **Gemini API Error (HTTP 503)'), 'Does NOT output raw HTTP 503 error as full answer');
  assert(Array.isArray(resJson.claims), 'Claims array present');
  assert(Array.isArray(resJson.suggestedFollowUps) && resJson.suggestedFollowUps.length > 0, 'Suggested follow-ups present');

  // --- Test 4: Follow-Up Questions Context ---
  console.log('\n--- 4. Testing Follow-up Questions Context ---');

  const followUpReq: any = {
    params: { id: 'morluto/rea' },
    body: {
      nodeId: 'docs/architecture.mermaid',
      analysisType: 'WHY',
      messages: [
        { role: 'user', content: 'Why does docs/architecture.mermaid exist?' },
        { role: 'assistant', content: resJson.answer },
        { role: 'user', content: 'What components are connected in this diagram?' }
      ]
    }
  };

  let followUpStatus = 200;
  let followUpJson: any = null;

  const followUpRes: any = {
    status: (code: number) => { followUpStatus = code; return followUpRes; },
    json: (data: any) => { followUpJson = data; }
  };

  await ChatController.handleChat(followUpReq, followUpRes);

  assert(followUpStatus === 200, 'Follow-up query returns HTTP 200');
  assert(typeof followUpJson.answer === 'string' && followUpJson.answer.length > 0, 'Follow-up returns valid answer');

  console.log('\n=====================================================================');
  console.log('🎉 ALL CHAT RETRIES, 503 HANDLING & FILE CONTEXT TESTS PASSED!');
  console.log('=====================================================================\n');
}

runTests().catch((err) => {
  console.error('❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
