# ReturnFlow — Verified Project Context

Last verified against the repository: 2026-10-23. The code is the source of truth; re-check anything here before relying on it. No secrets are recorded in this file.

## Current Development State: Phase 6, Step 4 — Redis Distributed Locks (Verified & Stable)

Phase 6 Step 1 established Redis foundation, health probes, and graceful shutdown.
Phase 6 Step 2 introduced Cache-Aside TTL caching on catalog and seller inventory with explicit invalidation.
Phase 6 Step 3 introduced distributed rate limiting using atomic Lua scripts and explicit fallback policies.
Phase 6 Step 4 introduces a reusable Redis distributed lock service (`redisLock.service.js`) with atomic acquisition (`SET NX PX`), safe release via atomic compare-and-delete Lua script, bounded timeouts, and integration into the AI assessment workflow.

### 1. Implemented & Verified Files (Phase 6, Steps 1 through 4)
- `backend/src/services/redisLock.service.js`:
  - Reusable distributed lock manager (`acquireLock`, `releaseLock`, `withLock`).
  - Key format: `rf:lock:${resourceKey}`.
  - Ownership: UUIDv4 token (`crypto.randomUUID()`) guarantees unguessable, unique lock ownership per attempt.
  - Acquisition: Single-command atomic `SET lockKey token NX PX ttlMs` (default 10,000ms via `REDIS_LOCK_DEFAULT_TTL_MS`).
  - Contention & Timeout: Non-blocking try-once by default (`timeoutMs = 0`), or bounded retry loop (`timeoutMs`, `retryDelayMs = 50ms`).
  - Safe Release: Atomic Lua script compare-and-delete (`if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`). Prevents older owners from accidentally deleting a newer owner's lock if lease expires.
  - Error Classes: `LockContentionError` (409 conflict), `LockTimeoutError`, and `RedisUnavailableError`.
  - Resilience: `withLock` guarantees release in `finally` and preserves original business callback exceptions without release error masking. Supports `bypassIfDbGuarded` for operations independently protected by PostgreSQL constraints.
- `backend/src/services/aiInspection.service.js`:
  - Integrated `withLock('ai-assessment:${inspectionId}')` into `startAssessment`.
  - Protects against duplicate concurrent background AI workflows, preventing redundant S3 image downloads and OpenRouter LLM billing.
  - Contention raises `LockContentionError` mapped to HTTP 409 conflict.
  - PostgreSQL's `INSERT ... ON CONFLICT (inspection_id) DO UPDATE` remains the durable source of truth; `bypassIfDbGuarded: true` ensures graceful fallback if Redis is offline.
- `backend/src/config/redis.js`:
  - Redis lifecycle manager with socket timeout (`REDIS_SOCKET_TIMEOUT_MS = 2000`) and safe client accessor `getRedisClient()`.
- `backend/src/middleware/rateLimit.middleware.js`:
  - Distributed rate limiting with atomic Lua scripts, `trust proxy` protections, credential hashing, and explicit fallback policies.
- `backend/src/app.js`:
  - Mounts `apiLimiter` on `/api/*`, exports safe proxy trust via `TRUST_PROXY`. Health endpoints remain exempt.
- `backend/src/services/cache.service.js`:
  - Reusable Cache-Aside helper with TTL and resilient fallback to PostgreSQL.
- `backend/src/services/product.service.js` & `backend/src/routes/product.routes.js`:
  - Public product catalog cached with TTL (`rf:catalog:all`, `rf:catalog:product:${id}`).
- `backend/src/services/seller.service.js`:
  - Seller product listing cached under seller-isolated keys (`rf:seller:${sellerId}:products`) with invalidation hooks.
- `backend/tests/lock-phase6-step4.test.js` & `backend/package.json` (`test:lock-phase6`):
  - 12-test deterministic suite covering acquisition, contention, independent resource keys, release authorization, expiry, safe compare-and-delete on expired locks, timeout handling, connection failures, error propagation, and AI assessment integration.
- `backend/tests/ratelimit-phase6-step3.test.js` (`test:ratelimit-phase6`):
  - 9-test deterministic suite for distributed limits, 429 Retry-After, IP spoofing defense, and login failures.
- `backend/tests/cache-phase6-step2.test.js` (`test:cache-phase6`):
  - 10-test deterministic suite for Cache-Aside, TTL, and tenant isolation.
- `backend/tests/redis-phase6-step1.test.js` (`test:redis-phase6`):
  - 12-test deterministic suite for Redis lifecycle, health probes, startup validation, and graceful shutdown.

### 2. Verified Test Results
- `npm run test:redis-phase6`: **12 / 12 passed**
- `npm run test:cache-phase6`: **10 / 10 passed**
- `npm run test:ratelimit-phase6`: **9 / 9 passed**
- `npm run test:lock-phase6`: **12 / 12 passed**
  - Verified:
    1. A lock can be acquired when the key is available.
    2. A second concurrent acquisition cannot acquire the same lock.
    3. Different resource keys can be locked independently.
    4. An owner can release its own lock.
    5. A request with the wrong token cannot release another owner's lock.
    6. An expired lock can be acquired again.
    7. An older owner cannot delete a newer owner's lock after expiry and reacquisition.
    8. Acquisition timeout and lock contention are handled correctly.
    9. Redis connection errors follow the documented failure policy (`fail_closed` / `bypassIfDbGuarded`).
    10. Callback errors propagate and cleanup is attempted safely.
    11. A release error does not silently hide the original callback error.
    12. `startAssessment` uses `withLock` with non-blocking fast-fail on lock contention.
- **Total active Phase 6 tests passing: 43 / 43.**

### 3. Git & Workspace State
- Branch: `copilot/udaygarg25returnflow`.
- Application source code in `backend/` and `frontend/` is committed and tracked.
- Local `backend/.env` is ignored by `.gitignore`.

### 4. Confirmed Architecture & Concurrency Control
- **PostgreSQL is the source of truth.** All business data resides in PostgreSQL; Redis distributed locks are coordination aids, never replacements for database transactions, unique constraints, or state machines.
- **Atomic Locking:** Atomic `SET NX PX` and atomic Compare-and-Delete Lua scripts prevent token leakage, race conditions, and accidental lock deletion across instances.
- **Finite Leases:** Every lock has a finite lease duration (`REDIS_LOCK_DEFAULT_TTL_MS`); deadlocks from crashed workers are impossible.

### 5. Out of Scope for Phase 6 Step 4 (Status Confirmed)
- Redis Pub/Sub / cross-instance event broadcasting: NOT yet implemented (scheduled for Step 5).
- Socket.IO integration: NOT yet implemented (Phase 7).
- Docker / Compose / Nginx: NOT implemented in this phase.
- `mongoose`: Retained per scope boundary instructions until explicitly approved for removal.

### 6. Known Limitations
- No local live Redis server is running on port 6379 in this environment; all Redis interactions and failure modes are validated via deterministic mocks and unit tests.
- Real Redis integration testing will be conducted before production deployment.

### 7. Precise Next Step
- **Phase 6, Step 5:** Implement **Redis Pub/Sub** for cross-instance coordination and event broadcasting (e.g. invalidation events and preparing for Phase 7 Socket.IO adapter).
