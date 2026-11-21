# ENGiTRACE AI IMPROVEMENT — PART 3 REPORT
# Security Hardening, Authentication, Authorization, and AI Safety

> **Phase:** Part 3 — Security Hardening (Following Approved Parts 1 and 2)  
> **Deliverable Report:** `docs/ENGITRACE_AI_IMPROVEMENT_PART_3_REPORT.md`  
> **Related Security Guide:** `docs/ENGITRACE_SECURITY_CONFIGURATION.md`

---

## 1. Executive Summary

Part 3 hardens EngiTrace end-to-end against unauthorized access, cross-repository / cross-workspace data probing, prompt injection via repository artifacts, API credential leakage, SSRF/path-traversal inputs, request abuse, and unsafe frontend link/markdown rendering—while preserving all approved Part 1 (evidence validation & FACT/INFERENCE/UNKNOWN grounding) and Part 2 (Tree-sitter AST analysis, deterministic dependency extraction, and bounded multi-file retrieval) functionality.

Application security controls are enforced independently by the Express backend and validators rather than relying on prompt wording alone. Repository files, comments, READMEs, commit messages, pull requests, issues, filenames, and dependency manifests are packaged as untrusted data envelopes (`UNTRUSTED_DATA`) structurally separated from Gemini `systemInstruction` directives.

---

## 2. Audit Verification Matrix (Before vs. After)

| Audit Concern | Verification Against Pre-Part-3 Code | Part 3 Hardening Applied |
| :--- | :--- | :--- |
| 1. Unauthenticated / unauthorized chat & API endpoints | **Confirmed**: `/api/v1/repositories` and `/chat` routes had no session authentication, CSRF verification, or workspace authorization middleware. | Added operator session auth (`POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/session`, `GET /api/v1/auth/csrf`), `requireAuth`, `csrfProtection`, and `requireRepositoryAccess`. |
| 2. Gemini API key passed via URL query string | **Confirmed**: `ProviderService` called `/v1/models/...:generateContent?key=${apiKey}`. | Switched to `/v1beta/models/...` with header-based `x-goog-api-key` authentication and zero `?key=` URL query parameters. |
| 3. Missing server-side rate limiting | **Confirmed**: No Express request rate limiting or per-repository ingestion locking existed. | Added `express-rate-limit` per-route limiters (`login`, `analyze`, `chat`, `aiReasoning`, `generalApi`) plus per-repository concurrency locking (`409 INGESTION_IN_PROGRESS`). |
| 4. Raw internal errors returned to HTTP clients | **Confirmed**: Controllers returned raw `err.message` strings or generic fallback messages with `details:` fields. | Centralized `sendSafeError` returning safe `{ error, code }` responses only, masking stack traces, parser errors, and provider internals. |
| 5. Repository artifacts concatenated into prompts | **Confirmed**: Commit messages, PRs, issues, source code, and user prompts were concatenated into single unstructured text prompts. | Established `systemInstruction` separation (`v1beta`), multi-turn `user`/`model` role framing, `<UNTRUSTED_REPOSITORY_EVIDENCE trustLevel="UNTRUSTED_DATA">` JSON envelopes, and `<USER_QUESTION>` separation. |
| 6. Prompt-injection boundary & non-AI safety | **Confirmed**: No structural delimiter escaping or explicit anti-injection boundary existed; `DecisionDebtAiService.signalExplanations` passed unvalidated AI `evidenceIds`. | Added anti-injection system rules, JSON angle-bracket escaping (`\u003c`/`\u003e`), cross-repository envelope filtering, and backend evidence-ID filtering/FACT->UNKNOWN downgrades across Reasoning, Chat, Impact AI, and Decision Debt AI. |
| 7. Secret leakage in logs & AI responses | **Confirmed**: Stack traces, tokens, URL query keys, and echoed secret patterns lacked centralized log/output masking. | Implemented `SafeLogger` / `redactSecrets` / `redactStructuredData` across server logs, safe HTTP errors, and outgoing AI responses in Chat, Impact AI, and Decision Debt AI. |
| 8. Sensitive operations & unsafe lookups | **Confirmed**: Repository lookup used `.endsWith` / `.includes` substring fallbacks; `GET /:id/why/:nodeId/explanation` remained callable; unencoded/malformed route params weren't uniformly caught; frontend rendered raw external `href`s / `window.open`. | Replaced substring fallbacks with exact canonical ID + exact `owner/repo` / alias indexes (`WorkspaceAccess`), blocked `GET` on `/explanation` (`405`), handled Express `URIError` (`400`), enforced Zod + HTTPS GitHub URL/path/redirect allowlists, and enforced HTTP/HTTPS URL sanitization (`SafeExternalLink`, `tokenizeInlineMarkdown`). |

