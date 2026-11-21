# EngiTrace Implementation Roadmap

This document outlines the multi-phase implementation path for **EngiTrace**.

---

## 📍 Phase 0 — Foundation & Premium Visual Homepage (CURRENT)

### Objectives
- Establish clean multi-module directory architecture.
- Create production-quality React + TypeScript + Vite + Tailwind CSS frontend.
- Build interactive Canvas 2D hero graph visualizer.
- Implement landing page sections (Hero, Problem, How It Works, Timeline, Ask WHY, Decision Debt, CTA).
- Implement Command Center Dashboard shell (`/dashboard`).
- Establish isolated mock data architecture and complete documentation.

---

## ⚙️ Phase 1 — Repository Parsing & Git Mining

### Objectives
- Build AST parsing engine with Tree-sitter for multi-language support (JS/TS, Python, Go).
- Implement Git log extractor (commit messages, diffs, blame ranges, author timelines).
- Extract file & function-level dependency trees.
- Connect PR descriptions, issue keys (Jira/GitHub Issues), and commit messages.

---

## 🕸️ Phase 2 — WhyGraph™ Construction & Query Engine

### Objectives
- Build graph schema: `COMMIT`, `DECISION`, `FILE`, `FUNCTION`, `ISSUE`, `DEPENDENCY`, `INCIDENT`, `AUTHOR`.
- Integrate Neo4j / NetworkX graph engine.
- Implement temporal edge creation (`INTRODUCED_IN`, `MODIFIED_BY`, `RESOLVED_INCIDENT`, `DEPENDS_ON`).
- Implement subgraph query algorithms for targeted code path reconstruction.

---

## 🧠 Phase 3 — AI Reasoning & Evidence Verification Engine

### Objectives
- Design prompt chaining pipeline for natural language "Why" queries.
- Implement strict evidence verification (every answer must reference verified commits/issues).
- Build confidence scoring algorithms based on graph distance and source freshness.
- Implement streaming response interface for live UI rendering.

---

## ⚖️ Phase 4 — Decision Debt Engine & CI/CD Integration

### Objectives
- Build Decision Debt scoring engine (quantifying architectural drift, obsolete dependencies, and stale assumptions).
- Create automated GitHub Action / GitLab CI plugin for pull request impact analysis.
- Build Slack & GitHub bot notification triggers for high-risk architectural changes.
- Enterprise SSO, team management, and multi-repository indexer.
