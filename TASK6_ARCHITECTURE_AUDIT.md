# EngiTrace Architecture & Request Lifecycle Audit (Task 6)

**Audit Date:** 2026-11-21  
**Auditor:** EngiTrace Intelligence & Governance Team  
**Scope:** EngiTrace Core, Backend API Gateway, AI Engine, Graph Engine, Analyzer, and Evaluator Adapter  
**Audit Purpose:** Comprehensive verification of request lifecycle, module boundaries, data flows, and intelligence pipelines prior to Task 6 remediation.

---

## 1. Complete End-to-End Request Lifecycle Trace

```
User Question (HTTP POST /api/v1/repositories/:id/chat)
    │
    ▼
[1] Repository Selection & Normalization
    ├── repositoryController.ts (getSnapshot, repositoryCache)
    └── eeidGraphIngestionService.ts (canonical ID & alias resolution)
    │
    ▼
[2] Dynamic Context & Mode Resolution
    ├── chatController.ts (intent heuristic: WHY vs WHAT_IF)
    └── Lightweight conversational shortcut handling
    │
    ▼
[3] Knowledge Graph Retrieval
    ├── GraphRepository.ts (getGraph, getNode, getEdges)
    ├── GraphQueryEngine (getNeighborhood, findNode)
    └── Target node & connected edges extraction
    │
    ▼
[4] Source Code & AST Retrieval
    ├── multiFileContextService.ts (retrieveBoundedContext)
    ├── treeSitterLoader.ts & repositoryAnalyzer.ts (AST symbols, imports, calls)
    ├── In-memory snapshot priority (sourceContents Map)
    └── GitHubService.ts (remote fallback fetch)
    │
    ▼
[5] Historical & Deterministic Evidence Collection
    ├── WhyExplorerService.ts (buildHistoricalChain, categorizeEvidence)
    ├── ImpactAnalysisService.ts (traverseImpactGraph, categorizeAffectedNodes)
    └── EvidenceContextBuilder.ts (AIContext construction & serialization)
    │
    ▼
[6] Versioned Prompt Construction & Gemini Reasoning
    ├── providerService.ts (queryGeminiChat, versioned prompts, intent rules)
    ├── Google Generative Language REST API (v1 generateContent)
    └── Retry policy (HTTP 429/503 exponential backoff & AbortController timeout)
    │
    ▼
[7] Provider Response Parsing & Local Fallback Interception
    ├── providerService.ts (parseAndNormalizeChatResponse)
    ├── generateLocalFallbackResponse (deterministic fallback when offline/unconfigured)
    └── Provider error classification (PROVIDER_CONFIGURATION_REQUIRED vs GEMINI)
    │
    ▼
[8] Structured Output & Citation Validation (Hallucination Defense)
    ├── structuredOutputValidator.ts (validate against request-scoped AIContext)
    ├── Repository isolation verification (cross-repo evidence rejection)
    ├── Evidence ID existence & classification defense (FACT vs INFERENCE vs UNKNOWN)
    └── Citation resolution against pinned repository files
    │
    ▼
[9] Final Response Assembly & Frontend Presentation
    ├── chatController.ts (JSON serialization with sanitized markdown & claims)
    ├── aiAssistantService.ts (frontend API client)
    └── AIAssistant component / ChatDrawer (claim cards, evidence badges, follow-ups)
```

---

## 2. Stage-by-Stage Component Inspection

### Stage 1: Repository Selection
- **Primary Source Files:**
  - `backend/src/controllers/repositoryController.ts` (`getSnapshot`, `registerSnapshot`)
  - `backend/src/services/eeidGraphIngestionService.ts` (`ingestEeidRepositories`, `resolveIndexDirectory`)
  - `backend/src/services/graphRepository.ts` (`saveGraph`, `getGraph`)
- **Observed Behavior:**
  - In-memory `repositoryCache` maps repository IDs and slug aliases (e.g., `EEID-REPO-001`, `expressjs/express`, `repo-express`) to `AnalyzedRepoSnapshot` instances.
  - Three EEID pilot repositories are pre-loaded at startup:
    - `EEID-REPO-001` (expressjs/express)
    - `EEID-REPO-002` (TanStack/query)
    - `EEID-REPO-003` (payloadcms/payload)