---

## 3. Summary of Changes by Layer

### 3.1 AI Prompt Injection & Untrusted Content Boundary
- **`ai-engine/security/promptSecurity.ts`**:
  - Defines `ANTI_INJECTION_SYSTEM_RULES`, `UntrustedEvidenceEnvelope` (`evidenceId`, `repositoryId`, `source`, `type`, `lineRange`, `trustLevel: 'UNTRUSTED_DATA'`, `content`), `safeJsonForPromptBoundary` (escapes `<` and `>` as Unicode escapes inside JSON so repository payloads cannot close XML boundaries), `formatUntrustedEvidenceBlock`, `formatUntrustedUserQuestion`, and `buildUntrustedEnvelopesFromContext` (packaging selected source files, commit messages, PRs, issues, AST summaries, dependencies, graph relationships, and historical chains cleanly while enforcing `repositoryId` scoping).
- **`ai-engine/prompts/why.v1.ts`**: Embeds explicit non-overridable anti-injection rules alongside `<UNTRUSTED_REPOSITORY_EVIDENCE>` and `<USER_QUESTION>` framing.
- **`ai-engine/services/providerService.ts` & `ai-engine/services/reasoningService.ts`**:
  - Migrated Gemini requests to `/v1beta/models/{model}:generateContent` with native top-level `systemInstruction` separated from structured `contents`, `x-goog-api-key` header transmission, model name regex validation, and a `15000ms` request timeout.
- **`backend/src/controllers/chatController.ts`, `backend/src/services/impactAiService.ts`, `backend/src/services/decisionDebtAiService.ts`**:
  - Pass explicit `repositoryId` boundaries, validate returned `evidenceIds` against request-scoped valid IDs (downgrading unverified `FACT` assertions to `UNKNOWN` and stripping fabricated IDs including in `DecisionDebtAiService.signalExplanations`), prevent AI tampering with deterministic Decision Debt or Impact scores, and redact leaked secret patterns before HTTP response serialization.

### 3.2 Authentication, Sessions, CSRF & Authorization
- **`backend/src/security/passwordHash.ts` & `backend/src/scripts/hashPassword.ts`**:
  - Native Node.js `scrypt` (`N=16384, r=8, p=1, keylen=64`) with per-hash 16-byte CSPRNG salts and `crypto.timingSafeEqual` verification, plus `npm --prefix backend run hash-password` CLI helper.
- **`backend/src/security/authService.ts` & `backend/src/routes/authRoutes.ts`**:
  - Implements single-workspace operator authentication (`SINGLE_WORKSPACE_OPERATOR`) using environment-configured username and `scrypt` hash.
  - Signs session cookies (`engitrace_sid`) with HMAC-SHA256 (`ENGITRACE_SESSION_SECRET`), sets `HttpOnly` and `SameSite=Lax` (`Secure` in production or `ENGITRACE_COOKIE_SECURE=true`), enforces absolute TTL (default 12h) and idle expiry (default 30m), rotates sessions on re-login to prevent session fixation, and supports session revocation on `POST /api/v1/auth/logout`.
