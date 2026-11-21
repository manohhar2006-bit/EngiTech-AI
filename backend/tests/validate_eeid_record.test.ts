/**
 * EngiTrace EEID Record Validator — Comprehensive Test Suite
 *
 * Verifies all 8 validation rules across 16+ mandatory test scenarios:
 * 1. Valid record acceptance (isolated mock and live pilot snapshot)
 * 2. Missing mandatory fields
 * 3. Wrong commit SHA
 * 4. Missing target node
 * 5. Invalid repository-scoped IDs
 * 6. Incorrect blob SHA
 * 7. Incorrect source content hash
 * 8. Invalid line ranges (0-based, inverted, overflow)
 * 9. Missing evidence references
 * 10. FACT without evidence
 * 11. INFERENCE without reasoning
 * 12. Temporal leakage (post-snapshot items / boundary leakage)
 * 13. Invalid graph edge
 * 14. Disconnected graph path
 * 15. Cross-repository graph reference
 * 16. Invalid WHAT IF fields
 * 17. Live Express pilot record validation with real disk indices
 */

import path from 'path';
import crypto from 'crypto';
import {
  EEIDRecordValidator,
  EEIDRecord,
  RepositoryIndexContext
} from '../../validate_eeid_record';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

// ============================================================================
// Fixture Generators
// ============================================================================

function createMockIndex(): RepositoryIndexContext {
  const nodes = new Map<string, any>();
  const edges = new Map<string, any>();
  const retrievalUnits = new Map<string, any>();
  const sourceFiles = new Map<string, any>();
  const history = new Map<string, any>();

  // Target Function Node
  nodes.set('function:EEID-REPO-001:src/auth.ts:login', {
    id: 'function:EEID-REPO-001:src/auth.ts:login',
    type: 'FUNCTION',
    label: 'login',
    metadata: { path: 'src/auth.ts' }
  });

  // Target Caller Node
  nodes.set('function:EEID-REPO-001:src/server.ts:handleRequest', {
    id: 'function:EEID-REPO-001:src/server.ts:handleRequest',
    type: 'FUNCTION',
    label: 'handleRequest',
    metadata: { path: 'src/server.ts' }
  });

  // Edge
  edges.set('edge-auth-call-001', {
    id: 'edge-auth-call-001',
    source: 'function:EEID-REPO-001:src/server.ts:handleRequest',
    target: 'function:EEID-REPO-001:src/auth.ts:login',
    relationshipType: 'CALLS'
  });

  // Source File: 10 lines of mock code
  const fileLines = [
    'import { db } from "./db";',
    'export async function login(user: string, pass: string): Promise<boolean> {',
    '  if (!user || !pass) {',
    '    return false;',
    '  }',
    '  const record = await db.findUser(user);',
    '  if (!record) return false;',
    '  return record.verifyPassword(pass);',
    '}',
    'export default login;'
  ];
  const fileSlice = fileLines.slice(1, 9).join('\n'); // lines 2 to 9
  const sliceHash = crypto.createHash('sha256').update(fileSlice).digest('hex');

  sourceFiles.set('src/auth.ts', {
    lines: fileLines,
    blobSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    rawContent: fileLines.join('\n')
  });

  // Retrieval Unit
  retrievalUnits.set('EEID-REPO-001-RU-0001', {
    retrieval_unit_id: 'EEID-REPO-001-RU-0001',
    repository_id: 'EEID-REPO-001',
    commit_sha: '43fca52d28a422c8be48fd489cbd4f2d6152bab6',
    file_path: 'src/auth.ts',
    source_line_start: 2,
    source_line_end_exclusive: 10,
    blob_sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    content_hash: sliceHash,
    content: fileSlice,
    chunk_type: 'function'
  });

  // History items
  history.set('commit-43fca52', {
    id: 'commit-43fca52',
    type: 'commit',
    sha: '43fca52d28a422c8be48fd489cbd4f2d6152bab6',
    created_at: '2026-11-02T20:00:00Z',
    temporal_status: 'available_at_snapshot'
  });

  history.set('issue-post-snapshot', {
    id: 'issue-post-snapshot',
    type: 'issue',
    created_at: '2026-11-02T20:15:30Z',
    temporal_status: 'post_snapshot_update_do_not_use_as_pre_snapshot_evidence'
  });

  return {
    repositoryId: 'EEID-REPO-001',
    manifest: {
      repository_name: 'test/repo',
      pinned_commit_sha: '43fca52d28a422c8be48fd489cbd4f2d6152bab6',
      snapshot_timestamp: '2026-11-02T20:15:26Z'
    },
    nodes,
    edges,
    retrievalUnits,
    sourceFiles,
    history
  };
}

