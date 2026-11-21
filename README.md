# EngiTrace — AI-Powered Engineering Intelligence

> **Your Code Remembers. Your Team Forgot.**

EngiTrace is an engineering memory and software archaeology platform that reconstructs the evolution, architecture, and rationale behind complex software repositories. While GitHub tells developers **what** changed in a diff, EngiTrace explains **why** code exists, **how** decisions were made, and **what if** changes are introduced.

By bridging deterministic property graphs, Tree-sitter Abstract Syntax Tree (AST) extraction, and Google Gemini reasoning, EngiTrace provides evidence-grounded intelligence without fabricating unsupported facts.

---

## 1. Project Overview

Modern software repositories accumulate years of architectural and design decisions distributed across commits, branches, pull requests, issues, discussions, and file diffs. When engineers rotate or projects grow, context evaporates.

EngiTrace unifies:
- **Repository History**: Commits, parent lineages, merges, and author chronologies.
- **Structural Architecture**: Current directory hierarchies, files, and module structures.
- **Syntactic Dependencies**: Static import analysis, AST-level function calls, and module exports.
- **Epistemological AI Reasoning**: Grounded, verifiable explanations distinguishing **FACT**, **INFERENCE**, and **UNKNOWN**.

```text
Repository / Git History
         ↓
Deterministic Engineering Graph + AST Analysis
         ↓
Question-Aware Multi-File Context Retrieval
         ↓
Epistemological Boundary Defense (Structured Output Validator)
         ↓
Google Gemini Reasoning Engine
         ↓
Grounded Engineering Intelligence (WHY & WHAT IF)
```

---

## 2. Problem Statement

Engineering teams suffer from severe context loss over time:
1. **The "Why" is Lost**: Code explains *how* an algorithm works, but rarely *why* a particular workaround, library, or architecture was chosen.
2. **High-Risk Modifications**: Developers modify code without understanding downstream blast radius across undocumented callers.
3. **Decision Debt**: Temporary hacks, deprecated dependencies, and emergency fixes remain buried until they trigger outages.
4. **AI Hallucinations**: Standard LLM assistants hallucinate nonexistent APIs and fabricate reasons because they lack deterministic graph grounding and temporal cutoff awareness.

---

## 3. Proposed Solution

EngiTrace implements a **dual-layer architecture**:
1. **Deterministic Engineering Memory Layer**: Parses actual Git topology, file trees, and AST relationships. Computes graph metrics, historical chains, and blast radius deterministically.
2. **Generative Synthesis Layer**: Formulates prompt envelopes where repository files and history are injected as untrusted data contexts. Google Gemini generates human-readable explanations strictly constrained to cite verified graph evidence IDs and source line intervals.

---

## 4. Key Features

- **Interactive Git History Graph**: Deterministic topological visualization displaying real commit SHAs, merges, branches, and author metadata.
- **Architecture Explorer**: Live file and directory tree navigation with syntax and relationship context.
- **Node Intelligence Panel**: Contextual metadata, incoming/outgoing edges, historical lineage, and quick actions for any selected commit or file.
- **WHY Analysis**: Historical reverse-trace explaining why a component exists, which PR/issue introduced it, and confidence scoring.
- **WHAT IF Impact Analysis**: Forward propagation blast-radius scoring predicting structural impact if a file or module is modified or removed.
- **Decision Debt Detection**: Heuristic and AI-driven scanners flagging high-churn, low-rationale files and architectural debt.
- **EngiTrace AI Assistant**: Multi-turn conversational interface with conversational memory, source grounding, and evidence citations.
- **EEID Benchmarking Suite**: Automated evaluation runner, schema validator, and question seeder for the Engineering Intelligence Dataset.

---

## 5. Engineering Graph

The `graph-engine` constructs an in-memory property graph modeling the repository:

### Node Types
- `FILE`: Source files, configuration files, and documentation.
- `COMMIT`: Git commits with author, timestamp, message, and SHA.
- `BRANCH`: Active and historical branch pointers.
- `PR`: Pull requests with review history and rationale.
- `ISSUE`: Bug reports and feature discussions.
- `FUNCTION`: AST-extracted function and method declarations.
- `AUTHOR`: Software contributors and reviewers.

### Relationship Types
- `CHANGED` / `MODIFIED`: Commit or PR modified a file.
- `AUTHORED_BY`: Node created by an author.
- `RESOLVES`: PR or commit closes an issue.
- `DEPENDS_ON`: Module or package dependency.
- `CALLS`: AST-level function call edge.
- `EXPOSES`: Container or module exposing internal functions.

The query engine supports shortest path finding (`findPath`), neighborhood expansion (`getNeighborhood`), and canonical historical chains (`getHistoricalChain`).

---

## 6. EngiTrace AI Assistant

The AI Assistant is a dedicated conversational environment designed for deep software investigation:
- **Investigation Sessions**: Multi-turn sessions tied to a specific repository and focal node.
- **Context Injection**: Automatically attaches relevant Git graph nodes, AST call paths, and file contents.
- **Follow-up Continuity**: Maintains focal context across iterative questions (e.g., *"What changed it?"* -> *"What does it call?"*).
- **Evidence Inspector**: Every cited claim in the AI's response links directly to verified evidence records in the right-hand panel.

---

## 7. Decision Debt

Decision Debt measures the risk of unmaintained or poorly understood architectural decisions:
- **High Churn / Low Rationale**: Files frequently modified without linked issues or descriptive commit messages.
- **Orphan Modules**: Files lacking clear ownership or dependency links.
- **Debt Scoring**: 0–100 risk score based on blast radius, test coverage, and documentation absence.
- **Actionable Recommendations**: AI-generated remediation roadmaps detailing specific refactoring steps.

---

## 8. WHY Analysis

The WHY Explorer answers software archaeology queries:
```text
"Why was this authentication middleware introduced?"
"Why does this service use a custom LRU cache instead of Redis?"
```
Execution Pipeline:
1. Locates target file node in `GraphRepository`.
2. Computes the canonical historical chain: `FILE` -> `COMMIT` -> `PR` -> `ISSUE`.
3. Filters out any events occurring after the target snapshot cutoff date.
4. Gathers commit messages, PR descriptions, and issue discussions.
5. Injects evidence into Gemini prompt template (`chat.v2`).
6. Generates response with confidence tier (HIGH, MEDIUM, LOW) and verified evidence citations.

---

## 9. WHAT IF Impact Analysis

WHAT IF analyzes the structural consequences of hypothetical codebase changes:
```text
"What happens if we remove src/services/jwtService.ts?"
"What breaks if the return signature of authenticate() changes?"
```
Execution Pipeline:
1. Target node identification and validation.
2. Forward graph traversal across `DEPENDS_ON`, `CALLS`, and `EXPOSES` edges.
3. Extraction of directly affected and transitively affected nodes.
4. Blast radius calculation ($0-100\%$) and severity categorization (LOW, MEDIUM, HIGH, CRITICAL).
5. Natural-language explanation synthesized by Gemini outlining affected endpoints and required test updates.

---

## 10. EEID Knowledge Dataset Architecture

The **Engineering Intelligence Dataset (EEID)** is a standardized benchmark specification evaluating AI reasoning over software engineering repositories.

### Pilot Repositories & Pinned Snapshots
1. **`EEID-REPO-001` (expressjs/express)**
   - Pinned Commit: `43fca52d28a422c8be48fd489cbd4f2d6152bab6`
   - Pinned Snapshot: `2026-11-02T20:15:26Z`
   - Ingested Graph: 136 nodes, 178 edges, 53 source files.
2. **`EEID-REPO-002` (TanStack/query)**
   - Pinned Commit: `19f555cf919a1438885d7d20c95b17b26d6d6859`
   - Pinned Snapshot: `2026-11-13T01:57:29Z`
   - Ingested Graph: 399 nodes, 1016 edges, 49 source files.
