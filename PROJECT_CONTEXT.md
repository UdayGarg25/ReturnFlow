# ReturnFlow — Verified Project Context

Last verified against the repository: 2026-10-18. The code is the source of truth; re-check anything here before relying on it. No secrets are recorded in this file.

## 2026-10-21 update — Redis Phase 6, Step 1 completed
- Corrected repository state: this repository now has committed `backend/` and `frontend/` application code; the old note saying they were entirely untracked is stale.
- Implemented files:
  - `backend/src/config/redis.js` (optional Redis lifecycle manager with idempotent initialize/close, bounded reconnect attempts, sanitized error logging, health state reporting).
  - `backend/src/health/readiness.js` (readiness payload for PostgreSQL + Redis dependency status).
  - `backend/src/lifecycle/gracefulShutdown.js` (idempotent shutdown helper with server drain timeout and safe Redis/PG resource cleanup).
  - `backend/src/app.js` (kept lightweight `/health` liveness; added `/health/ready` readiness endpoint).
  - `backend/src/server.js` (startup now initializes optional Redis without making startup fatal; SIGINT/SIGTERM graceful shutdown wiring).
  - `backend/.env.example` (added optional `REDIS_URL`, `SHUTDOWN_GRACE_MS`, `FORCE_SHUTDOWN_MS` placeholders).
  - `backend/tests/redis-phase6-step1.test.js` and `backend/package.json` (`test:redis-phase6` script).
- Redis decisions in this step:
  - Redis is optional. Blank/missing `REDIS_URL` means no Redis connection attempt.
  - Configured-but-unavailable Redis is logged with sanitized non-sensitive codes and reported as down; app startup still continues.
  - Health never reports Redis as connected unless the client is actually open and ready.
  - No Redis caching/rate-limiting/locks/pub-sub was added in this step.
- Health behavior:
  - `/health` => liveness `{ status: "ok" }`.
  - `/health/ready` => dependency health with separate `postgresql` and `redis`.
  - PostgreSQL down => readiness HTTP 503 and `status: "error"`.
  - PostgreSQL up + Redis absent/unavailable => readiness HTTP 200 and `status: "degraded"` (Redis explicitly not healthy).
- Graceful shutdown behavior:
  - On signal: stop accepting new requests (`server.close`), wait up to `SHUTDOWN_GRACE_MS`, then close Redis and PostgreSQL safely.
  - Shutdown is idempotent and logs repeated signal attempts without double-closing resources.
  - Forced process termination is bounded by `FORCE_SHUTDOWN_MS` in `server.js`.
- Tests and verification run (actual):
  - `cd backend && npm run test:redis-phase6` ✅ passed (6/6).
  - `cd backend && npm test` ❌ expected fail (`Error: no test specified`) because the repository still has no general backend test suite under `npm test`.
  - Manual startup/shutdown verification executed with temporary env values via `node --input-type=module` script:
    - `/health` returned 200 `{ status: "ok" }`
    - `/health/ready` returned 503 with PostgreSQL down and Redis `not_configured`
    - shutdown completed cleanly through the new graceful shutdown path.
- Remaining limitations:
  - No live Redis integration was run against a real Redis instance in this step.
  - Existing non-Redis backend checks (`test:s3`, `test:ai`, `test:ai:scenario`, `test:ai:live`) still require external services/credentials and were not run here.
- Exact next Phase 6 step:
  - Phase 6, Step 2: add **safe TTL Redis caching** for selected read-heavy, non-sensitive endpoints with explicit invalidation and no cross-user data leakage.

## 1. Git state (important)
- Branch `main`, one commit (`e716373 first commit`). `README.md` is modified; **`backend/` and `frontend/` are entirely untracked**, so none of the application code is committed yet.
- No root `.gitignore`. `backend/.gitignore` ignores `.env` and `node_modules/`; `frontend/.gitignore` exists. Verified `backend/.env` is ignored.
- Next safe housekeeping: review `git status`, then commit the work in logical commits (only when the owner asks).

## 2. Confirmed architecture
- **Frontend:** React + Vite + Tailwind, React Router, lucide icons. Pages for admin, customer, pickup, seller, warehouse, shared profile, public `/demo`, invitation acceptance. Dev-only warehouse page `AiTestScenario.jsx` (route exists only when `import.meta.env.DEV`).
- **Backend:** Node + Express 5, ES modules, raw parameterized SQL with `pg` (no ORM). Layers: `routes → middleware → controllers → services → SQL`. `src/models/` is empty. Config in `src/config/` (`schema.sql`, `seed.sql`, `seed-demo.sql`, `setup.js`, `seedAdmin.js`, `s3.js`, `db.js`, `auth.js`).
- **Auth:** JWT in HttpOnly cookie, credentialed CORS allowlist, `authenticate` + `authorize(ROLE)` middleware, ownership checks in services. No token revocation (a copied JWT stays valid until expiry).
- **Roles:** CUSTOMER, SELLER, PICKUP_AGENT, WAREHOUSE, ADMIN (DB `CHECK`). Invitations (SELLER/PICKUP_AGENT/WAREHOUSE) via Resend email.
- **Storage:** PostgreSQL for business data; private S3 bucket (eu-north-1) for return photos and the Sony reference image; DB stores keys/metadata only.
- **AI:** `@openrouter/sdk`; model/provider from env (defaults `dots-studio/dots-3-note-preview:free`, provider `atlas-cloud/fp8`, fallbacks disabled). Strict hand-written JSON validator; results in `ai_assessments`; advisory only.