function createBaseValidRecord(index: RepositoryIndexContext): EEIDRecord {
  const ru = index.retrievalUnits.get('EEID-REPO-001-RU-0001')!;

  return {
    recordId: 'EEID-REC-001-NODE-0001',
    category: 'NODE_UNDERSTANDING',
    repository: {
      id: 'EEID-REPO-001',
      name: 'test/repo',
      url: 'https://github.com/test/repo',
      defaultBranch: 'main',
      commitSha: '43fca52d28a422c8be48fd489cbd4f2d6152bab6',
      snapshotTimestamp: '2026-11-02T20:15:26Z',
      licenseSpdx: 'MIT'
    },
    targetNode: {
      id: 'function:EEID-REPO-001:src/auth.ts:login',
      type: 'FUNCTION',
      label: 'login',
      filePath: 'src/auth.ts'
    },
    question: 'What is the purpose of login() in src/auth.ts?',
    questionContext: {
      intent: 'Explain authentication validation and database verification',
      difficulty: 'MEDIUM',
      interactionMode: 'NODE_INTELLIGENCE',
      requiresMultiFile: false,
      requiresHistory: false
    },
    contextInputs: {
      retrievalUnitIds: ['EEID-REPO-001-RU-0001'],
      graphNodeIds: ['function:EEID-REPO-001:src/auth.ts:login'],
      graphEdgeIds: ['edge-auth-call-001']
    },
    expectedAnswer: 'The login() function validates credentials against the database and returns a boolean status.',
    expectedClaims: [
      {
        claimId: 'CLM-001',
        text: 'login() takes user and pass parameters and verifies credentials with db.findUser.',
        classification: 'FACT',
        confidenceTier: 'DEFINITIVE',
        evidenceIds: ['EEID-REPO-001-RU-0001'],
        sourceAnchors: [
          {
            filePath: 'src/auth.ts',
            sourceLineStart: 2,
            sourceLineEndExclusive: 10,
            contentHash: ru.content_hash,
            blobSha: ru.blob_sha
          }
        ]
      },
      {
        claimId: 'CLM-002',
        text: 'The function should be guarded by a rate limiter to prevent credential stuffing.',
        classification: 'INFERENCE',
        confidenceTier: 'HIGH',
        evidenceIds: ['EEID-REPO-001-RU-0001'],
        sourceAnchors: [],
        reasoning: 'Password verification is computationally expensive and vulnerable to brute force without rate limiting.'
      }
    ],
    annotationMetadata: {
      status: 'VERIFIED',
      annotatorType: 'HUMAN_EXPERT',
      author: 'Security Architect',
      verifiedAt: '2026-11-14T03:00:00Z'
    }
  };
}

// ============================================================================
// Test Suite Execution
// ============================================================================