3. **`EEID-REPO-003` (payloadcms/payload)**
   - Pinned Commit: `90b4962a1876cbd3568692e7de9aaf72b847e407`
   - Pinned Snapshot: `2026-11-13T16:18:53Z`
   - Ingested Graph: 305 nodes, 593 edges, 64 source files.

### EEID Benchmark Governance Status
> [!IMPORTANT]
> Candidate EEID benchmark records are currently staged in `DRAFT` / `PENDING_HUMAN_REVIEW` status.
> Per dataset governance rules, a fully human-approved Gold Dataset does not yet exist. Dual-human expert review and sign-off remain pending.

---

## 11. Retrieval and Source Grounding

EngiTrace uses strict bounds for source code retrieval:
- **Multi-File Context Aggregation**: Prioritizes direct target file followed by topological 1-hop neighbors.
- **Budget Enforcements**: Strict 80KB total source payload cap and maximum of 5 related files to prevent LLM context saturation.
- **Source Anchor Verification**: Source code line ranges are formatted as 1-based, start-inclusive, end-exclusive half-open intervals (`[sourceLineStart, sourceLineEndExclusive)`).
- **Cryptographic Grounding**: Slices are verified against the snapshot file's SHA-256 hash.

---

## 12. FACT / INFERENCE / UNKNOWN Classification

EngiTrace enforces strict epistemological rigor via `StructuredOutputValidator`:

| Classification | Definition | Verification Requirement |
| :--- | :--- | :--- |
| **FACT** | Directly verifiable from repository Git history, AST edges, or source files. | Must cite valid `evidenceId` matching an existing graph edge or source anchor. |
| **INFERENCE** | Logical deduction, pattern analysis, or architectural interpretation. | Must provide explicit reasoning explanation; cannot cite nonexistent facts. |
| **UNKNOWN** | Information absent from repository or occurring after snapshot cutoff. | Must explicitly state evidence is missing; never fabricate plausible details. |

If an assistant response marks an inferred claim as a confirmed FACT without direct evidence, `StructuredOutputValidator` downgrades or rejects the claim.

---

## 13. Gemini Integration

- **Model Identifier**: Default `gemini-3.6-flash` (configurable via `GEMINI_MODEL`).
- **REST Gateway**: Direct HTTPS communication with Google Generative AI API (`x-goog-api-key` header).
- **Security Redaction**: `SecretRedactor` scrubs all API keys, GitHub tokens, and credentials from prompts and error payloads before logging or transmission.
- **Resilience**: Bounded exponential backoff (3 retry attempts) on HTTP 429/503 status codes.
- **Deterministic Local Fallback**: When `GEMINI_API_KEY` is unconfigured or unavailable, the system safely falls back to local deterministic graph and multi-file summaries without crashing.

---

## 14. Technology Stack

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite 6, TypeScript, Tailwind CSS, Framer Motion, Lucide React | Single-page application, interactive dashboards, graph visualizers |
| **Backend** | Node.js, Express, TypeScript, tsx, helmet, cors, dotenv | API gateway, repository orchestration, auth, rate limiting |
| **Graph Engine** | In-Memory Property Graph, Breadth-First Search, Graphology patterns | Topology management, neighborhood queries, pathfinding |
| **Analyzer** | `web-tree-sitter`, `tree-sitter-wasms`, fast-xml-parser, smol-toml, yaml | AST parsing, multi-language import extraction, package manifests |
| **AI Engine** | Google Gemini API (`gemini-3.6-flash`), Zod schemas | Grounded contextual reasoning, epistemological output validation |
| **Evaluation** | Custom EEID Runner, Record Validator, Question Seeder | Automated benchmark evaluation and dataset governance |

---

## 15. System Architecture