- **Defects Discovered:**
  - In `repositoryController.ts:getSnapshot`, line 817 used `snap.metadata.id.toLowerCase().includes(cleanId)`. Substring matching could prematurely match non-identical repositories (e.g., `repo-1` matching `repo-10`). Exact key/ID/alias matching must take precedence before any substring search.

### Stage 2: Intent & Context Resolution
- **Primary Source Files:**
  - `backend/src/controllers/chatController.ts` (`handleChat`)
  - `backend/src/routes/whyRoutes.ts`
- **Observed Behavior:**
  - Detects analysis mode (`WHY` vs `WHAT_IF`) based on explicit request parameter or dynamic question heuristics (keywords: `remove`, `impact`, `break` -> `WHAT_IF`; `why`, `exist`, `commit`, `author` -> `WHY`).
  - Provides lightweight zero-token response for simple conversational greetings (`hello`, `hi`, `thanks`).

### Stage 3: Knowledge Graph Retrieval
- **Primary Source Files:**
  - `backend/src/services/graphRepository.ts`
  - `graph-engine/src/index.ts` (`GraphQueryEngine`)
  - `graph-engine/src/models/graphModel.ts`
  - `graph-engine/src/relationships/relationshipRegistry.ts`
- **Observed Behavior:**
  - Retrieves `EngineeringMemoryGraph` containing nodes and edges.
  - Neighborhood lookup traverses 1-to-3 hop boundaries.
- **Defects Discovered:**
  - `GraphQueryEngine.findPath` implemented undirected BFS without an option for directed path finding.
  - `GraphQueryEngine.getHistoricalChain` documented a priority of `File -> Commit -> PR -> Issue`, but in code called `edges.find()` on the first connected edge without checking relationship or node type priority.

### Stage 4: Source Retrieval & AST Context
- **Primary Source Files:**
  - `backend/src/services/multiFileContextService.ts` (`MultiFileContextService`)
  - `analyzer/src/index.ts` (`analyzeRepositoryFiles`, `FileAstResult`)
  - `backend/src/services/githubService.ts` (`fetchFileContent`)
- **Observed Behavior:**
  - First queries `snapshot.sourceContents` (in-memory map of offline source files).
  - Falls back to `GitHubService.fetchFileContent` when snapshot is unseeded or remote.
  - Enforces hard limits: max 5 total files, 50KB selected file limit, 15KB related file limit, 80KB aggregate budget.
  - Extracts AST imports, exported symbols, and resolved calls via Tree-sitter.
- **Defects Discovered:**
  - `cleanNodeFilePath` only stripped `file:` prefixes (`/^file:[^:]+:/`). When supplied with `function:` or `component:` node IDs (e.g. `function:EEID-REPO-001:lib/application.js:app.listen`), file path resolution failed.
  - Bounded snippet line range returned 1-based inclusive end line rather than explicitly supporting the EEID 1-based exclusive convention `[startLine, endLineExclusive)`.

### Stage 5: Historical & Deterministic Evidence Collection
- **Primary Source Files:**
  - `backend/src/services/whyExplorerService.ts` (`WhyExplorerService`)
  - `backend/src/services/impactAnalysisService.ts` (`ImpactAnalysisService`)
  - `ai-engine/services/evidenceContextBuilder.ts` (`EvidenceContextBuilder`)
- **Observed Behavior:**
  - `WhyExplorerService` builds chronological chain steps from target to commits, pull requests, and issues.
  - `ImpactAnalysisService` performs directional BFS traversal to compute blast radius, impact score (0-100), and affected categories.
- **Defects Discovered:**
  - `WhyExplorerService` was completely unaware of the pinned repository snapshot timestamp and did not filter out post-snapshot events.
  - `WhyExplorerService.categorizeEvidence` set `evidence.repositoryId` to `targetNode.id` instead of the canonical repository ID.
  - `ImpactAnalysisService.traverseImpactGraph` checked `EXPOSES` in reverse (under `currentFrontier.has(edge.target)`) because it was omitted from the forward container check `(relType === 'CONTAINS' || relType === 'DECLARES')`.
  - `ImpactAnalysisService` lacked explicit cross-repository node validation.