## 3. Verified state machines (from `schema.sql`)
- Return: RETURN_REQUESTED, SELLER_APPROVED, SELLER_REJECTED, PICKUP_ASSIGNED, PICKED_UP, WAREHOUSE_RECEIVED, INSPECTION, INSPECTION_APPROVED, INSPECTION_REJECTED, REFUND_PENDING, REFUNDED, COMPLETED.
- Pickup: ASSIGNED, ACCEPTED, PICKED_UP, FAILED, CANCELLED. Inspection: PENDING, IN_PROGRESS, APPROVED, REJECTED, MANUAL_REVIEW. Refund: PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED. AI assessment: RUNNING, COMPLETED, FAILED. Order: PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED.
- Automation: seller approval assigns a pickup; pickup `PICKED_UP` opens a warehouse inspection; warehouse approval creates a **PENDING refund record**. There is **no payment gateway**: `REFUND_PENDING` is not money paid.

## 4. Completed features (verified present in code)
Auth/RBAC; customer, seller, pickup, warehouse and admin APIs and UIs; invitations + email; demo seed data and guided `/demo`; lifecycle automation; customer Refunds page; private S3 layer; return photos (max 2, 5 MB, JPEG/PNG/WebP by signature, server-generated keys, status-restricted edits, authenticated streaming); Sony reference image + product images; AI-assisted warehouse inspection (async, persisted, polled, retry-safe, seller sees summary only); development-only isolated AI test scenario.

## 5. Redis / Docker / Socket.IO / Nginx — NOT implemented
- No Redis, Socket.IO, Docker, Compose or Nginx code or files. No `Dockerfile`, no compose file, no nginx config.
- **Discrepancy:** `backend/package.json` lists `redis`, `socket.io` and `mongoose` as dependencies, but nothing imports them (grep of `src/` and `scripts/` confirmed). `mongoose` is not part of the architecture and is a candidate for removal (ask first).
- Rate limiting is in-memory per process (`rateLimit.middleware.js`, with a comment noting Redis is needed for multiple instances). No `trust proxy` setting. `server.js` has no graceful shutdown (no SIGTERM/SIGINT handling) and only a basic `/health`.

## 6. Scripts and tests (backend `package.json`)
`dev`, `start`, `db:schema`, `db:seed`, `db:seed-demo`, `db:seed-admin`, `db:reset` (destructive), `setup:sony-image`, `test:s3`, `test:ai` (24 mocked checks), `test:ai:live` (opt-in, real quota), `test:ai:scenario` (12 checks, mock OpenRouter + real DB/S3). `npm test` is a placeholder. There is no general API test suite committed; earlier API/browser checks were ad-hoc scratch scripts. Frontend: `npm run lint`, `npm run build`.
Last results (2026-10-17): `test:ai` 24/24, `test:ai:scenario` 12/12 (one earlier run failed with an unexplained `fetch failed`; reruns passed), `test:s3` passed, lint clean, build ok.

## 7. Known issues and open items
- Real two-image live AI comparison is **pending**: needs a user-supplied real Sony WH-1000XM5 photo (use `/dashboard/dev/ai-test` with `AI_TEST_SCENARIO=true`, or `npm run test:ai:live -- --photo <file>`). Model accuracy is unmeasured.
- Free model's shared pool can return HTTP 429; no retries are made automatically.
- Guided demo uses shared data; concurrent visitors can interfere.
- Demo accounts use `Password123!` per seed scripts; verify before relying on IDs (order 28 / product 3 / item 481 may be stale).
- Rate limits are per process; in-memory counters will not work across instances.
- Nothing is committed (see section 1).

## 8. Roadmap (not started: Redis phase and later)
1. **Phase 6 Redis** (incremental): client + lifecycle/health/graceful shutdown → TTL caching of safe read-heavy data (never cross-user) → Redis-backed rate limiting preserving current limits → locks only for a justified operation (never replacing PG transactions) → Pub/Sub for cross-instance events (not durable).
2. **Phase 7 Socket.IO:** authorized, per-user/role events for return, pickup, inspection and refund changes; Redis adapter; test reconnects and multiple instances.
3. **Phase 9 Scaling:** Docker/Compose, Nginx proxy + load balance, multiple Node instances, health checks, graceful shutdown, `trust proxy`, shared state, deployment config. Do not claim horizontal scaling until multiple instances are actually run and tested.

## 9. Recommended next step
Commit the existing work (with owner approval), then start Phase 6 step 1 only: add a Redis client module (`src/config/redis.js`) with optional connection (app still boots without Redis), error handling, health reporting in `/health`, and graceful shutdown in `server.js`; local Redis via Docker or a local install. Propose the plan and get approval before coding. Keep AI advisory, keep the S3 bucket private, never print secrets.