```text
               ┌────────────────────────────────────────────────────────┐
               │                   Frontend (React 19)                  │
               │  Dashboard | Git Graph | Architecture | AI Assistant   │
               └───────────────────────────┬────────────────────────────┘
                                           │ HTTP / JSON
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │                   Backend (Express)                    │
               │  Auth & CSRF | Rate Limiters | Controllers & Routes    │
               └───────────────┬────────────────────────┬───────────────┘
                               │                        │
                 ┌─────────────▼────────────┐           │
                 │   Analyzer & AST Engine  │           │
                 │  tree-sitter AST parser  │           │
                 └─────────────┬────────────┘           │
                               │                        │
                               ▼                        ▼
               ┌────────────────────────────┐  ┌────────────────────────┐
               │    Graph Engine Core       │  │  Multi-File Retrieval  │
               │  Property Graph & Query    │  │  Line Anchors & Budget │
               └───────────────┬────────────┘  └────────┬───────────────┘
                               │                        │
                               └───────────┬────────────┘
                                           │ Grounded Context Envelope
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │                  AI Reasoning Engine                   │
               │  Secret Redactor | Structured Output Validator         │
               └───────────────────────────┬────────────────────────────┘
                                           │ x-goog-api-key
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │              Google Gemini 3.6 Flash                   │
               └────────────────────────────────────────────────────────┘
```

---

## 16. Project Structure

```text
EngiTech-AI/
├── ai-engine/                       # AI Reasoning, Prompts & Security
│   ├── cache/                       # In-memory reasoning cache
│   ├── prompts/                     # Versioned prompts (chatPrompts, why.v1)
│   ├── security/                    # Secret redactor & prompt boundaries
│   ├── services/                    # ProviderService, ReasoningService
│   ├── types/                       # AIContext types
│   └── validators/                  # StructuredOutputValidator
│
├── analyzer/                        # Syntactic & AST Analysis
│   └── src/                         # Tree-sitter loader, TS/JS AST extractor
│
├── backend/                         # Express API Gateway & Orchestrator
│   ├── src/
│   │   ├── controllers/             # Chat, Graph, Why, Impact controllers
│   │   ├── routes/                  # API endpoints (/api/v1/repositories)
│   │   ├── security/                # Auth, CSRF, rate limiters, scrypt hashing
│   │   ├── services/                # Ingestion, WHY, Impact, MultiFileContext
│   │   └── types/                   # Backend domain definitions
│   └── tests/                       # Unit and integration test suites
│
├── docs/                            # Architectural specifications & audits
├── eeid/                            # EEID Dataset Specifications & Code
│   ├── ANNOTATION_GUIDE.md          # Domain expert annotation protocol
│   ├── EEID_Pilot_README.md         # Pilot repository specification
│   ├── prepare_eeid_annotation.ts   # Annotation queue preparation
│   ├── seed_eeid_questions.ts       # Candidate question seeder
│   └── validate_eeid_record.ts      # Strict record schema validator
│
├── evaluator/                       # EEID Benchmark Evaluation Runner
│   ├── adapter/                     # Assistant HTTP client adapter
│   ├── config/                      # Pinned evaluation thresholds
│   ├── dataset/                     # Gold dataset loader & approval verifier
│   ├── engine/                      # Deterministic & semantic evaluators
│   ├── metrics/                     # Precision, recall, and composite scores
│   ├── reporting/                   # Report generator & SHA-256 manifest
│   └── tests/                       # 18-suite evaluator verification tests
│
├── frontend/                        # React 19 + Vite 6 Web Application
│   ├── src/
│   │   ├── components/              # UI components, visualizers, modals
│   │   ├── pages/                   # Dashboard, Assistant, DecisionDebt, WhyGraph
│   │   ├── services/                # API clients, active repo state
│   │   └── utils/                   # Security utilities, markdown tokenizers
│   └── public/                      # Static assets & test harnesses
│
├── graph-engine/                    # Property Graph Core Engine
│   └── src/                         # Builders, models, relationship registry
│
├── prepare_eeid_annotation.ts       # Root entrypoint for annotation workflow
├── run_eeid_evaluation.ts           # Root entrypoint for evaluation runner
├── seed_eeid_questions.ts           # Root entrypoint for question seeder
├── validate_eeid_record.ts          # Root entrypoint for record validation
├── .env.example                     # Environment configuration template
├── .gitignore                       # Production publication exclusion rules
└── README.md                        # Project documentation
```

