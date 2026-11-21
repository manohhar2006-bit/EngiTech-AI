/**
 * EngiTrace EEID Evaluation Runner — Automated Test Suite (Task 4)
 *
 * Comprehensive tests covering all 17 required capabilities:
 * 1. Gold dataset loading
 * 2. Approval-state enforcement (rejects DRAFT, PENDING_HUMAN_REVIEW, REJECTED)
 * 3. Invalid record rejection (malformed JSON, missing IDs, schema violations)
 * 4. Dataset hashing (deterministic SHA-256 calculation)
 * 5. Repository and snapshot matching
 * 6. Session isolation (zero leakage of expected answer/claims, fresh session)
 * 7. Assistant adapter contract (endpoint URL, payload structure, HTTP methods)
 * 8. Response normalization (sanitization, claims, follow-ups)
 * 9. Evidence validation (precision & recall against repository context)
 * 10. Citation validation (resolution rate, valid links)
 * 11. Source anchor checking (half-open range [start, endExclusive))
 * 12. Historical cutoff validation (intercepts post-snapshot violations)
 * 13. Metric calculations (formulas, weighted composite score)
 * 14. Missing evidence handling ('NOT_AVAILABLE' handling)
 * 15. Execution failures and retries (bounded exponential backoff, error capture)
 * 16. Report generation (generates all 9 files, validates SHA256SUMS.txt)
 * 17. Reproducibility metadata (runId, timestamps, versions, environment)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  EvaluationRunner,
  GoldDatasetLoader,
  ApprovalVerifier,
  SessionManager,
  AssistantAdapter,
  DeterministicEvaluator,
  SemanticEvaluator,
  EvaluationEngine,
  MetricCalculator,
  MetricAggregator,
  ReportGenerator,
  DEFAULT_EVALUATION_CONFIG,
  EEIDRecordV2,
  QuestionExecutionResult
} from '../index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

export async function runAllTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('EngiTrace EEID Evaluation Runner — Test Suite');
  console.log('======================================================\n');

  const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
  const APPROVED_FIXTURE = path.join(FIXTURES_DIR, 'synthetic_approved_gold_records.jsonl');
  const UNAPPROVED_FIXTURE = path.join(FIXTURES_DIR, 'synthetic_unapproved_records.jsonl');
  const CORRUPTED_FIXTURE = path.join(FIXTURES_DIR, 'synthetic_corrupted_records.jsonl');

  // ============================================================================
  // Test 1: Gold dataset loading & record preservation (with test-fixture authorization)
  // ============================================================================
  console.log('--- Test 1: Gold Dataset Loading ---');
  const loadResult = GoldDatasetLoader.loadDataset({ datasetPath: APPROVED_FIXTURE, allowTestFixtures: true });
  assert(loadResult.approvedRecords.length === 2, `Test 1: Loaded 2 approved records (got ${loadResult.approvedRecords.length})`);
  assert(loadResult.rejectedRecords.length === 0, `Test 1: 0 rejected records from approved fixture (got ${loadResult.rejectedRecords.length})`);
  assert(loadResult.approvedRecords[0].recordId === 'EEID-SYNTH-001-NODE', 'Test 1: Record ID preserved');
  assert(loadResult.approvedRecords[0].repository.id === 'EEID-REPO-001', 'Test 1: Repository ID preserved');
  assert(loadResult.approvedRecords[0].expectedClaims.length === 2, 'Test 1: Expected claims preserved');
  assert(Boolean(loadResult.approvedRecords[0].expectedClaims[0].sourceAnchors), 'Test 1: Source anchors preserved');

  // ============================================================================
  // Test 2: Approval-state enforcement & Governance Safeguards
  // ============================================================================
  console.log('\n--- Test 2: Approval-State Enforcement & Governance Safeguards ---');

  // ----------------------------------------------------------------------------
  // Test 2.1: Legacy synthetic VERIFIED records are quarantined and rejected
  // ----------------------------------------------------------------------------
  const legacyDatasetPath = path.resolve(__dirname, '../../eeid/eeid_records.jsonl');
  if (fs.existsSync(legacyDatasetPath)) {
    console.log('• Testing legacy synthetic record quarantine (eeid/eeid_records.jsonl)...');
    const legacyLoad = GoldDatasetLoader.loadDataset({ datasetPath: legacyDatasetPath, allowTestFixtures: false });
    assert(legacyLoad.approvedRecords.length === 0, `Test 2.1: Legacy dataset yields exactly 0 approved records (got ${legacyLoad.approvedRecords.length})`);
    assert(legacyLoad.rejectedRecords.length === 5, `Test 2.1: All 5 legacy synthetic records quarantined and rejected (got ${legacyLoad.rejectedRecords.length})`);
    legacyLoad.rejectedRecords.forEach((rej) => {
      assert(
        rej.reason.includes('LEGACY_SYNTHETIC_PROVENANCE_UNVERIFIED'),
        `Test 2.1: Record ${rej.recordId} rejected with explicit reason LEGACY_SYNTHETIC_PROVENANCE_UNVERIFIED`
      );
    });
  }

  // ----------------------------------------------------------------------------
  // Test 2.2: Fake HUMAN_EXPERT metadata cannot bypass approval
  // ----------------------------------------------------------------------------
  console.log('• Testing fake HUMAN_EXPERT inline metadata bypass prevention...');
  const fakeHumanExpertRecord: EEIDRecordV2 = {
    recordId: 'EEID-FAKE-HUMAN-EXPERT-001',
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
    targetNode: { id: 'test', type: 'FUNCTION', label: 'test' },
    question: 'How does authentication work?',
    questionContext: {
      intent: 'test',
      difficulty: 'MEDIUM',
      interactionMode: 'NODE_INTELLIGENCE',
      requiresMultiFile: false,
      requiresHistory: false
    },
    contextInputs: { retrievalUnitIds: [], graphNodeIds: [], graphEdgeIds: [] },
    expectedAnswer: 'test answer',
    expectedClaims: [],
    annotationMetadata: {
      status: 'VERIFIED',
      annotatorType: 'HUMAN_EXPERT',
      author: 'Lead Systems Architect',
      verifiedAt: '2026-11-14T06:45:27.305Z',
      notes: 'Fabricated inline metadata attempting to bypass verification without dual signoff provenance'
    }
  };
  const fakeApprovalRes = ApprovalVerifier.verifyApproval(fakeHumanExpertRecord);
  assert(!fakeApprovalRes.isApproved, 'Test 2.2: Fake HUMAN_EXPERT metadata cannot bypass approval');
  assert(
    fakeApprovalRes.rejectionReason!.includes('LEGACY_SYNTHETIC_PROVENANCE_UNVERIFIED'),
    'Test 2.2: Rejection reason flags LEGACY_SYNTHETIC_PROVENANCE_UNVERIFIED'
  );

  // ----------------------------------------------------------------------------
  // Test 2.3: Missing independent reviewer signoffs cause rejection
  // ----------------------------------------------------------------------------
  console.log('• Testing missing or invalid independent reviewer signoffs...');
  // 2.3a: Zero reviewers
  const zeroReviewersRecord: EEIDRecordV2 = {
    ...fakeHumanExpertRecord,
    recordId: 'EEID-ZERO-REVIEWERS',
    approvalProvenance: {
      approvalStatus: 'APPROVED',
      reviewers: []
    }
  };
  const zeroRevRes = ApprovalVerifier.verifyApproval(zeroReviewersRecord);
  assert(!zeroRevRes.isApproved, 'Test 2.3a: Zero reviewer signoffs rejected');
  assert(zeroRevRes.rejectionReason!.includes('requires at least two independent human reviewer signoffs'), 'Test 2.3a: Flags missing dual reviewer requirement');

  // 2.3b: Single reviewer only
  const singleReviewerRecord: EEIDRecordV2 = {
    ...fakeHumanExpertRecord,
    recordId: 'EEID-SINGLE-REVIEWER',
    approvalProvenance: {
      approvalStatus: 'APPROVED',
      reviewers: [
        {
          reviewerId: 'REV-001',
          name: 'Dr. Jane Smith',
          title: 'Principal Systems Architect',
          organization: 'Benchmark Governance Institute',
          decision: 'ACCEPT',
          signedAt: '2026-11-20T10:00:00Z',
          signatureEvidence: 'SIG-SHA256-VALID-TOKEN-001',
          tier6SemanticSignoff: true
        }
      ]
    }
  };
  const singleRevRes = ApprovalVerifier.verifyApproval(singleReviewerRecord);
  assert(!singleRevRes.isApproved, 'Test 2.3b: Single reviewer signoff rejected');
  assert(singleRevRes.rejectionReason!.includes('requires at least two independent human reviewer signoffs'), 'Test 2.3b: Flags dual reviewer requirement');

  // 2.3c: Duplicate reviewers (reviewer independence failure)
  const duplicateReviewerRecord: EEIDRecordV2 = {
    ...fakeHumanExpertRecord,
    recordId: 'EEID-DUPLICATE-REVIEWERS',
    approvalProvenance: {
      approvalStatus: 'APPROVED',
      reviewers: [
        {
          reviewerId: 'REV-001',
          name: 'Dr. Jane Smith',
          title: 'Principal Systems Architect',
          organization: 'Benchmark Governance Institute',
          decision: 'ACCEPT',
          signedAt: '2026-11-20T10:00:00Z',
          signatureEvidence: 'SIG-SHA256-VALID-TOKEN-001',
          tier6SemanticSignoff: true
        },
        {
          reviewerId: 'REV-001',
          name: 'Dr. Jane Smith',
          title: 'Principal Systems Architect',
          organization: 'Benchmark Governance Institute',
          decision: 'ACCEPT',
          signedAt: '2026-11-20T10:05:00Z',
          signatureEvidence: 'SIG-SHA256-VALID-TOKEN-002',
          tier6SemanticSignoff: true
        }
      ]
    }
  };
  const dupRevRes = ApprovalVerifier.verifyApproval(duplicateReviewerRecord);
  assert(!dupRevRes.isApproved, 'Test 2.3c: Duplicate reviewer identity rejected');
  assert(dupRevRes.rejectionReason!.includes('fails reviewer independence'), 'Test 2.3c: Flags reviewer independence failure');

  // 2.3d: Missing signoff signature evidence
  const missingSigRecord: EEIDRecordV2 = {
    ...fakeHumanExpertRecord,
    recordId: 'EEID-MISSING-SIG',
    approvalProvenance: {
      approvalStatus: 'APPROVED',
      reviewers: [
        {
          reviewerId: 'REV-001',
          name: 'Dr. Jane Smith',
          title: 'Principal Systems Architect',
          organization: 'Benchmark Governance Institute',
          decision: 'ACCEPT',
          signedAt: '2026-11-20T10:00:00Z',
          signatureEvidence: '',
          tier6SemanticSignoff: true
        },
        {
          reviewerId: 'REV-002',
          name: 'Marcus Vance',
          title: 'Staff Knowledge Graph Engineer',
          organization: 'Evaluation Standards Board',
          decision: 'ACCEPT',
          signedAt: '2026-11-20T10:05:00Z',
          signatureEvidence: 'SIG-SHA256-VALID-TOKEN-002',
          tier6SemanticSignoff: true
        }
      ]
    }
  };
  const missingSigRes = ApprovalVerifier.verifyApproval(missingSigRecord);
  assert(!missingSigRes.isApproved, 'Test 2.3d: Missing signoff evidence rejected');
  assert(missingSigRes.rejectionReason!.includes('lacks verifiable signoff evidence'), 'Test 2.3d: Flags missing signoff evidence');

  // 2.3e: Non-ACCEPT review decision
  const nonAcceptRecord: EEIDRecordV2 = {
    ...fakeHumanExpertRecord,
    recordId: 'EEID-NON-ACCEPT-DECISION',
    approvalProvenance: {
      approvalStatus: 'APPROVED',
      reviewers: [
        {
          reviewerId: 'REV-001',
          name: 'Dr. Jane Smith',
          title: 'Principal Systems Architect',
          organization: 'Benchmark Governance Institute',
          decision: 'CHANGES_REQUESTED',
          signedAt: '2026-11-20T10:00:00Z',
          signatureEvidence: 'SIG-SHA256-VALID-TOKEN-001',
          tier6SemanticSignoff: true
        },
        {
          reviewerId: 'REV-002',
          name: 'Marcus Vance',
          title: 'Staff Knowledge Graph Engineer',
          organization: 'Evaluation Standards Board',
          decision: 'ACCEPT',
          signedAt: '2026-11-20T10:05:00Z',
          signatureEvidence: 'SIG-SHA256-VALID-TOKEN-002',
          tier6SemanticSignoff: true
        }
      ]
    }
  };
  const nonAcceptRes = ApprovalVerifier.verifyApproval(nonAcceptRecord);
  assert(!nonAcceptRes.isApproved, 'Test 2.3e: Non-ACCEPT decision rejected');
  assert(nonAcceptRes.rejectionReason!.includes('expected "ACCEPT"'), 'Test 2.3e: Flags non-ACCEPT decision');

  // 2.3f: Missing Tier 6 semantic entailment signoff
  const missingTier6Record: EEIDRecordV2 = {
    ...fakeHumanExpertRecord,
    recordId: 'EEID-MISSING-TIER6-SIGNOFF',
    approvalProvenance: {
      approvalStatus: 'APPROVED',
      reviewers: [
        {
          reviewerId: 'REV-001',
          name: 'Dr. Jane Smith',
          title: 'Principal Systems Architect',
          organization: 'Benchmark Governance Institute',
          decision: 'ACCEPT',
          signedAt: '2026-11-20T10:00:00Z',
          signatureEvidence: 'SIG-SHA256-VALID-TOKEN-001',
          tier6SemanticSignoff: false
        },
        {
          reviewerId: 'REV-002',
          name: 'Marcus Vance',
          title: 'Staff Knowledge Graph Engineer',
          organization: 'Evaluation Standards Board',
          decision: 'ACCEPT',
          signedAt: '2026-11-20T10:05:00Z',
          signatureEvidence: 'SIG-SHA256-VALID-TOKEN-002',
          tier6SemanticSignoff: true
        }
      ]
    }
  };
  const missingTier6Res = ApprovalVerifier.verifyApproval(missingTier6Record);
  assert(!missingTier6Res.isApproved, 'Test 2.3f: Missing Tier 6 semantic signoff rejected');
  assert(missingTier6Res.rejectionReason!.includes('Tier 6 semantic claim entailment sign-off'), 'Test 2.3f: Flags missing Tier 6 signoff');

  // ----------------------------------------------------------------------------
  // Test 2.4: DRAFT records remain rejected
  // ----------------------------------------------------------------------------
  console.log('• Testing DRAFT and proposal rejection...');
  const unapprovedLoad = GoldDatasetLoader.loadDataset({ datasetPath: UNAPPROVED_FIXTURE });
  assert(unapprovedLoad.approvedRecords.length === 0, `Test 2.4: Exactly 0 approved records loaded from unapproved fixture (got ${unapprovedLoad.approvedRecords.length})`);
  assert(unapprovedLoad.rejectedRecords.length === 4, `Test 2.4: Exactly 4 unapproved records rejected (got ${unapprovedLoad.rejectedRecords.length})`);

  const draftRej = unapprovedLoad.rejectedRecords.find((r) => r.recordId === 'EEID-UNAPP-001-DRAFT');
  assert(Boolean(draftRej && draftRej.reason.includes('DRAFT')), 'Test 2.4: DRAFT record rejected with explicit DRAFT reason');

  const pendingRej = unapprovedLoad.rejectedRecords.find((r) => r.recordId === 'EEID-UNAPP-002-PENDING');
  assert(Boolean(pendingRej && pendingRej.reason.includes('PENDING_HUMAN_REVIEW')), 'Test 2.4: PENDING_HUMAN_REVIEW record rejected with proposal reason');

  const rejectedRej = unapprovedLoad.rejectedRecords.find((r) => r.recordId === 'EEID-UNAPP-003-REJECTED');
  assert(Boolean(rejectedRej && rejectedRej.reason.includes('REJECTED')), 'Test 2.4: REJECTED record rejected');

  const missingTsRej = unapprovedLoad.rejectedRecords.find((r) => r.recordId === 'EEID-UNAPP-004-MISSING-TIMESTAMP');
  assert(Boolean(missingTsRej && missingTsRej.reason.includes('verifiedAt')), 'Test 2.4: Record missing RFC3339 verifiedAt rejected');

  // Invariant verification on actual Task 3 v4.2.5 proposal
  const task3ProposalPath = path.resolve(__dirname, '../../eeid/task3-remediation-proposal-v4.2.5/RECORD_PATCHES_V4_2_5.jsonl');
  if (fs.existsSync(task3ProposalPath)) {
    const proposalLoad = GoldDatasetLoader.loadDataset({ datasetPath: task3ProposalPath });
    assert(proposalLoad.approvedRecords.length === 0, 'Test 2.4: Task 3 proposal has 0 approved records (all remain in DRAFT / PENDING_HUMAN_REVIEW)');
    assert(proposalLoad.rejectedRecords.length === 5, 'Test 2.4: All 5 Task 3 proposed records correctly rejected until formal human sign-off');
  }

  // ----------------------------------------------------------------------------
  // Test 2.5: Genuine fully approved records pass when all required provenance is present
  // ----------------------------------------------------------------------------
  console.log('• Testing genuine fully approved record verification...');
  const genuineApprovedRecord: EEIDRecordV2 = {
    ...fakeHumanExpertRecord,
    recordId: 'EEID-GENUINE-APPROVED-001',
    approvalProvenance: {
      approvalStatus: 'APPROVED',
      reviewers: [
        {
          reviewerId: 'REV-GENUINE-001',
          name: 'Dr. Jane Smith',
          title: 'Principal Systems Architect',
          organization: 'International Software Governance Standards',
          decision: 'ACCEPT',
          signedAt: '2026-11-20T10:00:00Z',
          signatureEvidence: 'SIG-SHA256-GENUINE-REV001-JANE-SMITH-ACCEPTED',
          tier6SemanticSignoff: true
        },
        {
          reviewerId: 'REV-GENUINE-002',
          name: 'Marcus Vance',
          title: 'Staff Knowledge Graph Engineer',
          organization: 'Evaluation Standards Board',
          decision: 'ACCEPT',
          signedAt: '2026-11-20T10:15:00Z',
          signatureEvidence: 'SIG-SHA256-GENUINE-REV002-MARCUS-VANCE-ACCEPTED',
          tier6SemanticSignoff: true
        }
      ]
    }
  };
  const genuineRes = ApprovalVerifier.verifyApproval(genuineApprovedRecord);
  assert(genuineRes.isApproved === true, 'Test 2.5: Genuine fully approved record passes verification');
  assert(genuineRes.status === 'VERIFIED', 'Test 2.5: Record status is VERIFIED');
  assert(Boolean(genuineRes.approvalProvenance), 'Test 2.5: Approval provenance verified');

  // ----------------------------------------------------------------------------
  // Test 2.6: Synthetic fixtures remain test-only
  // ----------------------------------------------------------------------------
  console.log('• Testing synthetic fixtures remain test-only...');
  const benchmarkLoadOfFixture = GoldDatasetLoader.loadDataset({
    datasetPath: APPROVED_FIXTURE,
    allowTestFixtures: false // Default benchmark execution mode
  });
  assert(benchmarkLoadOfFixture.approvedRecords.length === 0, `Test 2.6: Synthetic fixture yields 0 approved records in production/benchmark mode (got ${benchmarkLoadOfFixture.approvedRecords.length})`);
  assert(benchmarkLoadOfFixture.rejectedRecords.length === 2, `Test 2.6: Both synthetic fixture records rejected in benchmark mode (got ${benchmarkLoadOfFixture.rejectedRecords.length})`);
  assert(benchmarkLoadOfFixture.rejectedRecords[0].reason.includes('SYNTHETIC_FIXTURE_TEST_ONLY'), 'Test 2.6: Rejection reason flags SYNTHETIC_FIXTURE_TEST_ONLY');

  const testLoadOfFixture = GoldDatasetLoader.loadDataset({
    datasetPath: APPROVED_FIXTURE,
    allowTestFixtures: true // Explicit unit test mode
  });
  assert(testLoadOfFixture.approvedRecords.length === 2, 'Test 2.6: Synthetic fixture permitted when allowTestFixtures: true');
  assert(testLoadOfFixture.rejectedRecords.length === 0, 'Test 2.6: Zero rejections in test fixture mode');

  // ============================================================================
  // Test 3: Invalid record rejection
  // ============================================================================
  console.log('\n--- Test 3: Invalid Record Rejection ---');
  const corruptLoad = GoldDatasetLoader.loadDataset({ datasetPath: CORRUPTED_FIXTURE });
  assert(corruptLoad.approvedRecords.length === 0, 'Test 3: Corrupt fixture yields 0 approved records');
  assert(corruptLoad.rejectedRecords.length === 3, 'Test 3: All 3 corrupt records rejected');
  assert(corruptLoad.rejectedRecords[0].reason.includes('Invalid JSON'), 'Test 3: Malformed JSON syntax detected');
  assert(corruptLoad.rejectedRecords[1].reason.includes('missing required "recordId"'), 'Test 3: Missing recordId detected');
  assert(corruptLoad.rejectedRecords[2].reason.includes('annotationMetadata'), 'Test 3: Schema violation detected');

  // ============================================================================
  // Test 4: Dataset Hashing
  // ============================================================================
  console.log('\n--- Test 4: Dataset SHA-256 Hashing ---');
  const hash1 = GoldDatasetLoader.computeFileSha256(APPROVED_FIXTURE);
  const hash2 = GoldDatasetLoader.computeFileSha256(APPROVED_FIXTURE);
  assert(hash1 === hash2, 'Test 4: SHA-256 is deterministic');
  assert(hash1.length === 64, 'Test 4: SHA-256 is 64 hex characters');
  assert(loadResult.datasetSha256 === hash1, 'Test 4: Loading result captures dataset SHA-256');

  // ============================================================================
  // Test 5: Repository & Snapshot Matching
  // ============================================================================
  console.log('\n--- Test 5: Repository and Snapshot Matching ---');
  const rec1 = loadResult.approvedRecords[0];
  assert(rec1.repository.commitSha === '43fca52d28a422c8be48fd489cbd4f2d6152bab6', 'Test 5: Commit SHA matches pinned snapshot');
  assert(rec1.repository.snapshotTimestamp === '2026-11-02T20:15:26Z', 'Test 5: Snapshot timestamp is RFC3339');

  // ============================================================================
  // Test 6: Session Isolation
  // ============================================================================
  console.log('\n--- Test 6: Session Isolation ---');
  const isolatedPayload = SessionManager.createIsolatedSession(rec1);
  assert(isolatedPayload.nodeId === rec1.targetNode.id, 'Test 6: Node ID correctly mapped');
  assert(isolatedPayload.analysisType === 'WHY', 'Test 6: Analysis type inferred as WHY');
  assert(isolatedPayload.messages.length === 1, 'Test 6: Exactly 1 single-turn message');
  assert(isolatedPayload.messages[0].content === rec1.question, 'Test 6: User content matches question');
  // Invariant check: Expected answer and claims NEVER exposed in request payload
  const payloadStr = JSON.stringify(isolatedPayload);
  assert(!payloadStr.includes(rec1.expectedAnswer), 'Test 6: INVARIANT: Expected gold answer NEVER present in assistant request payload');
  rec1.expectedClaims.forEach((c) => {
    assert(!payloadStr.includes(c.text), `Test 6: INVARIANT: Gold claim "${c.claimId}" NEVER present in assistant request payload`);
  });

  // ============================================================================
  // Test 7 & 8: Assistant Adapter Contract & Response Normalization
  // ============================================================================
  console.log('\n--- Test 7 & 8: Assistant Adapter Contract & Normalization ---');
  let capturedUrl = '';
  let capturedMethod = '';
  let capturedBody: any = null;

  const mockFetch: typeof fetch = async (url, init) => {
    capturedUrl = url.toString();
    capturedMethod = init?.method || '';
    capturedBody = JSON.parse(init?.body as string);

    return new Response(
      JSON.stringify({
        answer: 'The authenticate() function verifies user credentials using pbkdf2-password.',
        claims: [
          {
            text: 'authenticate() verifies credentials with pbkdf2-password.',
            classification: 'FACT',
            evidenceIds: ['EEID-REPO-001-RU-0074'],
            sourceUrls: ['https://github.com/expressjs/express/blob/43fca52/examples/auth/index.js#L60-L74']
          }
        ],
        suggestedFollowUps: ['How is hashing configured?'],
        provider: 'GEMINI',
        model: 'gemini-3.6-flash',
        isFallback: false
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const adapter = new AssistantAdapter({
    backendUrl: 'http://localhost:4000/api/v1',
    fetchFn: mockFetch
  });

  const executionRes = await adapter.executeQuestion(rec1);
  assert(capturedUrl === 'http://localhost:4000/api/v1/repositories/EEID-REPO-001/chat', 'Test 7: Adapter calls correct repository chat endpoint');
  assert(capturedMethod === 'POST', 'Test 7: Adapter uses HTTP POST');
  assert(capturedBody.nodeId === rec1.targetNode.id, 'Test 7: Request payload has correct nodeId');
  assert(executionRes.success === true, 'Test 8: Execution success is true');
  assert(executionRes.httpStatus === 200, 'Test 8: HTTP status 200 captured');
  assert(executionRes.latencyMs >= 0, 'Test 8: Non-negative latency captured');
  assert(executionRes.rawResponse?.claims.length === 1, 'Test 8: Normalized 1 claim');
  assert(executionRes.rawResponse?.provider === 'GEMINI', 'Test 8: Provider normalized');

  // ============================================================================
  // Test 9 & 10: Evidence Validation & Citation Quality
  // ============================================================================
  console.log('\n--- Test 9 & 10: Evidence Validation & Citation Quality ---');
  const deterministicEvaluator = new DeterministicEvaluator();
  const detResult = deterministicEvaluator.evaluate(rec1, executionRes);

  assert(detResult.executionSuccess === true, 'Test 9: Deterministic check records execution success');
  assert(detResult.evidenceGrounding.validEvidenceIds.length === 1, 'Test 9: Valid evidence ID identified');
  assert(detResult.evidenceGrounding.precision === 1.0, `Test 9: Evidence precision is 1.0 (got ${detResult.evidenceGrounding.precision})`);
  assert(detResult.evidenceGrounding.expectedEvidenceIdsFound.includes('EEID-REPO-001-RU-0074'), 'Test 9: Expected evidence ID found in recall check');
  assert(detResult.citationQuality.resolvedCitations === 1, 'Test 10: Citation resolved to repository source');
  assert(detResult.citationQuality.resolutionRate === 1.0, 'Test 10: Citation resolution rate is 1.0');

  // ============================================================================
  // Test 11: Source Anchor Checking
  // ============================================================================
  console.log('\n--- Test 11: Source Anchor Checking ---');
  const anchor = rec1.expectedClaims[0].sourceAnchors[0];
  assert(anchor.sourceLineStart === 60, 'Test 11: 1-based start line is 60');
  assert(anchor.sourceLineEndExclusive === 74, 'Test 11: 1-based exclusive end line is 74');
  assert(anchor.sourceLineStart < anchor.sourceLineEndExclusive, 'Test 11: Interval is valid half-open interval [60, 74)');
  assert(/^[a-f0-9]{64}$/.test(anchor.contentHash), 'Test 11: Content hash is valid 64-hex SHA-256');

  // ============================================================================
  // Test 12: Historical Cutoff Validation
  // ============================================================================
  console.log('\n--- Test 12: Historical Cutoff Validation ---');
  const histRec = loadResult.approvedRecords[1];

  // Scenario A: Assistant respects cutoff
  const cleanExecution: QuestionExecutionResult = {
    recordId: histRec.recordId,
    repositoryId: histRec.repository.id,
    endpointUrl: 'http://localhost:4000/api/v1/repositories/EEID-REPO-001/chat',
    requestPayload: SessionManager.createIsolatedSession(histRec),
    rawResponse: {
      answer: 'Commit 43fca52 bumped body-parser to ^2.4.0 in PR #7563.',
      claims: [
        {
          text: 'Commit 43fca52 updated body-parser ^2.4.0 in PR #7563.',
          classification: 'FACT',
          evidenceIds: ['EEID-REPO-001-RU-0001']
        }
      ],
      provider: 'GEMINI'
    },
    httpStatus: 200,
    latencyMs: 120,
    attempts: 1,
    executedAt: new Date().toISOString(),
    success: true
  };

  const cleanDet = deterministicEvaluator.evaluate(histRec, cleanExecution);
  assert(cleanDet.historicalReasoning.respectsCutoff === true, 'Test 12: Clean historical answer respects cutoff');
  assert(cleanDet.historicalReasoning.postSnapshotViolations.length === 0, 'Test 12: Zero post-snapshot violations');

  // Scenario B: Assistant violates cutoff by asserting post-snapshot issue closure as pre-snapshot fact
  const violatingExecution: QuestionExecutionResult = {
    ...cleanExecution,
    rawResponse: {
      answer: 'Commit 43fca52 closed issue 7562.',
      claims: [
        {
          text: 'Commit 43fca52 closed issue 7562 at the snapshot.',
          classification: 'FACT',
          evidenceIds: ['issue-7562']
        }
      ],
      provider: 'GEMINI'
    }
  };
  const violatingDet = deterministicEvaluator.evaluate(histRec, violatingExecution);
  assert(violatingDet.historicalReasoning.respectsCutoff === false, 'Test 12: Historical cutoff violation intercepted when post-snapshot closure asserted as pre-snapshot fact');
  assert(violatingDet.historicalReasoning.postSnapshotViolations.length > 0, 'Test 12: Post-snapshot violation recorded in report');

  // ============================================================================
  // Test 13: Metric Calculations & Composite Score
  // ============================================================================
  console.log('\n--- Test 13: Metric Calculations & Composite Score ---');
  const engine = new EvaluationEngine({
    config: DEFAULT_EVALUATION_CONFIG,
    semanticOptions: {
      customJudgeFn: async () => ({
        claims: [
          {
            goldClaimId: 'CLM-SYNTH-01',
            goldClaimText: 'Text',
            expectedClassification: 'FACT',
            status: 'SUPPORTED',
            similarityScore: 0.95,
            rationale: 'Mock match'
          }
        ],
        coverage: 0.95,
        contradictionRate: 0.0,
        score: 0.95
      })
    }
  });

  const evalRecordResult = await engine.evaluateRecord(rec1, executionRes);
  assert(evalRecordResult.passedOverall === true, 'Test 13: Record passed overall evaluation');
  assert(typeof evalRecordResult.overallScore === 'number' && evalRecordResult.overallScore >= 0.70, `Test 13: Overall score is >= 0.70 (got ${evalRecordResult.overallScore})`);

  // ============================================================================
  // Test 14: Missing Evidence Handling (NOT_AVAILABLE)
  // ============================================================================
  console.log('\n--- Test 14: Missing Evidence Handling (NOT_AVAILABLE) ---');
  const noEvidenceExecution: QuestionExecutionResult = {
    ...executionRes,
    rawResponse: {
      answer: 'General explanation without claims.',
      claims: [],
      provider: 'LOCAL_FALLBACK'
    }
  };
  const noEvDet = deterministicEvaluator.evaluate(rec1, noEvidenceExecution);
  assert(noEvDet.evidenceGrounding.precision === 'NOT_AVAILABLE', 'Test 14: Precision marked NOT_AVAILABLE when assistant cites zero evidence');
  assert(noEvDet.citationQuality.resolutionRate === 'NOT_AVAILABLE', 'Test 14: Citation resolution marked NOT_AVAILABLE when zero citations present');

  // ============================================================================
  // Test 15: Execution Failures & Bounded Retries
  // ============================================================================
  console.log('\n--- Test 15: Execution Failures & Bounded Retries ---');
  let retryCounter = 0;
  const failingFetch: typeof fetch = async () => {
    retryCounter++;
    return new Response('Service Unavailable', { status: 503 });
  };

  const failingAdapter = new AssistantAdapter({
    backendUrl: 'http://localhost:4000/api/v1',
    maxRetries: 3,
    retryDelayMs: 10,
    fetchFn: failingFetch
  });

  const failExecRes = await failingAdapter.executeQuestion(rec1);
  assert(failExecRes.success === false, 'Test 15: Execution reports failure');
  assert(failExecRes.attempts === 3, `Test 15: Exactly 3 retry attempts executed (got ${failExecRes.attempts})`);
  assert(retryCounter === 3, `Test 15: fetch called exactly 3 times (got ${retryCounter})`);
  assert(failExecRes.httpStatus === 503, 'Test 15: HTTP 503 captured');
  assert(Boolean(failExecRes.errorMessage), 'Test 15: Error message captured');

  // ============================================================================
  // Test 16: Report Generation & SHA-256 Checksums
  // ============================================================================
  console.log('\n--- Test 16: Report Generation & SHA256SUMS.txt ---');
  const testOutputDir = path.resolve(__dirname, '../../scratch/test_evaluation_runs');
  const reporter = new ReportGenerator({ outputBaseDir: testOutputDir });

  const testRunId = `test-eval-${Date.now()}`;
  const testAggregate = MetricAggregator.aggregate(testRunId, [evalRecordResult], DEFAULT_EVALUATION_CONFIG);

  const testManifest = {
    runId: testRunId,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 500,
    goldDataset: {
      path: APPROVED_FIXTURE,
      sha256: hash1,
      version: 'v4.2.5',
      totalRecords: 2,
      approvedRecords: 1,
      rejectedRecords: 0
    },
    repositoriesEvaluated: [{ repositoryId: 'EEID-REPO-001', name: 'express', commitSha: '43fca52', snapshotTimestamp: '2026-11-02T20:15:26Z' }],
    engitraceApp: { backendUrl: 'http://localhost:4000/api/v1', backendStatus: 'ONLINE' },
    runnerEnvironment: { nodeVersion: process.version, platform: 'test', runnerVersion: '1.0.0' },
    evaluationMethod: { mode: 'full' as const, deterministicRulesVersion: 'v4.2.5' },
    totalQuestions: 1,
    successfulQuestions: 1,
    failedQuestions: 0,
    passedThresholds: true
  };

  const { runDirectory, generatedFiles } = reporter.generateReports(testManifest, testAggregate, [evalRecordResult]);
  assert(fs.existsSync(runDirectory), 'Test 16: Run directory created on disk');
  assert(generatedFiles.length === 9, `Test 16: Exactly 9 output files generated (got ${generatedFiles.length})`);

  // Verify all 9 files exist on disk
  const expectedFiles = [
    'run_manifest.json',
    'per_record_results.jsonl',
    'raw_assistant_responses.jsonl',
    'deterministic_metrics.json',
    'semantic_evaluation.jsonl',
    'aggregate_metrics.json',
    'failure_analysis.json',
    'EEID_EVALUATION_REPORT.md',
    'SHA256SUMS.txt'
  ];

  expectedFiles.forEach((fileName) => {
    const filePath = path.join(runDirectory, fileName);
    assert(fs.existsSync(filePath), `Test 16: File "${fileName}" exists on disk`);
  });

  // Verify SHA256SUMS.txt integrity
  const sha256Content = fs.readFileSync(path.join(runDirectory, 'SHA256SUMS.txt'), 'utf8');
  const shaLines = sha256Content.trim().split('\n');
  assert(shaLines.length === 8, `Test 16: SHA256SUMS.txt has checksums for all 8 sibling files (got ${shaLines.length})`);

  shaLines.forEach((line) => {
    const [hash, file] = line.trim().split(/\s+/);
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(runDirectory, file))).digest('hex');
    assert(hash === actualHash, `Test 16: Checksum match for ${file}`);
  });

  // Clean up test run directory
  fs.rmSync(runDirectory, { recursive: true, force: true });

  // ============================================================================
  // Test 17: Reproducibility Metadata
  // ============================================================================
  console.log('\n--- Test 17: Reproducibility Metadata ---');
  const generatedRunId = EvaluationRunner.generateRunId();
  assert(/^eval-\d{14}-[a-f0-9]{6}$/.test(generatedRunId), `Test 17: Run ID format is sortable and unique (${generatedRunId})`);
  assert(DEFAULT_EVALUATION_CONFIG.version === '1.0.0', 'Test 17: Evaluation config version is pinned');
  assert(Boolean(DEFAULT_EVALUATION_CONFIG.thresholds), 'Test 17: Pass thresholds are declared');

  // ============================================================================
  // Test 18: Provider Authentication Failure & Configuration Required Handling
  // ============================================================================
  console.log('\n--- Test 18: Provider Configuration Required Handling ---');
  const authErrorFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        answer: '⚠️ **Gemini Authentication Failed** (HTTP 401: API_KEY_INVALID)\n\nThe configured GEMINI_API_KEY was rejected by Google Generative AI.',
        claims: [],
        error: 'GEMINI_AUTH_ERROR',
        provider: 'GEMINI_ERROR',
        isFallback: true
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const authErrorAdapter = new AssistantAdapter({
    backendUrl: 'http://localhost:4000/api/v1',
    fetchFn: authErrorFetch
  });

  const authExecRes = await authErrorAdapter.executeQuestion(rec1);
  assert(authExecRes.success === true, 'Test 18: Backend HTTP communication succeeded (HTTP 200)');
  assert(authExecRes.httpSuccess === true, 'Test 18: httpSuccess is true');
  assert(authExecRes.providerStatus === 'PROVIDER_CONFIGURATION_REQUIRED', 'Test 18: providerStatus is PROVIDER_CONFIGURATION_REQUIRED');
  assert(authExecRes.genuineAiResponse === false, 'Test 18: genuineAiResponse is false (no AI hallucination)');
  assert(authExecRes.providerConfigured === false, 'Test 18: providerConfigured is false');

  const authDetRes = deterministicEvaluator.evaluate(rec1, authExecRes);
  assert(authDetRes.deterministicScore === 'NOT_AVAILABLE', 'Test 18: Deterministic score marked NOT_AVAILABLE');
  assert(authDetRes.evidenceGrounding.precision === 'NOT_AVAILABLE', 'Test 18: Evidence precision marked NOT_AVAILABLE');
  assert(authDetRes.evidenceGrounding.recall === 'NOT_AVAILABLE', 'Test 18: Evidence recall marked NOT_AVAILABLE');
  assert(authDetRes.deterministicChecksPassed === true, 'Test 18: Deterministic checks passed (not penalized)');

  const authSemanticEvaluator = new SemanticEvaluator({ config: DEFAULT_EVALUATION_CONFIG });
  const authSemRes = await authSemanticEvaluator.evaluate(rec1, authExecRes);
  assert(authSemRes.method === 'SKIPPED', 'Test 18: Semantic evaluation method is SKIPPED');
  assert(authSemRes.claimCoverage === 'NOT_AVAILABLE', 'Test 18: Claim coverage marked NOT_AVAILABLE');
  assert(authSemRes.overallSemanticScore === 'NOT_AVAILABLE', 'Test 18: Semantic overall score marked NOT_AVAILABLE');

  const authRecordEval = await engine.evaluateRecord(rec1, authExecRes);
  assert(authRecordEval.status === 'PROVIDER_CONFIGURATION_REQUIRED', 'Test 18: Record status is PROVIDER_CONFIGURATION_REQUIRED');
  assert(authRecordEval.overallScore === 'NOT_AVAILABLE', 'Test 18: Record overallScore is NOT_AVAILABLE');
  assert(authRecordEval.passedOverall === true, 'Test 18: Record passedOverall is true (no defect failure)');

  const authAggregate = MetricAggregator.aggregate('test-auth-run', [authRecordEval], DEFAULT_EVALUATION_CONFIG);
  assert(authAggregate.providerStatus === 'PROVIDER_CONFIGURATION_REQUIRED', 'Test 18: Aggregate providerStatus is PROVIDER_CONFIGURATION_REQUIRED');
  assert(authAggregate.genuineAiQuestions === 0, 'Test 18: Zero genuine AI questions recorded');
  assert(authAggregate.providerConfigurationRequiredQuestions === 1, 'Test 18: Exactly 1 providerConfigurationRequiredQuestion recorded');
  assert(authAggregate.thresholdResults.providerConfigurationRequired === true, 'Test 18: Threshold results flag providerConfigurationRequired');
  assert(authAggregate.thresholdResults.passed === true, 'Test 18: Threshold results passed (answer scoring cleanly deferred)');
  assert(authAggregate.thresholdResults.failingThresholds.length === 0, 'Test 18: Zero failing thresholds from unconfigured provider');

  console.log('\n======================================================');
  console.log('✅ ALL 18 EEID EVALUATION RUNNER TESTS PASSED CLEANLY');
  console.log('======================================================\n');
}

runAllTests().catch((err) => {
  console.error('\n❌ Uncaught error during evaluator tests:', err);
  process.exit(1);
});