- **`backend/src/security/authMiddleware.ts` & `backend/src/security/workspaceAccess.ts`**:
  - Protects `/api/v1/repositories/*` routes with `requireAuth`, `csrfProtection` (`Origin`/`Referer` allowlist + timing-safe `X-CSRF-Token`), and `requireRepositoryAccess` (exact workspace ownership verification + canonical ID / exact registered `owner/repo` / registered alias mapping without `.endsWith` or `.includes` substring fallbacks).

### 3.3 Secret Redaction, GitHub API & Validation Hardening
- **`ai-engine/security/secretRedactor.ts` & `backend/src/security/secretRedactor.ts`**:
  - Redacts Google API keys (`AIza...`), GitHub PATs (`gh[pousr]_...`, `github_pat_...`), URL query secrets, `Bearer` tokens, `x-goog-api-key` / `x-csrf-token`, `Cookie` / `Set-Cookie`, password hashes, and active environment secret values across structured logs and API error payloads.
- **`backend/src/services/githubService.ts`**:
  - Added typed `GitHubServiceError` categories, `safeGitHubFetch` enforcing HTTPS GitHub host allowlists and manual redirect verification with `AbortSignal.timeout(15000)`, removed `401` unauthenticated retry fallback, and halted concurrent batch file loops immediately on `401` or `429`.
