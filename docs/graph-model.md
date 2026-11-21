# EngiTrace WhyGraph™ Ontology & Data Model

The **WhyGraph™** is a temporal property graph that models how code changes, human decisions, dependencies, and incidents interconnect over time.

---

## 1. Node Types (`WhyNode`)

| Node Type | Icon | Color | Description | Key Attributes |
| :--- | :--- | :--- | :--- | :--- |
| `COMMIT` | `GitCommit` | `#3B82F6` (Blue) | A Git commit snapshot | `hash`, `author`, `timestamp`, `message` |
| `DECISION` | `FileText` | `#8B5CF6` (Purple) | Architectural decision record (ADR) | `id`, `title`, `rationale`, `status`, `debtScore` |
| `FILE` | `FileCode` | `#10B981` (Green) | Source code file | `path`, `language`, `lines`, `churn` |
| `FUNCTION` | `Code` | `#14B8A6` (Teal) | Specific method/function | `name`, `signature`, `complexity` |
| `ISSUE` | `AlertCircle` | `#F59E0B` (Amber) | Bug report or feature ticket | `key`, `title`, `state`, `createdDate` |
| `DEPENDENCY` | `Package` | `#EC4899` (Pink) | External package/library | `name`, `version`, `license`, `vulnerabilities` |
| `INCIDENT` | `ShieldAlert` | `#EF4444` (Red) | Production outage or security breach | `id`, `severity`, `summary`, `rootCause` |
| `AUTHOR` | `User` | `#6366F1` (Indigo) | Developer or team member | `id`, `name`, `email`, `contributions` |

---

## 2. Edge Relationships (`WhyEdge`)

```text
(AUTHOR) ────────► [AUTHORED] ─────────► (COMMIT)
(COMMIT) ────────► [MODIFIED] ─────────► (FILE)
(FILE) ──────────► [CONTAINS] ─────────► (FUNCTION)
(COMMIT) ────────► [RESOLVED] ─────────► (INCIDENT)
(DECISION) ──────► [MOTIVATED_BY] ─────► (INCIDENT)
(DECISION) ──────► [APPLIES_TO] ───────► (FILE / DEPENDENCY)
(FILE) ──────────► [DEPENDS_ON] ───────► (DEPENDENCY)
```

---

## 3. JSON Node Schema Example

```json
{
  "id": "node-dec-042",
  "type": "DECISION",
  "label": "Introduce Redis Caching Layer",
  "data": {
    "rationale": "High database load during flash sale peak caused connection pool exhaustion.",
    "debtScore": 18,
    "status": "active",
    "timestamp": "2024-11-12T14:30:00Z"
  }
}
```