---

## 17. Installation Requirements

- **Node.js**: `v18.0.0` or higher (tested with `v20.x` and `v22.x`)
- **npm**: `v9.0.0` or higher
- **Git**: `2.30+`
- **Optional Credentials**:
  - `GEMINI_API_KEY`: Required for live Google Gemini AI reasoning.
  - `GITHUB_TOKEN`: Recommended for high-rate-limit GitHub repository ingestion.

---

## 18. Environment Configuration

1. Copy `.env.example` in the project root to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Copy backend environment configuration:
   ```bash
   cp backend/.env.example backend/.env
   ```

3. Copy frontend environment configuration:
   ```bash
   cp frontend/.env.example frontend/.env
   ```

4. Populate `.env` or `backend/.env` with your credentials:
   ```env
   NODE_ENV=development
   PORT=4000
   VITE_API_URL=http://localhost:4000/api/v1
   GITHUB_TOKEN=your_github_token_here
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-3.6-flash
   ```

> [!WARNING]
> Never commit `.env` or files containing live credentials. All `.env*` files are strictly excluded by `.gitignore`.

---

## 19. Backend Startup

To start the backend in development mode:

```bash
cd backend
npm install
npm run dev
```

The backend server initializes on `http://localhost:4000`. On startup, it seeds the three EEID pilot repositories into the in-memory graph engine.

Health check endpoint:
```bash
curl http://localhost:4000/health
```

---

## 20. Frontend Startup

In a separate terminal, launch the frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite development server will open on `http://localhost:5173`.

---

## 21. Running Tests

EngiTrace includes comprehensive automated test suites verifying all core functionality:

### 1. Backend Core Test Suite (14 Suites)
Runs ingestion, property graph, WHY explorer, AI reasoning, decision debt, impact analysis, chat controller, retries, multi-file retrieval, AST analyzer, and Task 6 improvements:
```bash
npm --prefix backend test
```
*Result:* **PASS** (14/14 test suites passed cleanly).

### 2. Task 6 Intelligence Improvements Test Suite
Verifies graph directionality, canonical historical path prioritization, temporal snapshot cutoffs, canonical repository IDs, forward impact traversal, and secret redactors:
```bash
npm --prefix backend run test:task6
```
*Result:* **PASS** (10/10 test groups passed cleanly).

### 3. EEID Evaluation Runner Suite
Verifies dataset loading, dual-reviewer governance gates, session isolation, half-open line anchors, deterministic scoring, report generation, and unconfigured provider handling:
```bash
npm --prefix backend run test:eeid:evaluator
```
*Result:* **PASS** (18/18 test suites passed cleanly).

### 4. EEID Record Validator Suite
Verifies schema compliance, cross-repository leakage rejection, SHA-256 anchor verification, and WHAT IF field validation:
```bash
npm --prefix backend run test:eeid:validator
```
*Result:* **PASS** (17/17 test suites passed cleanly).

### 5. EEID Question Seeder & Annotation Workflow Suites
```bash
npm --prefix backend run test:eeid:seeder
npm --prefix backend run test:eeid:annotation
```
*Result:* **PASS** (All seeder and annotation workflow invariants passed cleanly).

---

## 22. Example Workflows

### Workflow 1: Repository Archaeology (WHY Query)
1. Launch frontend and backend.
2. Select `expressjs/express` from the Repository Manager.
3. In the Git Graph, select commit `43fca52d` or file `lib/express.js`.
4. Click **Ask WHY** in the node panel.
5. EngiTrace extracts the commit history and PR discussions, validates temporal boundaries, and presents a grounded explanation with verified evidence citations.