async function runTests() {
  console.log('\n======================================================');
  console.log('EngiTrace EEID Record Validator — Comprehensive Test Suite');
  console.log('======================================================\n');

  const validator = new EEIDRecordValidator();
  const mockIndex = createMockIndex();

  // Test 1: Valid record acceptance
  {
    const record = createBaseValidRecord(mockIndex);
    const result = validator.validate(record, mockIndex);
    assert(result.passed, 'Test 1: Valid record is accepted without errors');
    assert(result.errors.length === 0, 'Test 1: 0 errors reported');
    assert(result.validationRuleResults.rule1_schema_integrity.passed, 'Test 1: Rule 1 passed');
    assert(result.validationRuleResults.rule4_source_anchor_verification.passed, 'Test 1: Rule 4 passed');
  }

  // Test 2: Missing mandatory fields
  {
    const record = createBaseValidRecord(mockIndex);
    delete (record as any).question;
    delete (record as any).category;
    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 2: Rejects record missing question and category');
    assert(result.errors.some((e) => e.includes('Missing or empty question')), 'Test 2: Reports missing question');
    assert(result.errors.some((e) => e.includes('Invalid or missing category')), 'Test 2: Reports missing category');
  }

  // Test 3: Wrong commit SHA
  {
    const record = createBaseValidRecord(mockIndex);
    record.repository.commitSha = '0000000000000000000000000000000000000000';
    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 3: Rejects wrong commit SHA against manifest');
    assert(result.errors.some((e) => e.includes('Commit SHA mismatch')), 'Test 3: Reports commit SHA mismatch');
  }

  // Test 4: Missing target node
  {
    const record = createBaseValidRecord(mockIndex);
    record.targetNode.id = 'function:EEID-REPO-001:src/auth.ts:nonExistentFunction';
    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 4: Rejects missing target node in nodes snapshot');
    assert(result.errors.some((e) => e.includes('does not exist in repository nodes.jsonl snapshot')), 'Test 4: Reports missing node');
  }

  // Test 5: Invalid repository-scoped IDs (cross-repo reference in retrieval units)
  {
    const record = createBaseValidRecord(mockIndex);
    record.contextInputs.retrievalUnitIds.push('EEID-REPO-002-RU-9999');
    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 5: Rejects cross-repository reference in retrievalUnitIds');
    assert(result.errors.some((e) => e.includes('Cross-repository reference detected')), 'Test 5: Identifies foreign repo reference');
  }

  // Test 6: Incorrect blob SHA
  {
    const record = createBaseValidRecord(mockIndex);
    record.expectedClaims[0].sourceAnchors[0].blobSha = 'ffffffffffffffffffffffffffffffffffffffff';
    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 6: Rejects incorrect blob SHA');
    assert(result.errors.some((e) => e.includes('Git blob SHA mismatch')), 'Test 6: Reports blob SHA mismatch');
  }

  // Test 7: Incorrect source content hash
  {
    const record = createBaseValidRecord(mockIndex);
    record.expectedClaims[0].sourceAnchors[0].contentHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 7: Rejects forged or mismatched SHA-256 content hash');
    assert(result.errors.some((e) => e.includes('SHA-256 content hash mismatch')), 'Test 7: Reports content hash mismatch');
  }

  // Test 8: Invalid line ranges (0-based, inverted, overflow)
  {
    // 8a: 0-based start
    const rec8a = createBaseValidRecord(mockIndex);
    rec8a.expectedClaims[0].sourceAnchors[0].sourceLineStart = 0;
    const res8a = validator.validate(rec8a, mockIndex);
    assert(!res8a.passed, 'Test 8a: Rejects 0-based sourceLineStart');
    assert(res8a.errors.some((e) => e.includes('must be >= 1 (1-based)')), 'Test 8a: Enforces 1-based start');

    // 8b: Inverted range (start >= endExclusive)
    const rec8b = createBaseValidRecord(mockIndex);
    rec8b.expectedClaims[0].sourceAnchors[0].sourceLineStart = 10;
    rec8b.expectedClaims[0].sourceAnchors[0].sourceLineEndExclusive = 5;
    const res8b = validator.validate(rec8b, mockIndex);
    assert(!res8b.passed, 'Test 8b: Rejects inverted range [10, 5)');
    assert(res8b.errors.some((e) => e.includes('endExclusive must be > start')), 'Test 8b: Enforces positive half-open interval');

    // 8c: Range overflow past end of file
    const rec8c = createBaseValidRecord(mockIndex);
    rec8c.expectedClaims[0].sourceAnchors[0].sourceLineStart = 2;
    rec8c.expectedClaims[0].sourceAnchors[0].sourceLineEndExclusive = 999;
    const res8c = validator.validate(rec8c, mockIndex);
    assert(!res8c.passed, 'Test 8c: Rejects range overflow past file boundary');
    assert(res8c.errors.some((e) => e.includes('exceeds file limit')), 'Test 8c: Reports file boundary overflow');
  }

  // Test 9: Missing evidence references (claim references unknown ID)
  {
    const record = createBaseValidRecord(mockIndex);
    record.expectedClaims[0].evidenceIds = ['EEID-REPO-001-RU-NONEXISTENT'];
    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 9: Rejects non-existent evidence IDs');
    assert(result.errors.some((e) => e.includes('references non-existent evidence ID')), 'Test 9: Reports non-existent evidence ID');
  }

  // Test 10: FACT without evidence
  {
    const record = createBaseValidRecord(mockIndex);
    record.expectedClaims[0].evidenceIds = [];
    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 10: Rejects FACT claim without supporting evidence');
    assert(result.errors.some((e) => e.includes('FACT claim') && e.includes('must have at least one supporting evidence ID')), 'Test 10: Enforces FACT evidence requirement');
  }

  // Test 11: INFERENCE without reasoning
  {
    const record = createBaseValidRecord(mockIndex);
    delete (record.expectedClaims[1] as any).reasoning;
    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 11: Rejects INFERENCE claim without reasoning explanation');
    assert(result.errors.some((e) => e.includes('INFERENCE claim') && e.includes('must provide a non-empty reasoning explanation')), 'Test 11: Enforces reasoning string');
  }

  // Test 12: Temporal leakage
  {
    const record = createBaseValidRecord(mockIndex);
    record.contextInputs.historyStepIds = ['issue-post-snapshot'];
    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 12: Rejects post-snapshot evidence');
    assert(result.errors.some((e) => e.includes('Temporal leakage')), 'Test 12: Flags temporal boundary violation');
  }

  // Test 13: Invalid graph edge in WHAT IF path
  {
    const record = createBaseValidRecord(mockIndex);
    record.category = 'IMPACT_ANALYSIS';
    record.whatIfGroundTruth = {
      operation: 'REMOVE',
      targetSymbol: 'login',
      targetFilePath: 'src/auth.ts',
      directlyAffectedNodeIds: ['function:EEID-REPO-001:src/server.ts:handleRequest'],
      indirectlyAffectedNodeIds: [],
      dependencyPaths: [
        [
          'function:EEID-REPO-001:src/server.ts:handleRequest',
          'edge-non-existent-edge-id',
          'function:EEID-REPO-001:src/auth.ts:login'
        ]
      ],
      blastRadiusScore: 25,
      staticCertainty: ['handleRequest will fail compile-time resolution without login()'],
      runtimeUncertainties: ['Uncertain whether handleRequest is called in all deployment environments']
    };

    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 13: Rejects non-existent graph edge in dependency path');
    assert(result.errors.some((e) => e.includes('contains non-existent edge')), 'Test 13: Detects invalid graph edge');
  }

  // Test 14: Disconnected graph path
  {
    const record = createBaseValidRecord(mockIndex);
    record.category = 'IMPACT_ANALYSIS';
    // Edge connects handleRequest and login, but path pairs it with another node
    mockIndex.nodes.set('function:EEID-REPO-001:src/unrelated.ts:unrelated', {
      id: 'function:EEID-REPO-001:src/unrelated.ts:unrelated',
      type: 'FUNCTION',
      label: 'unrelated'
    });

    record.whatIfGroundTruth = {
      operation: 'MODIFY',
      targetSymbol: 'login',
      targetFilePath: 'src/auth.ts',
      directlyAffectedNodeIds: ['function:EEID-REPO-001:src/server.ts:handleRequest'],
      indirectlyAffectedNodeIds: [],
      dependencyPaths: [
        [
          'function:EEID-REPO-001:src/unrelated.ts:unrelated',
          'edge-auth-call-001', // connects handleRequest and login!
          'function:EEID-REPO-001:src/auth.ts:login'
        ]
      ],
      blastRadiusScore: 30,
      staticCertainty: ['Direct contract break'],
      runtimeUncertainties: []
    };

    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 14: Rejects disconnected graph edge path');
    assert(result.errors.some((e) => e.includes('Disconnected graph edge')), 'Test 14: Enforces hop-to-hop endpoint continuity');
  }

  // Test 15: Cross-repository graph reference in WHAT IF
  {
    const record = createBaseValidRecord(mockIndex);
    record.category = 'IMPACT_ANALYSIS';
    record.whatIfGroundTruth = {
      operation: 'REMOVE',
      targetSymbol: 'login',
      targetFilePath: 'src/auth.ts',
      directlyAffectedNodeIds: ['function:EEID-REPO-002:src/other.ts:foreignFn'], // Foreign repo!
      indirectlyAffectedNodeIds: [],
      dependencyPaths: [
        [
          'function:EEID-REPO-001:src/server.ts:handleRequest',
          'edge-auth-call-001',
          'function:EEID-REPO-001:src/auth.ts:login'
        ]
      ],
      blastRadiusScore: 40,
      staticCertainty: [],
      runtimeUncertainties: []
    };

    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 15: Rejects cross-repository node ID in directlyAffectedNodeIds');
    assert(result.errors.some((e) => e.includes('Cross-repository reference detected')), 'Test 15: Identifies cross-repo target node');
  }

  // Test 16: Invalid WHAT IF fields (blast radius out of range, missing arrays)
  {
    const record = createBaseValidRecord(mockIndex);
    record.category = 'IMPACT_ANALYSIS';
    record.whatIfGroundTruth = {
      operation: 'INVALID_OP' as any,
      targetSymbol: 'login',
      targetFilePath: 'src/auth.ts',
      directlyAffectedNodeIds: ['function:EEID-REPO-001:src/server.ts:handleRequest'],
      indirectlyAffectedNodeIds: [],
      dependencyPaths: [],
      blastRadiusScore: 150, // Out of bounds > 100
      staticCertainty: 'not an array' as any,
      runtimeUncertainties: []
    };

    const result = validator.validate(record, mockIndex);
    assert(!result.passed, 'Test 16: Rejects invalid WHAT IF fields');
    assert(result.errors.some((e) => e.includes('Invalid whatIfGroundTruth.operation')), 'Test 16: Rejects invalid operation');
    assert(result.errors.some((e) => e.includes('Invalid blastRadiusScore')), 'Test 16: Enforces 0-100 score bounds');
    assert(result.errors.some((e) => e.includes('staticCertainty must be an array')), 'Test 16: Enforces staticCertainty array');
  }

  // Test 17: Live Express Pilot Record Validation
  {
    const pilotDir = path.resolve(__dirname, '..', '..', 'eeid', 'pilot-output');
    const liveValidator = new EEIDRecordValidator({ indexDirectory: pilotDir });
    const liveIndex = liveValidator['indexStore'].getIndex('EEID-REPO-001', path.join(pilotDir, 'express'));

    assert(liveIndex !== null, 'Test 17: Successfully loaded live Express pilot indices from disk');
    assert(liveIndex!.nodes.size > 100, `Test 17: Loaded ${liveIndex!.nodes.size} real graph nodes`);
    assert(liveIndex!.edges.size > 150, `Test 17: Loaded ${liveIndex!.edges.size} real graph edges`);
    assert(liveIndex!.retrievalUnits.size > 90, `Test 17: Loaded ${liveIndex!.retrievalUnits.size} real retrieval units`);

    // Fetch the real authenticate function retrieval unit
    const authUnit = liveIndex!.retrievalUnits.get('EEID-REPO-001-RU-0074')!;
    assert(authUnit !== undefined, 'Test 17: Found EEID-REPO-001-RU-0074 (authenticate function chunk)');

    const liveRecord: EEIDRecord = {
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
        filePath: 'examples/auth/index.js'
      },
      question: 'What is the role of the authenticate() function in Express auth example?',
      questionContext: {
        intent: 'Explain username/password verification and pbkdf2 hashing callback structure',
        difficulty: 'MEDIUM',
        interactionMode: 'NODE_INTELLIGENCE',
        requiresMultiFile: false,
        requiresHistory: false
      },
      contextInputs: {
        retrievalUnitIds: ['EEID-REPO-001-RU-0074'],
        graphNodeIds: ['function:EEID-REPO-001:examples/auth/index.js:authenticate:60'],
        graphEdgeIds: ['edge-repo-file-EEID-REPO-001-examples_auth_index_js']
      },
      expectedAnswer: 'authenticate(name, pass, fn) queries a user object by name and hashes the supplied password against user.salt using pbkdf2-password.',
      expectedClaims: [
        {
          claimId: 'CLM-001',
          text: 'authenticate() accepts a name, password, and callback fn, querying user records from an in-memory table.',
          classification: 'FACT',
          confidenceTier: 'DEFINITIVE',
          evidenceIds: ['EEID-REPO-001-RU-0074'],
          sourceAnchors: [
            {
              filePath: authUnit.file_path,
              sourceLineStart: authUnit.source_line_start,
              sourceLineEndExclusive: authUnit.source_line_end_exclusive,
              contentHash: authUnit.content_hash,
              blobSha: authUnit.blob_sha
            }
          ]
        },
        {
          claimId: 'CLM-002',
          text: 'In production, this plain-object database should be replaced with a persistent, index-backed store.',
          classification: 'INFERENCE',
          confidenceTier: 'HIGH',
          evidenceIds: ['EEID-REPO-001-RU-0074'],
          sourceAnchors: [],
          reasoning: 'The comments in examples/auth/index.js explicitly describe the in-memory object as a placeholder database.'
        }
      ],
      annotationMetadata: {
        status: 'VERIFIED',
        annotatorType: 'HUMAN_EXPERT',
        author: 'EngiTrace Security Auditor',
        verifiedAt: '2026-11-14T03:30:00Z'
      }
    };

    const liveResult = liveValidator.validate(liveRecord, liveIndex);
    assert(liveResult.passed, 'Test 17: Live Express pilot record passed validation');
    assert(liveResult.errors.length === 0, `Test 17: 0 errors (errors: ${liveResult.errors.join(', ')})`);
    assert(liveResult.validationRuleResults.rule4_source_anchor_verification.passed, 'Test 17: Live SHA-256 slice match succeeded');
  }

  console.log('\n======================================================');
  console.log('✅ ALL 17 TEST SUITES PASSED CLEANLY');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal Test Runner Exception:', err);
  process.exit(1);
});