### Stage 6: Prompt Construction & Gemini Reasoning
- **Primary Source Files:**
  - `ai-engine/services/providerService.ts` (`ProviderService.queryGeminiChat`)
  - `ai-engine/prompts/why.v1.ts` (`WHY_SYSTEM_PROMPT`)
- **Observed Behavior:**
  - Queries Google Generative Language REST v1 `generateContent` with `responseMimeType: "application/json"`.
  - Sets `temperature: 0.2` for deterministic reasoning.
  - Implements 3 retry attempts with exponential backoff for HTTP 503 and 429.
- **Defects Discovered:**
  - No `AbortController` timeout on `fetch` in `providerService.ts`; network hangs could block indefinitely.
  - Prompt strings were hardcoded without a version identifier or feature-flagging mechanism to preserve the pre-Task-6 baseline prompt.

### Stage 7: Structured Output & Citation Validation (Hallucination Defense)
- **Primary Source Files:**
  - `ai-engine/validators/structuredOutputValidator.ts` (`StructuredOutputValidator`)
  - `backend/src/controllers/chatController.ts`
- **Observed Behavior:**
  - Validates that claimed evidence IDs exist in the request-scoped `AIContext`.
  - Downgrades unsupported `FACT` claims to `UNKNOWN`.
  - Enforces repository isolation by rejecting cross-repository evidence IDs.
- **Defects Discovered:**
  - `validEvidenceIds` did not distinguish between `FACT` and `INFERENCE` evidence classifications. Claims asserting `FACT` while citing `INFERENCE` evidence were incorrectly validated as facts rather than being downgraded.

### Stage 8: Reliability & Error Handling
- **Primary Source Files:**
  - `ai-engine/services/providerService.ts` (`generateLocalFallbackResponse`)
  - `backend/src/security/secretRedactor.ts` (`redactSecrets`)
  - `evaluator/adapter/assistantAdapter.ts`
- **Observed Behavior:**
  - Generates deterministic local fallback when Gemini is unconfigured, rate-limited, or returns 503.
  - Sets `provider: "PROVIDER_CONFIGURATION_REQUIRED"` when API keys are missing/invalid.
- **Defects Discovered:**
  - `chatController.ts` error handler logged raw error message and returned `details: err?.message` without passing through `redactSecrets`.

### Stage 9: Frontend Presentation
- **Primary Source Files:**
  - `frontend/src/services/aiAssistantService.ts`
  - `frontend/src/context/AIInvestigationContext.tsx`
  - `frontend/src/pages/AIAssistant/...`
- **Observed Behavior:**
  - Renders markdown response with collapsible claims, evidence badges, and interactive follow-up question chips.
  - Accurately renders `isFallback` indicators to inform the user when offline analysis is active.

---

## 3. Audit Summary Table

| Subsystem | Audit Status | Key Defect Identified | Remediation Phase |
|---|---|---|---|
| Repository Selection | ⚠️ Needs Fix | Substring match precedence in `repositoryController.ts` | Phase 2 |
| Source & AST Retrieval | ⚠️ Needs Fix | `cleanNodeFilePath` fails on function/component node IDs | Phase 2 |
| Graph Engine Pathing | ⚠️ Needs Fix | Undirected-only BFS; unprioritized `getHistoricalChain` | Phase 3 |
| Impact Analysis | ⚠️ Needs Fix | `EXPOSES` direction inverted; cross-repo check missing | Phase 3 |
| Historical Reasoning | ⚠️ Needs Fix | Cutoff timestamp ignored; placeholder repositoryId | Phase 4 |
| Citation & Claim Validation | ⚠️ Needs Fix | `INFERENCE` evidence accepted for `FACT` claims | Phase 5 |
| Prompt & Configuration | ⚠️ Needs Fix | Unversioned prompt; no feature flag for pre-Task-6 baseline | Phase 6 |
| Provider Reliability | ⚠️ Needs Fix | Missing request timeout; unredacted error details | Phase 7 |

All identified defects will be registered in `TASK6_IMPROVEMENT_BACKLOG.json` and remediated with automated regression tests.
