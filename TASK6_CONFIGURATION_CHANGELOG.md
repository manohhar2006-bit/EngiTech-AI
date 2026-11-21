# Task 6 Configuration Changelog

**Date:** 2026-11-21  
**Scope:** EngiTrace Runtime, AI Engine, Backend API Gateway, and Evaluation Environment  
**Status:** ACTIVE

---

## 1. New Environment Variables & Feature Flags

| Variable | Type | Default | Permitted Values | Purpose |
|---|---|---|---|---|
| `ENGITRACE_PROMPT_VERSION` | string | `v2` | `v1`, `v2`, `chat.v1`, `chat.v2` | Feature flag to select between pre-Task-6 baseline system prompt (`v1`) and Task 6 enhanced grounding prompt (`v2`). |
| `GEMINI_REQUEST_TIMEOUT_MS` | number | `30000` | Positive integer (ms) | Request timeout for outbound Google Generative Language REST API calls. Prevents socket hanging. |

---

## 2. Backward Compatibility & Baseline Preservation

To ensure that the pre-Task-6 version remains 100% recoverable and evaluatable when human dataset sign-off and Gemini credentials become available:

### How to Run in Pre-Task-6 Baseline Mode
Set the environment variable `ENGITRACE_PROMPT_VERSION=v1` in `backend/.env` or before launching the backend:
```bash
# Windows PowerShell
$env:ENGITRACE_PROMPT_VERSION="v1"
npm --prefix backend start

# Linux / macOS
ENGITRACE_PROMPT_VERSION=v1 npm --prefix backend start
```
When `ENGITRACE_PROMPT_VERSION=v1` is set:
- The system prompt returned by `getChatSystemPrompt` matches the pre-Task-6 baseline prompt byte-for-byte.
- Post-Task-6 prompt additions (e.g., explicit temporal snapshot boundary rules) are deactivated.

### How to Run in Task 6 Improved Mode (Default)
Leave `ENGITRACE_PROMPT_VERSION` unset or set to `v2`:
```bash
# Windows PowerShell
$env:ENGITRACE_PROMPT_VERSION="v2"
npm --prefix backend start
```
When `v2` is active:
- The enhanced system prompt with strict temporal boundary enforcement, canonical relationship direction formatting, and anti-hallucination directives is delivered to the provider.

---

## 3. API Contract Updates

### 1. `WhyQuery.options`
- Added optional `snapshotCutoff?: string` to `WhyQuery.options`.
- When provided, overrides the automatic snapshot timestamp lookup with an explicit ISO-8601 cutoff timestamp.

### 2. `GraphQueryEngine.findPath`
- Added optional `options?: { directed?: boolean }` parameter.
- Defaults to `false` (undirected search) to maintain 100% backward compatibility with existing tests.
- When `options: { directed: true }`, searches only forward directed edges (`source -> target`).

### 3. `RetrievedSourceRecord.lineRange`
- Added optional `endLineExclusive?: number` to `RetrievedSourceRecord.lineRange`.
- Existing `startLine` and `endLine` remain intact for legacy consumers.
- `endLineExclusive` provides the 1-based exclusive end line for unambiguous conformance to the EEID half-open interval `[startLine, endLineExclusive)`.

---

## 4. Package Manifest Updates

### `backend/package.json`
- Added `"test:task6": "tsx tests/task6IntelligenceImprovements.test.ts"` script.
- Added `tests/task6IntelligenceImprovements.test.ts` to the main `"test"` script.
- Zero changes to production dependencies (all changes implemented using existing dependencies).
