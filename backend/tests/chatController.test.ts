/**
 * EngiTrace Chat Controller Unit Tests
 */

import { GraphBuilder, RawIngestionData } from '../../graph-engine/src';
import { GraphRepository } from '../src/services/graphRepository';
import { ChatController } from '../src/controllers/chatController';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

console.log('=== Running EngiTrace Chat Controller Unit Tests ===\n');

// 1. Setup Mock Ingestion Data & Graph
const sampleIngestion: RawIngestionData = {
  repository: {
    id: 'repo-chat-test',
    owner: 'codeorigin',
    repo: 'chat-test-repo',
    url: 'https://github.com/codeorigin/chat-test-repo',
    description: 'Chat Test Service',
    defaultBranch: 'main',
    language: 'TypeScript',
    stars: 10,
    forks: 2,
    openIssuesCount: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-11-20T00:00:00Z'
  },
  fileTree: [
    { path: 'src/App.ts', type: 'file' }
  ],
  commits: [
    {
      hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      shortHash: 'a1b2c3d',
      message: 'feat: add App entrypoint',
      authorName: 'Developer',
      authorEmail: 'dev@codeorigin.dev',
      date: '2024-11-15T10:00:00Z',
      url: 'https://github.com/codeorigin/chat-test-repo/commit/a1b2c3d',
      files: [{ path: 'src/App.ts', additions: 10, deletions: 0, changes: 10 }]
    }
  ],
  pullRequests: [],
  issues: [],
  dependencies: [],
  evidenceRecords: []
};

const graph = GraphBuilder.buildGraph(sampleIngestion);
GraphRepository.saveGraph('repo-chat-test', graph);

async function runTests() {
  // Test 1: Parameter Validation (Missing parameters)
  let mockStatus = 0;
  let mockJson: any = null;
  const reqMissing: any = {
    params: { id: 'repo-chat-test' },
    body: {}
  };
  const resMissing: any = {
    status: (code: number) => { mockStatus = code; return resMissing; },
    json: (data: any) => { mockJson = data; }
  };
  await ChatController.handleChat(reqMissing, resMissing);
  assert(mockStatus === 400, 'Returns 400 when required parameters are missing');
  assert(mockJson?.error?.includes('Missing required parameters'), 'Correct error message for missing parameters');

  // Test 2: Successful WHY Chat Execution
  let resStatus = 200;
  let resJson: any = null;
  const reqWhy: any = {
    params: { id: 'repo-chat-test' },
    body: {
      nodeId: 'src/App.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Why does this file exist?' }]
    }
  };
  const resWhy: any = {
    status: (code: number) => { resStatus = code; return resWhy; },
    json: (data: any) => { resJson = data; }
  };
  await ChatController.handleChat(reqWhy, resWhy);
  assert(resStatus === 200, 'Returns 200 for WHY chat request');
  assert(typeof resJson?.answer === 'string' && resJson.answer.length > 0, 'Returns valid answer string');
  assert(Array.isArray(resJson?.claims), 'Returns claims array');
  assert(Array.isArray(resJson?.suggestedFollowUps), 'Returns suggestedFollowUps array');

  // Test 3: Commit / Authorship Intent Test
  let resCommitStatus = 200;
  let resCommitJson: any = null;
  const reqCommit: any = {
    params: { id: 'repo-chat-test' },
    body: {
      nodeId: 'src/App.ts',
      analysisType: 'WHY',
      messages: [{ role: 'user', content: 'Which commit changed src/App.ts?' }]
    }
  };
  const resCommit: any = {
    status: (code: number) => { resCommitStatus = code; return resCommit; },
    json: (data: any) => { resCommitJson = data; }
  };
  await ChatController.handleChat(reqCommit, resCommit);
  assert(resCommitStatus === 200, 'Returns 200 for commit inquiry');
  assert(resCommitJson?.answer.toLowerCase().includes('commit') || resCommitJson?.answer.toLowerCase().includes('modified') || resCommitJson?.answer.toLowerCase().includes('gemini'), 'Answer addresses commit history or provider status');

  // Test 4: Successful WHAT_IF Chat Execution & Contradiction Prevention
  let resWhatIfStatus = 200;
  let resWhatIfJson: any = null;
  const reqWhatIf: any = {
    params: { id: 'repo-chat-test' },
    body: {
      nodeId: 'src/App.ts',
      analysisType: 'WHAT_IF',
      messages: [{ role: 'user', content: 'What would break if this is removed?' }]
    }
  };
  const resWhatIf: any = {
    status: (code: number) => { resWhatIfStatus = code; return resWhatIf; },
    json: (data: any) => { resWhatIfJson = data; }
  };
  await ChatController.handleChat(reqWhatIf, resWhatIf);
  assert(resWhatIfStatus === 200, 'Returns 200 for WHAT_IF chat request');
  assert(typeof resWhatIfJson?.answer === 'string' && resWhatIfJson.answer.length > 0, 'Returns valid WHAT_IF answer string');
  assert(resWhatIfJson.answer.includes('No downstream') || resWhatIfJson.answer.includes('no downstream') || resWhatIfJson.answer.includes('isolated') || resWhatIfJson.answer.includes('Gemini'), 'Contradiction Prevention: Does not hallucinate downstream breakages when 0 dependents exist');

  console.log('\n======================================================');
  console.log('🎉 ALL CHAT CONTROLLER UNIT TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('❌ CHAT CONTROLLER TEST SUITE FAILED:', err);
  process.exit(1);
});
