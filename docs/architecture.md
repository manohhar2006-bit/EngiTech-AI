# EngiTrace Architecture Overview

## 1. System Philosophy

EngiTrace operates as a **Digital Archaeology System for Software**. Most developer tools operate on the current snapshot of code (linters, static analyzers, LLM autocomplete). EngiTrace operates on the **temporal dimension of code**, treating code as an evolved byproduct of human engineering decisions, incidents, pull requests, and dependencies.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                             FRONTEND (UI)                               │
│        Landing Page | Interactive WhyGraph | Engineering Time Machine    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ REST / WebSocket
┌────────────────────────────────────▼────────────────────────────────────┐
│                             BACKEND API                                 │
│        Orchestration | Auth | Query Router | Cache Layer               │
└─────────┬──────────────────────────┬──────────────────────────┬─────────┘
          │                          │                          │
┌─────────▼────────┐       ┌─────────▼────────┐       ┌─────────▼────────┐
│    ANALYZER      │       │   GRAPH ENGINE   │       │    AI ENGINE     │
│ AST & Git Mining │──────►│ WhyGraph Database│──────►│ Evidence & Risk  │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

---

## 2. Decoupled Multi-Tier System Architecture

### Tier 1: Frontend (`frontend/`)
- **Role**: High-performance interactive UI.
- **Tech Stack**: React, TypeScript, Vite, Tailwind CSS, Framer Motion, HTML5 Canvas 2D.
- **Key Responsibilities**:
  - Interactive graph visualization rendering nodes (`COMMIT`, `DECISION`, `FILE`, `FUNCTION`, `ISSUE`, `DEPENDENCY`, `INCIDENT`, `AUTHOR`).
  - Interactive timeline scrubber for code evolution.
  - Evidence-backed AI explanation interface.
  - Decision Debt Dashboard shell.

### Tier 2: Backend API (`backend/`)
- **Role**: Orchestrates data flow between analyzer, graph store, AI engine, and user clients.
- **Tech Stack**: Node.js, Express, TypeScript.
- **Key Responsibilities**:
  - Exposing REST API endpoints `/api/v1/repositories`, `/api/v1/whygraph`, `/api/v1/decisions`.
  - Managing repository analysis tasks and background jobs.
  - Authentication and repository access controls.

### Tier 3: Repository Analyzer (`analyzer/`)
- **Role**: Extracts structural and historical artifacts from target codebases.
- **Tech Stack**: Python / TypeScript AST Parsers, GitPython, Tree-sitter.
- **Key Responsibilities**:
  - Parsing Git commit logs, diffs, blame ranges, and author metadata.
  - Analyzing ASTs to identify functions, imports, classes, and file dependencies.
  - Correlating pull request descriptions and commit messages with issue trackers.

### Tier 4: WhyGraph Engine (`graph-engine/`)
- **Role**: Constructs and queries the temporal software graph.
- **Tech Stack**: TypeScript / Neo4j / NetworkX graph algorithms.
- **Key Responsibilities**:
  - Storing connected nodes and weighted directed edges.
  - Traversal algorithms for calculating historical impact paths.
  - Subgraph extraction for targeted AI prompts.

### Tier 5: AI Engine (`ai-engine/`)
- **Role**: Performs evidence-based reasoning over the WhyGraph.
- **Tech Stack**: LangChain / Custom prompt pipeline, LLM integration.
- **Key Responsibilities**:
  - Synthesizing natural-language answers to "Why" questions.
  - Verifying every claim against commit hashes, PRs, and incident logs.
  - Scoring Decision Debt based on architectural drift and aging assumptions.

---

## 3. Communication Strategy & Isolation Rules

1. **Strict Service Boundaries**: The Frontend MUST NOT directly invoke the analyzer or AI engine. All interactions flow through the API gateway layer or isolated client services.
2. **Mock Data Layer**: During Phase 0, all data is served from typed mock data sources in `frontend/src/data/`. This enables full UI implementation while backend modules are developed independently.
3. **Event-Driven Analysis Pipeline**: When a repository is connected in future phases, the Analyzer publishes parsing events to a message queue, triggering graph indexing and AI risk assessment asynchronously.
