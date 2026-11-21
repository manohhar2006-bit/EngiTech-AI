# Task 6 Known Limitations & Governance Status

**Date:** 2026-11-21  
**Project:** EngiTrace + EEID  
**Stage:** Task 6 — Intelligence Improvements & Technical Remediation  
**Status:** IMPLEMENTATION COMPLETE (Evaluation Blocked by Upstream Governance & Credentials)

---

## 1. Upstream Blockers to Benchmark Scoring

### Blocker 1: Gold Dataset Expert Sign-Off Pending (Governance Gate)
- **Status:** BLOCKED
- **Description:** The Engineering Intelligence Dataset candidate benchmark package (`task3-remediation-proposal-v4.2.5/RECORD_PATCHES_V4_2_5.jsonl`) contains 5 high-fidelity records across Express, TanStack Query, and Payload CMS. However, all candidate records remain strictly in `DRAFT` / `PENDING_HUMAN_REVIEW` status.
- **Rule:** Per Task 3, 4, and 5 governance rules, unapproved drafts, remediation proposals, or synthetic fixtures **MUST NOT** be promoted or evaluated as official benchmark results without formal dual-human domain expert sign-off.
- **Impact:** Layer 1 and Layer 2 aggregate benchmark scores cannot be computed until human experts execute the checklist at `eeid/task3-remediation-proposal-v4.2.5/HUMAN_REVIEW_SIGNOFF_CHECKLIST.md`.

### Blocker 2: Google Gemini API Key Unconfigured (Provider Gate)
- **Status:** BLOCKED / DEFERRED
- **Description:** Neither `GEMINI_API_KEY` nor `GOOGLE_API_KEY` is configured in `backend/.env`. Requests targeting live AI reasoning return HTTP 200 with `provider: "PROVIDER_CONFIGURATION_REQUIRED"`.
- **Rule:** Under Task 4 and 5 contracts, an unconfigured provider cleanly defers scoring without penalizing the assistant as a defect failure. Synthetic answers or mocked LLM outputs MUST NOT be passed off as genuine live AI responses.
- **Impact:** Live provider semantic reasoning evaluation is deferred until valid credentials are provided.

---

## 2. Items Marked as NEEDS_BASELINE

Per Phase 8 instructions:
> "Mark performance-oriented or accuracy-oriented hypotheses as NEEDS_BASELINE where no benchmark evidence exists."

The following architectural hypotheses are categorized as **NEEDS_BASELINE**:

1. **Prompt Version v2 Accuracy Impact:**  
   The enhanced system prompt (`chat.v2`) provides stronger directives for temporal boundary enforcement, canonical edge directionality, and anti-hallucination bounds. While verified by deterministic unit tests, its measured impact on Claim Coverage and Evidence Recall requires a full benchmark run against approved records.

2. **Multi-File Context Aggregation Budget:**  
   The 80KB aggregate source cap and 5-file maximum limit provide rich multi-file context without token exhaustion. The trade-off between broader cross-file recall and context dilution remains to be empirically scored once the official benchmark is unblocked.

3. **AST Call Resolution Depth:**  
   Tree-sitter AST extraction resolves intra-file and relative inter-file function calls up to 12-20 items. Dynamic, polymorphic, or framework-injected calls (e.g. dynamic middleware dispatch in Express) are not statically resolved.

---

## 3. Safe Boundaries & Operational Limitations

1. **Static Analysis Scope:**  
   EngiTrace relies on static property graphs, Git history, and Tree-sitter AST parsing. Dynamic runtime behaviors (runtime monkey-patching, dynamic `eval()`, runtime dependency injection) are outside the static analysis scope and must be recognized as `UNKNOWN`.

2. **In-Memory Graph State:**  
   EEID repository graphs are held in-memory via `GraphRepository` and `repositoryCache`. Server restart re-seeds these graphs deterministically from the derived graph index files on disk.

3. **Restoration of Original Application:**  
   The pre-Task-6 source snapshot is completely preserved in `eeid/task6/pre-task6-source-snapshot/pre-task6-source-snapshot.zip` with manifest `TASK6_PRECHANGE_SNAPSHOT_MANIFEST.json`. The original implementation can be restored at any time for comparative evaluation.