### Workflow 2: Blast-Radius Impact Analysis (WHAT IF Query)
1. Select target file `lib/middleware/init.js`.
2. Click **Analyze WHAT IF Impact**.
3. Select operation `MODIFY` or `DELETE`.
4. Graph engine computes incoming `DEPENDS_ON` and `CALLS` edges.
5. The UI displays an interactive blast-radius visualizer highlighting affected endpoints and test suites.

### Workflow 3: EEID Benchmark Evaluation Run
1. Run evaluation with test fixtures:
   ```bash
   npx tsx run_eeid_evaluation.ts --dataset evaluator/tests/fixtures/synthetic_approved_gold_records.jsonl --allow-test-fixtures
   ```
2. The evaluator executes all records against the backend, generates deterministic metrics, aggregates scores, and outputs a complete report with `SHA256SUMS.txt`.

---

## 23. Screenshots Section

| View | Description |
| :--- | :--- |
| **Landing & Hero Canvas** | Visual representation of software memory and interactive Git graph animation. |
| **Engineering Dashboard** | Multi-column command center uniting repository manager, graph visualizer, and intelligence details. |
| **Architecture Explorer** | Structural repository tree displaying directory hierarchies and module relationships. |
| **AI Investigation Panel** | Grounded chat interface with real-time evidence inspector and classification badges. |

*(Visual assets and test harness demos are available in `frontend/public/` and `frontend/src/assets/`)*.

---

## 24. Current Limitations

1. **Governance Gate for Official Benchmark**:
   - The EEID candidate records in `task3-remediation-proposal-v4.2.5` remain in `DRAFT` status pending formal human domain expert sign-off.
   - Aggregate benchmark scores cannot be officially published until dual-human sign-off is completed.
2. **Paired Benchmark Execution Pending**:
   - While Task 6 intelligence improvements have passed 100% of unit and regression tests, the paired pre/post benchmark execution has not yet run. Task 6 accuracy improvements remain an empirical hypothesis categorized as `NEEDS_BASELINE`.
3. **Provider Requirement for Semantic AI Reasoning**:
   - When `GEMINI_API_KEY` is not configured, the assistant defers AI semantic claims and provides deterministic graph fallbacks (`PROVIDER_CONFIGURATION_REQUIRED`).
4. **In-Memory Graph State**:
   - Repositories and graphs are cached in server memory. Restarting the backend re-seeds graphs from disk.
5. **Frontend Production Build**:
   - Frontend Vite development server and mock test harness are fully functional; static production compilation currently requires reconciling `urlSecurity.ts` utility exports.

---

## 25. Future Improvements

- **Persistent Graph Database**: Transition in-memory property graph to a distributed Neo4j or Memgraph instance.
- **Distributed Session Cache**: Replace in-memory session and rate-limit counters with Redis for multi-instance horizontal scaling.
- **Extended Language AST Extractors**: Add Tree-sitter grammars for Go, Python, Rust, and Java.
- **Formal EEID Gold Dataset Approval**: Complete independent dual-reviewer sign-off for Express, TanStack Query, and Payload CMS benchmarks.
- **Automated PR Review Integration**: GitHub Action running WHAT IF impact analysis and Decision Debt checks on incoming pull requests.

---

## 26. Attribution and Licensing

EngiTrace is open-source software licensed under the **Apache License 2.0** (or MIT where indicated).

### Open Source Pilot Repositories
The EEID evaluation framework benchmarks against public open-source software used in accordance with their respective open-source licenses:
- **Express**: Copyright (c) StrongLoop, Inc., and other expressjs.com contributors. Licensed under the MIT License.
- **TanStack Query**: Copyright (c) TanStack. Licensed under the MIT License.
- **Payload CMS**: Copyright (c) Payload, Inc. Licensed under the MIT License.

All trademarks, logos, and brand names are the property of their respective owners.