- **`backend/src/security/validation.ts`, `rateLimiter.ts`, `app.ts`**:
  - Configured `helmet` (`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, disabled `X-Powered-By`, HSTS in production), strict `cors`, `256kb` JSON limit (`413`), Zod validation schemas, `URIError` / malformed percent-encoding handling (`400 INVALID_PARAMETER`), strict GitHub URL / repository path validation, per-repository concurrent ingestion lock (`409 INGESTION_IN_PROGRESS`), HTTP `405` blocking `GET /:id/why/:nodeId/explanation`, and endpoint-specific rate limiters.

### 3.4 Frontend Authentication & Output Security
- **`frontend/src/services/authClient.ts`, `frontend/src/context/AuthContext.tsx`, `frontend/src/components/auth/AuthModal.tsx`, `SessionControl.tsx`**:
  - Migrated frontend API clients (`apiService.ts`, `whyService.ts`, `impactService.ts`, `graphService.ts`, `decisionDebtService.ts`, `aiAssistantService.ts`, `WhyGraphPage.tsx`) to `apiFetch` with `credentials: 'include'` and in-memory `X-CSRF-Token` headers (zero session credentials stored in `localStorage` or `sessionStorage`).
- **`frontend/src/utils/urlSecurity.ts`, `frontend/src/utils/markdownSecurity.ts`, `frontend/src/components/ui/SafeExternalLink.tsx`, `MarkdownRenderer.tsx`, `frontend/index.html`**:
  - Rejects control characters and non-HTTP/HTTPS protocols (`javascript:`, `data:`, `vbscript:`, `file:`), converts unsafe markdown links to plain text labels while keeping raw HTML inert in JSX text nodes, and updated external source anchors and window navigation across evidence, graph, dashboard, and assistant views to `<SafeExternalLink>` / `safeOpenExternalUrl`.

---

## 4. Verification & Security Test Coverage

Four dedicated offline security regression suites were added in `backend/tests/` and integrated into `backend/package.json` `"test"` alongside all 13 pre-existing Phase 1–6 / Part 1 / Part 2 suites:

1. `backend/tests/securityAuthAndAuthz.test.ts` (Groups A & B): Verifies `helmet` security headers, `401` on unauthenticated protected routes, `401` on bad credentials, forged cookie rejection, `HttpOnly` + `SameSite=Lax` cookie attributes, `Origin` + `X-CSRF-Token` enforcement (`403`), `405` on `GET /why/:nodeId/explanation`, `404` on unanalyzed repos, `403` cross-workspace isolation, session fixation rotation, idle timeout expiration, and logout revocation.
2. `backend/tests/securityPromptInjection.test.ts` (Group C): Simulates prompt-injection fixtures inside code comments, READMEs, commit messages, PR descriptions, issue bodies, and filenames across `ReasoningService`, `ChatController.handleChat`, `ImpactAiService`, and `DecisionDebtAiService`, confirming separate `systemInstruction`, JSON angle-bracket escaping inside `UNTRUSTED_DATA` envelopes, strict cross-repository isolation, `FACT` -> `UNKNOWN` downgrade on fabricated IDs, immutable deterministic Impact/Debt scores, and secret redaction on echoed secrets.
3. `backend/tests/securitySecretsRateLimitValidation.test.ts` (Groups D, E & F): Verifies `x-goog-api-key` header usage (no `?key=` URL query strings), secret redaction utilities, `GitHubService` `401` batch halt + SSRF redirect blocking, `validateAndNormalizeGitHubUrl` / `validateSafeRepoPath` / `safeDecodeURIComponent`, malformed JSON (`400`) & payload limit (`413`), HTTP `URIError` handling (`400`), `429` login rate limiting, and `409` per-repository concurrent ingestion lock.
4. `backend/tests/securityFrontendOutput.test.ts` (Group G): Verifies `sanitizeExternalUrl`, `tokenizeInlineMarkdown` neutralization of `javascript:` / `data:` / `<script>` payloads, absence of `dangerouslySetInnerHTML` / `innerHTML` / `eval()` / auth tokens in Web Storage across `frontend/src`, and zero embedded API keys or PAT patterns in `frontend/dist`.

### Executed Verification Commands & Latest Results
- `npm --prefix backend run build` (`tsc`) -> **PASSED** (exit code `0`).
- `npm --prefix backend test` (all 17 suites: `ingestion`, `graph`, `whyExplorer`, `aiReasoning`, `decisionDebt`, `impactAnalysis`, `chatController`, `chatRetriesAndFallback`, `chatValidationAndEvidence`, `dependencyExtraction`, `astAnalyzer`, `part2GraphAndIngestion`, `multiFileChatRetrieval`, `securityAuthAndAuthz`, `securityPromptInjection`, `securitySecretsRateLimitValidation`, `securityFrontendOutput`) -> **PASSED** (all 17 suites exited with code `0`; external Gemini/GitHub HTTP calls mocked offline cleanly in tests where external APIs are exercised).
- `npm --prefix frontend run build` (`tsc -b && vite build`) -> **PASSED** (exit code `0`, `1668 modules transformed`).

---

## 5. Residual Risks & Operational Limitations

1. **Prompt Injection Is Mitigated, Not Mathematically Eliminated**: Structural `systemInstruction` boundaries, `UNTRUSTED_DATA` envelopes, and backend evidence validation sharply reduce injection risk and enforce repository boundaries/output integrity, but foundational LLMs remain probabilistic and nuanced phrasing manipulations in text summaries are still an inherent residual risk.
2. **Process-Local In-Memory State (Single-Instance Scope)**: Session storage (`backend/src/security/authService.ts`), workspace repository ownership mappings (`backend/src/security/workspaceAccess.ts`), rate-limit counters (`backend/src/security/rateLimiter.ts`), and ingestion locks live in process memory (`IN_MEMORY_SINGLE_INSTANCE`) and reset on restart. Multi-instance production clusters require backing these components with a shared persistent store (such as Redis).
3. **Production TLS & Proxy Header Configuration**: Cookie `Secure` flags and HSTS depend on `NODE_ENV=production` behind HTTPS termination (or `ENGITRACE_COOKIE_SECURE=true`) and explicit `ENGITRACE_ALLOWED_ORIGINS` and `ENGITRACE_SESSION_SECRET` configuration as documented in `docs/ENGITRACE_SECURITY_CONFIGURATION.md`.
4. **Deferred Future Phases**: Parts 4 and 5 (such as multi-user RBAC/OAuth database authentication, persistent database storage, and further feature roadmap phases) remain intentionally out of scope for Part 3.

