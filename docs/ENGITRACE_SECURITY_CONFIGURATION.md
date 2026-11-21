# EngiTrace Security Configuration Guide

## 1. Security Architecture Overview

EngiTrace implements a defense-in-depth backend security boundary so application authentication, authorization, secret management, input validation, rate limiting, and AI output verification are enforced on the server rather than relying on prompt instructions or client checks.

### Single-Workspace Operator Authentication Model
The current application uses a **Single-Workspace Operator (`SINGLE_WORKSPACE_OPERATOR`)** authentication model backed by environment configuration:

- No plaintext passwords are stored in code or configuration.
- Operator passwords are verified in constant time using Node.js native `scrypt` (`N=16384, r=8, p=1, keylen=64`) with per-hash 16-byte random salts (`backend/src/security/passwordHash.ts`).
- Browser sessions use HMAC-SHA256 signed cookies (`engitrace_sid`) stored in `HttpOnly`, `SameSite=Lax` cookies (`Secure` enforced in production or when `ENGITRACE_COOKIE_SECURE=true`), never in `localStorage` or `sessionStorage`.
- Session fixation is prevented by rotating session IDs and revoking prior cookies on login (`backend/src/security/authService.ts`).
- Every state-changing request (`POST`, etc.) requires both `Origin`/`Referer` allowlist validation and a session-bound `X-CSRF-Token` header (`backend/src/security/authMiddleware.ts`).

---

## 2. Bootstrapping Operator Credentials

Generate a salted `scrypt` password hash before starting the backend:

```bash
npm --prefix backend run hash-password -- "YourStrongOperatorPassword!"
```

Copy the output `scrypt$N=16384,r=8,p=1$...` string into `backend/.env` as `ENGITRACE_OPERATOR_PASSWORD_HASH`.

Generate a production session signing secret (minimum 32 characters; 48+ random bytes recommended):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Store the generated secret in `backend/.env` as `ENGITRACE_SESSION_SECRET`.

---

## 3. Environment Variables Reference

Never commit `.env` or `backend/.env` files (both are ignored by `.gitignore`). Use `.env.example` and `backend/.env.example` as templates.

| Variable | Scope | Default / Requirement | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Backend | `development` (`production` in prod) | Enables HSTS, `Secure` cookies, and strict origin/secret enforcement |
| `PORT` | Backend | `4000` | Express server listen port |
| `VITE_API_URL` | Frontend | `http://localhost:4000/api/v1` | Backend API base URL |
| `GITHUB_TOKEN` | Backend only | Required for private/unthrottled repos | GitHub REST API personal access token |
| `GEMINI_API_KEY` | Backend only | Required for live AI reasoning | Google Gemini API key (sent strictly via `x-goog-api-key` header) |
| `GEMINI_MODEL` | Backend only | `gemini-3.6-flash` | Validated Gemini model identifier |
| `ENGITRACE_OPERATOR_USERNAME` | Backend only | `operator` | Operator username for login |
| `ENGITRACE_OPERATOR_PASSWORD_HASH` | Backend only | **Required** (`scrypt$...`) | Salted `scrypt` password hash generated via `hash-password` |
| `ENGITRACE_SESSION_SECRET` | Backend only | Required >=32 chars in production | HMAC-SHA256 key signing `engitrace_sid` cookies |
| `ENGITRACE_WORKSPACE_ID` | Backend only | `workspace-default` | Operator workspace ownership identifier |
| `ENGITRACE_ALLOWED_ORIGINS` | Backend | `http://localhost:5173,http://127.0.0.1:5173` (dev); empty/explicit required in production | Comma-separated CORS and CSRF `Origin` allowlist |
| `ENGITRACE_SESSION_TTL_MS` | Backend | `43200000` (12 hours, min 60000) | Maximum absolute session lifetime |
| `ENGITRACE_SESSION_IDLE_MS` | Backend | `1800000` (30 minutes, min 60000) | Session inactivity timeout |
| `ENGITRACE_COOKIE_SECURE` | Backend | `true` in production / HTTPS | Optional explicit override for cookie `Secure` flag |
| `ENGITRACE_RATE_LIMIT_WINDOW_MS` | Backend | `900000` (15 minutes) | Fixed window duration for all API limiters |
| `ENGITRACE_RATE_LIMIT_MAX_LOGIN` | Backend | `10` | Max login attempts per window |
| `ENGITRACE_RATE_LIMIT_MAX_ANALYZE` | Backend | `10` | Max `/analyze` requests per window |
| `ENGITRACE_RATE_LIMIT_MAX_CHAT` | Backend | `30` | Max AI chat turns per window |
| `ENGITRACE_RATE_LIMIT_MAX_AI_REASONING` | Backend | `25` | Max WHY / Debt / Impact AI explanation requests per window |
| `ENGITRACE_RATE_LIMIT_MAX_GENERAL` | Backend | `240` | Max general `/api/v1/repositories` requests per window |

---

## 4. Production Deployment Requirements & Operational Limitations

1. **HTTPS Termination**: Always serve both the frontend and backend behind TLS (`https://`). Set `NODE_ENV=production` so `engitrace_sid` cookies carry `Secure` and HSTS (`max-age=15552000; includeSubDomains`) is active.
2. **Explicit `ENGITRACE_ALLOWED_ORIGINS` & `ENGITRACE_SESSION_SECRET`**: In production (`NODE_ENV=production`), EngiTrace refuses empty/default ephemeral session secrets and blocks unlisted browser origins (`callback(null, false)`).
3. **Single-Instance In-Memory Storage Limitation**:
   - The current session store (`sessionStore` in `backend/src/security/authService.ts`) and rate-limit counters (`express-rate-limit` default `MemoryStore` in `backend/src/security/rateLimiter.ts`) are process-local (`IN_MEMORY_SINGLE_INSTANCE`).
   - Do **not** deploy horizontally scaled multi-worker clusters with in-memory stores without replacing them with a shared persistent store (such as Redis) for sessions, workspace ownership, and distributed rate limiting.
4. **Reverse Proxy Header Trust**: If running behind Nginx/Caddy/ALB, configure `app.set('trust proxy', 1)` (only when fronted by a trusted proxy) so client IPs and HTTPS scheme detection (`req.secure`) reflect actual client connections accurately.
5. **AI Safety Boundary**: Repository files, comments, READMEs, commit messages, PRs, issues, and manifests are treated strictly as `UNTRUSTED_DATA` envelopes inside Gemini requests (`ai-engine/security/promptSecurity.ts`). Never assume AI model instructions alone guarantee security; backend schema, repository isolation, and evidence ID validation remain mandatory.

