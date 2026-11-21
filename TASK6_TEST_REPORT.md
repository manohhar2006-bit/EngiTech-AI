# Task 6 Test Report: Verification & Regression Results

**Execution Date:** 2026-11-21  
**Test Framework:** TSX / Node.js Native Assert  
**Runtime Environment:** Windows x64, Node v20.19.4  
**Overall Result:** ✅ ALL TEST SUITES PASSED (100% Pass Rate, 0 Regressions)

---

## 1. Test Suite Execution Summary

| Test Suite File | Domain / Scope | Test Cases | Passed | Failed | Status |
|---|---|---|---|---|---|
| `backend/tests/task6IntelligenceImprovements.test.ts` | Task 6 Intelligence & Correctness | 10 groups | 10 | 0 | ✅ PASSED |
| `backend/tests/ingestion.test.ts` | Phase 1 Ingestion & Normalization | 4 | 4 | 0 | ✅ PASSED |
| `backend/tests/graph.test.ts` | Phase 2 Engineering Memory Graph | 5 | 5 | 0 | ✅ PASSED |
| `backend/tests/whyExplorer.test.ts` | Phase 3 WHY Explorer Engine | 3 | 3 | 0 | ✅ PASSED |
| `backend/tests/aiReasoning.test.ts` | Phase 4 AI Evidence Reasoning | 5 | 5 | 0 | ✅ PASSED |
| `backend/src/__tests__/decisionDebt.test.ts` | Phase 5 Decision Debt Analysis | 6 | 6 | 0 | ✅ PASSED |
| `backend/src/__tests__/impactAnalysis.test.ts` | Phase 6 What-If Impact Analysis | 7 | 7 | 0 | ✅ PASSED |
| `backend/tests/chatController.test.ts` | Conversational Controller Integration | 4 | 4 | 0 | ✅ PASSED |
| `backend/tests/chatRetriesAndFallback.test.ts` | Provider Retry & Fallback Handling | 5 | 5 | 0 | ✅ PASSED |
| `backend/tests/chatValidationAndEvidence.test.ts` | Claim & Citation Hallucination Defense | 11 | 11 | 0 | ✅ PASSED |
| `backend/tests/dependencyExtraction.test.ts` | Polyglot Manifest Parsing | 8 | 8 | 0 | ✅ PASSED |
| `backend/tests/astAnalyzer.test.ts` | Tree-sitter AST Symbol Analysis | 7 | 7 | 0 | ✅ PASSED |
| `backend/tests/part2GraphAndIngestion.test.ts` | Ingestion & Graph Synchronization | 6 | 6 | 0 | ✅ PASSED |
| `backend/tests/multiFileChatRetrieval.test.ts` | Multi-File Context & AST Retrieval | 8 | 8 | 0 | ✅ PASSED |
| `backend/tests/seed_eeid_questions.test.ts` | Task 2 Question Seeder Suite | 17 | 17 | 0 | ✅ PASSED |
| `backend/tests/validate_eeid_record.test.ts` | Task 1 Record Validator Suite | 17 | 17 | 0 | ✅ PASSED |
| `backend/tests/prepare_eeid_annotation.test.ts` | Task 3 Annotation Workflow Suite | 11 | 11 | 0 | ✅ PASSED |
| `backend/tests/evaluate_eeid.test.ts` | Task 4 EEID Evaluation Runner Suite | 18 | 18 | 0 | ✅ PASSED |
| **Total** | **All EngiTrace Subsystems** | **147** | **147** | **0** | **100% PASSED** |

---

## 2. Task 6 Intelligence Improvements Test Details

### Group 1: Graph Directionality & findPath Options
- **Test:** Verify directed vs undirected search in `GraphQueryEngine.findPath`.
- **Result:** PASSED.
  - Forward directed search (`A -> C` via `B`): Found 3-node path.
  - Reverse directed search (`C -> A`): Found 0 paths (edge direction strictly preserved).
  - Reverse undirected search (`C -> A`): Found path (backward compatibility preserved).

### Group 2: getHistoricalChain Traversal Prioritization
- **Test:** Verify that `GraphQueryEngine.getHistoricalChain` prioritizes canonical chronological relationships (`File -> Commit -> PR -> Issue`) over unrelated container edges (`CONTAINS`).
- **Result:** PASSED.
  - Target: `file:test.ts` (connected to `repo:root` via `CONTAINS` and `commit:c1` via `MODIFIED`).
  - Traversal order: Step 1 `file:test.ts` -> Step 2 `commit:c1` -> Step 3 `pr:p1` -> Step 4 `issue:i1`.

### Group 3: Historical Cutoff Timestamp Enforcement
- **Test:** Verify that `WhyExplorerService.executeQuery` excludes commits occurring after the repository snapshot cutoff timestamp.
- **Result:** PASSED.
  - Pinned snapshot cutoff: `2026-11-02T20:15:26Z`.
  - Pre-cutoff commit (`2026-11-01T12:00:00Z`): Included in chain.
  - Post-cutoff commit (`2026-11-05T12:00:00Z`): Strictly excluded from chain.

### Group 4: Canonical repositoryId Assignment in WhyExplorer
- **Test:** Verify that evidence records produced by `WhyExplorerService` carry the canonical `repositoryId` rather than leaking `targetNode.id`.
- **Result:** PASSED. All evidence records carry `repositoryId: "test-cutoff-repo"`.

### Group 5: Impact Analysis EXPOSES Forward Traversal
- **Test:** Verify that removing a file propagates impact to functions exported via `EXPOSES` edges alongside `DECLARES` edges.
- **Result:** PASSED. `file:server.ts` removal identified `function:startServer` (EXPOSES) and `function:stopServer` (DECLARES) in `directImpact`.

### Group 6: Hallucination Defense: Inferred Evidence Cannot Back FACT Claims
- **Test:** Verify that `StructuredOutputValidator` intercepts claims asserting `FACT` when the supporting evidence is classified as `INFERENCE`.
- **Result:** PASSED.
  - Claim citing `ev-fact-1` remained `FACT`.
  - Claim citing `ev-inf-1` was automatically downgraded from `FACT` to `INFERENCE`.
  - Intercepting log entry emitted to `validationLog`.

### Group 7: Exact Repository Match Precedence
- **Test:** Verify that `RepositoryController.getSnapshot` resolves exact repository slugs before fallback matching when slugs share substrings (`express` vs `express-session`).
- **Result:** PASSED.
  - Query `express` resolved strictly to `repo-express`.
  - Query `express-session` resolved strictly to `repo-express-session`.

### Group 8: Source Line Range Half-Open Interval Support
- **Test:** Verify that retrieved source records explicitly expose 1-based start-inclusive and end-exclusive intervals.
- **Result:** PASSED.
  - 5-line source file yielded `startLine: 1`, `endLine: 6`, `endLineExclusive: 7`.
  - Conforms to EEID half-open interval `[startLine, endLineExclusive)`.

### Group 9: Prompt Versioning & Baseline Preservation
- **Test:** Verify that `getChatSystemPrompt` returns `chat.v2` by default and `chat.v1` when configured.
- **Result:** PASSED.
  - Default: `chat.v2` (contains temporal snapshot boundary enforcement and anti-hallucination rules).
  - Version `v1`: `chat.v1` (preserves exact pre-Task-6 baseline prompt text).

### Group 10: Secret Redaction in Error Responses
- **Test:** Verify that `redactSecrets` scrubs API keys and URLs containing credentials from error messages.
- **Result:** PASSED. API keys replaced with `[REDACTED_API_KEY]`.

---

## 3. Test Distinction Notice

- **Unit Tests:** Deterministic algorithmic verifications (pathing, prioritization, interval arithmetic, regex extraction, schema validation).
- **Integration Tests:** In-memory controller, multi-file retrieval, and graph repository interactions.
- **Live Provider Tests:** Currently SKIPPED/DEFERRED due to pending Gemini API key configuration (`PROVIDER_CONFIGURATION_REQUIRED`). No claims of live model reasoning improvements are made until live provider credentials are provided.
