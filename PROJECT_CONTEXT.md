# ReturnFlow — Verified Project Context

Last verified against the repository, a local PostgreSQL and a real Redis 7.4 container: 2026-11-05. The code is the source of truth; re-check anything here before relying on it. No secrets are recorded in this file.

## 1. Where the project stands

Application features (auth/RBAC, five role UIs, invitations, demo, lifecycle automation, private S3 photos, AI-assisted warehouse inspection, dev-only AI test scenario) are implemented. Phase 6 added Redis (connection, cache, rate limiting, locks) and an image fallback for demo/seller image URLs. An audit on 2026-11-04 found real defects; they were fixed in two rounds on 2026-11-05 (sections 4 and 5). **Not yet done:** Redis Pub/Sub, Socket.IO, Docker/Compose/Nginx, deployment, and any verification against the real deployment provider.

Stack: React + Vite + Tailwind; Node + Express 5 (ES modules); raw SQL with `pg`; JWT in an HttpOnly cookie; private AWS S3; OpenRouter; Resend; optional Redis. PostgreSQL is the source of truth, Redis is optional and never required for correctness.

## 2. Evidence levels (what "verified" means here)

| Area | Implemented | Unit-tested (mocks / local servers) | Integration-tested (real PostgreSQL / backend process) | Verified against real Redis 7.4 (local Docker) | Verified on deployment infrastructure |
|---|---|---|---|---|---|
| Redis connection, reconnect, command timeout | yes | yes | yes | **yes** (start, outage, late start, restart, hung server) | **no** |
| Cache-aside + invalidation | yes | yes | n/a | **yes** | no |
| Rate limiting (distributed, per-user API limit, atomic login-failure counter) | yes | yes | yes (two real backend processes) | **yes** | no |
| Locks (`SET NX PX` + Lua release) | yes | yes | n/a | **yes** | no |
| Redis auth (password) | yes | no | n/a | **yes** (ad hoc run, not committed) | no |
| Redis TLS (`rediss://`) | URL supported by the client | no | n/a | **no** | **no** |
| `safeFetch` SSRF protection (https only) | yes | yes (real function, local servers, injected DNS) | n/a | n/a | no |
| Seller image-URL validation | yes | yes | n/a | n/a | no |
| AI inspection SQL, evidence routes, demo photo route | yes | yes | **yes** (real schema; HTTP + real browser) | n/a | no |
| `/health/ready` access control | yes | yes | yes | yes | no |
| Docker / Nginx / multiple hosts / Pub/Sub / Socket.IO | **no** | no | no | no | no |

Nothing here is marked production-ready. Real deployment validation (provider Redis, TLS, proxy hops, load balancer, real HTTPS image hosts) has not been done.

## 3. Test commands (backend)

- `npm run test:unit` (97 tests; mocks and local test servers; needs `backend/.env` only for token signing).
- `npm run test:integration:db` (12 tests; real PostgreSQL; the demo-evidence test starts the real backend, issues GET requests only; the context test rolls everything back).
- `npm run test:integration:redis` (10 tests; needs Docker and the throwaway container `docker run -d --name rf-redis-test -p 127.0.0.1:6390:6379 redis:7-alpine`; the tests stop, pause and start it, so never point them at a shared Redis; they are skipped, not passed, when the container is absent; `--test-concurrency=1` because the files share it).
- `npm run test:ai` (29 checks, mock OpenRouter, real PostgreSQL/S3, uses a dedicated `[TEST]` product fixture it removes again; includes the Redis connected / down / restarted matrix against the `rf-redis-test` container and prints SKIPPED if that container is absent), `npm run test:ai:scenario` (12 checks), `npm run test:s3`, `npm run test:ai:live` (opt-in, real quota).
- Frontend: `npm run lint`, `npm run build`. A one-off browser run (not committed) confirmed that the warehouse inspection page shows the product picture and the demo customer photo.
- Last run 2026-11-05: all of the above passed.

## 4. Audit fixes, round 1 (verified)

C1 `loadContext` used a non-existent column; `safeFetch.js` rewritten (BlockList IP policy, pinned connection through a validating `lookup`, per-hop redirect validation, total deadline, size caps, magic bytes); Redis reconnects forever with capped jittered backoff, bounded startup wait, offline queue off, per-command timeout wrapper, correct `socketTimeout`; `withLock` no longer converts a release failure into an error; `TRUST_PROXY` parsed properly (hop counts, warning for `true`); replica-based tests replaced.

## 5. Audit fixes, round 2 (verified)

- **Seller image URLs:** `validateProduct` accepts only public `https://` domain names (no http, credentials, IP literals, `localhost`, internal suffixes); `safeFetchImage` is https-only on every hop (a test-only `allowHttp` switch exists for local servers) and is the only network image fetch in the codebase. No host allowlist.
- **Demo return photos:** a demo return keeps its sample photo in `return_requests.customer_image_url` (no database id). It is served by the explicit route `GET /api/warehouse/inspections/:id/evidence/demo-photo` (warehouse role only); the numeric route `/evidence/photos/:imageId` still requires a real integer id and can never reach it. The status endpoint marks that photo `demo: true`; the inspection panel uses the right route.
- **Demo image URLs:** the broken `example.com` references are replaced by bundled fixtures, written `demo-fixture:<file>` (strict file-name pattern, no paths) and read from `backend/assets/demo-fixtures/` with no network request. `seed-demo.sql` now writes them (checked by seeding a scratch database that was then dropped). `npm run db:demo-images` (idempotent, touches only rows still on `example.com`) was run once on the local database: 12 products and 11 returns updated. Products without a picture (Dell, Lenovo, JBL, Anker, boAt) now have `NULL`, so they correctly report "no reference image". Demo customer photos reuse the product picture; they are sample data, not photographs of damage.
- **Login-failure counter:** now atomic. Each attempt reserves a slot with one Lua `INCR` before it runs; success clears, a non-counted status (for example 400) refunds, a 401 or an aborted request stays counted. A test proves the old design let 25 of 25 concurrent attempts through and the new one allows exactly 5, also across two instances on real Redis.
- **`/health/ready`:** public callers get only `{"status": "ok|degraded|error"}` (the HTTP code still reflects PostgreSQL). Dependency detail and Redis error codes need an ADMIN session or the header `X-Health-Token` equal to `HEALTH_CHECK_TOKEN` (min. 16 characters; unset = token access off). `/health` (liveness) is unchanged.
- **AI test case restored:** "product without a reference image" runs against a dedicated `[TEST]` product fixture, not borrowed seed data.

## 5b. Incident 2026-11-05: "The AI service returned no answer" on inspection 140 (resolved)

- **Cause (reproduced with the real provider):** the provider (`atlas-cloud/fp8`, model `dots-studio/dots-3-note-preview:free`) answered with `finish_reason: content_filter` and `content: null`. Our code treated every empty text as `EMPTY_RESPONSE`. Bisecting the request showed the trigger is the customer's free-text description ("something wring"): the same images with only the structured reason code pass, the description alone is blocked, it is deterministic. Reasoning effort, JSON mode and prompt wording made no difference. Redis played no part.
- **Fix:** a provider `content_filter` is now its own outcome (`CONTENT_FILTERED`, message "safety filter blocked this assessment", no raw provider text). When it fires and a free-text description was sent, exactly ONE retry is made without that text; the saved result lists the omission in its limitations. Rate limits, timeouts and other failures are never retried automatically. Safe one-line diagnostics (provider, model, request id, finish reason, content kind, token counts, duration, image types and sizes, never keys, headers, prompts or image data) are logged as `[ai] ...`.
- **Redis log noise:** `REDIS_URL` was simply not set in the local `.env`, so Redis was "not configured", not disconnected. The limiter and lock warnings now say so and the limiter repeats a warning at most once a minute. The fallback policies are unchanged. A local dev Redis container `rf-redis-dev` (port 6379) was created and `REDIS_URL=redis://127.0.0.1:6379` added to the local `.env`; a running backend must be restarted to pick it up. `injected env (0)` is benign: `dotenv` is called from four modules and never overwrites variables that are already set.
- **Verified:** inspection 140 completed with the real provider (Redis connected, result saved and re-read). The AI suite proves the assessment completes with Redis connected, down and restarted, with exactly one of four simultaneous starts allowed in each state.

## 6. Open items and risks

- `GET /api/products` is public and returns `image_url`, so it now contains `demo-fixture:...` values for demo products (harmless, but visible).
- HTTPS fetching of real seller image hosts, certificate validation on real hosts, and DNS behaviour in the deployment network are untested (tests use local plain-http servers with an injected resolver). The server still fetches any public HTTPS URL a seller enters, by design.
- Seeded data that predates this work in other databases needs `npm run db:demo-images` once.
- Redis TLS and provider authentication are untested; the client reads `rediss://` from `REDIS_URL` with default certificate verification (no custom CA option).
- A wrong Redis password leaves the client retrying (up to every 30 s), degraded and logged at most once per 30 s per error code.
- `TRUST_PROXY` must be set to the number of proxies in production (Render: usually 1), or all users share one IP.
- A leftover product named `TEST` (id 72) exists in the local database from earlier manual use; not created by the test suite.
- Unused dependencies `mongoose` and `socket.io`.
- The provider's content filter can fire on other inputs; when the retry without free text is also blocked, staff see the safety-filter message and inspect manually.
- Nothing from these rounds is committed. Branch `copilot/udaygarg25returnflow`.

## 7. Roadmap (not started)

1. Phase 6 step 5: Redis Pub/Sub (not durable storage) for cross-instance events.
2. Phase 7: Socket.IO with authorised, per-user/role events and the Redis adapter; test reconnects and multiple instances.
3. Phase 9: Docker/Compose, Nginx, multiple Node instances, health checks, trusted-proxy IP handling, deployment config. Do not claim horizontal scaling until multiple instances run behind the proxy and are tested.

## 8. Exact next step

Commit the current work, then validate on the real deployment provider (managed Redis with TLS and a password, `TRUST_PROXY`, HTTPS image fetching, `HEALTH_CHECK_TOKEN` wired into the platform health check) before starting Pub/Sub.

## 9. Pre-deployment audit (2026-11-06)

Planned hosting: Vercel (frontend), Render (backend), Supabase (PostgreSQL), managed Redis with TLS, private S3 bucket. **None of these providers has been connected or tested.** Firebase and Socket.IO are NOT used anywhere (auth is a JWT in an HttpOnly cookie with bcrypt passwords; `socket.io` and `mongoose` are unused dependencies awaiting approval for removal).

Fixed in this audit (all covered by `tests/deploy-config.test.js`, 111 unit tests in total): the database pool now accepts `DATABASE_URL` with automatic TLS for remote hosts, configurable pool limits and timeouts, and an error handler for dropped idle connections (before, it only read `DB_*`, never used TLS and a dropped idle connection could crash the process); `setup.js` refuses `--reset`, `--seed` and `--demo-only` when `NODE_ENV=production` or `DATABASE_URL` is set unless `CONFIRM_DROP_ALL_TABLES=yes` / `CONFIRM_SEED_DEMO_DATA=yes`; `frontend/vercel.json` adds the SPA rewrite; a production frontend build fails without an https `VITE_API_URL`; backend `engines` (`>=20`); `X-Powered-By` removed and `nosniff` added; `npm audit fix` cleared the multer / body-parser / qs advisories and the unused `axios` was removed (both packages: 0 production vulnerabilities).

**Decision still required before going live: cookies across sites.** The session cookie is `SameSite=Lax` (and `Secure` in production). A frontend on `*.vercel.app` and an API on `*.onrender.com` are different sites, so browsers will not send the cookie on the API calls and nobody can stay logged in. The safe fix is no code change: serve both under one registrable domain (for example `app.example.com` on Vercel and `api.example.com` on Render). `COOKIE_SAMESITE=none` is NOT a safe workaround here: there is no CSRF token, and third-party cookies are blocked by several browsers.

Safe database setup for a fresh production database: `npm run db:schema` (idempotent, only `CREATE ... IF NOT EXISTS`), then `npm run db:seed-admin` with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Never `db:seed`, `db:seed-demo`, `db:reset` or `db:demo-images` against production. The backend never creates or changes the schema at startup.

## 10. Public demo: email block, admin hardening, database safeguards (2026-11-07)

Scope was deliberately narrow: one public demo deployment (no second owner environment). The public Demo Admin (`admin@returnflow.test`, public password) is unchanged and stays public on purpose; the Admin interface and the invitation workflow are unchanged.

- **No real email in demo mode.** `DEMO_ENABLED=true` (any case or spacing) puts `email.service.js` in a `demo-blocked` mode: the Resend client is never created even if `RESEND_API_KEY` is set, `sendInvitationEmail` returns without sending and without a link, and `RESEND_*` are not needed to start in production. The admin create and resend endpoints still create their records and return `emailed:false` with "Email sending is turned off in demo mode. No email was sent.", which the existing UI already shows per address. This is enforced in the backend, so direct API calls with the public admin cookie cannot send either. With demo mode off, email works as before (still required in production). Proven with the Resend SDK pointed at a local capture server: 53 invitations plus 3 resends in demo mode produced 0 outbound requests, while the control with demo off produced the expected requests. The demo page copy ("an invitation email is only sent when an admin deliberately invites an address") is now inaccurate in demo mode and has NOT been changed (outside the approved scope).
- **`db:seed-admin` hardening.** On `NODE_ENV=production` or a `DATABASE_URL` it refuses, before connecting: a missing or demo `ADMIN_EMAIL` (any `@returnflow.test`), a missing or public-demo `ADMIN_PASSWORD`, passwords under 12 characters or containing the email name. Local development without those keeps the old demo defaults. It never modifies an existing account.
- **Seed and reset safeguards.** Existing: `--reset`, `--seed`, `--demo-only` need `CONFIRM_*` on production or a `DATABASE_URL`. New: on ANY database, `--reset` and `--seed` also require confirmation when the database holds accounts that are not the seeded demo accounts (`--demo-only` is not blocked: it only replaces the demo accounts' own data and its SQL refuses by itself if a real account has orders for demo products). Scripts print `Target database: host:port/name` (never credentials), and the server logs `Database target: ...` at startup and warns when demo mode runs in production against a database on the same machine, so the dedicated demo database can be verified.
- **Bug fixed along the way:** `db:reset` had been failing since the photo and AI tables were added (its DROP list was missing `return_images` and `ai_assessments`, so `DROP FUNCTION set_updated_at()` aborted the whole reset; nothing was dropped). A test now fails if the DROP list ever differs from the tables `schema.sql` creates.
- Not changed: schema, existing accounts, passwords and hashes, registration, the demo reset endpoint (still visitor-callable), Mongoose, Socket.IO.
- **Dedicated demo database setup:** create a separate PostgreSQL database for the demo; `npm run db:schema`; `npm run db:seed` with `CONFIRM_SEED_DEMO_DATA=yes` (creates the demo accounts including the public admin; do not run `db:seed-admin` there); set `DEMO_ENABLED=true` on its backend. Never point the demo at the local development database.
- Tests: `npm run test:unit` 130, `npm run test:integration:db` 21 (includes the endpoint-level email proof and a scratch-database proof of the guards), `test:integration:redis` 10, `test:ai` 29, `test:ai:scenario` 12, `test:s3`, frontend lint and build, all passing on 2026-11-07.

## 11. Render + Supabase deployment status (2026-11-13)

- **Deployed:** backend on Render (commit `9288a35`, Node 22, `DEMO_ENABLED=true`, `NODE_ENV=production`), PostgreSQL on Supabase (session pooler), Redis on Render Key Value. Frontend (Vercel) not deployed yet. S3 and OpenRouter are not verified on Render.
- **Supabase demo database initialized (2026-11-13):** the target was verified as empty (no tables in `public`), then `npm run db:schema` (11 tables, 31 named indexes, 17 foreign keys, 22 check constraints, 9 `updated_at` triggers) and `npm run db:seed` with `CONFIRM_SEED_DEMO_DATA=yes`. Result: 9 accounts (7 demo accounts including the public admin, plus `priya` and `rohan`), 12 products, 28 orders, 15 returns in 11 different statuses, all integrity checks 0 problems; the public demo password works on every account; the live service shows scenario `READY`, 12 products and all five roles logging in. `db:seed-admin`, `db:reset` and `db:demo-images` were deliberately not run. Never run the integration tests or `db:*` scripts against this database.
- **Local `.env` no longer holds a `DATABASE_URL`;** local development uses `localhost:5432/returnflow` again. To run a `db:*` script against Supabase deliberately, set `DATABASE_URL` in that one shell session only and check the printed `Target database:` line first.
- **PENDING (needs a change in the Render dashboard): `TRUST_PROXY`.** Before the fix, one client was spread over several rate-limit keys (the remaining-requests counter jumped around), and forged `X-Forwarded-For` values did not reset counters (not spoofable at the current value). Render's documentation does not describe the proxy chain, so the value must be found by measurement: set `TRUST_PROXY=2`, wait for the redeploy, then (A) 8 plain requests to `/api/products` must show a strictly decreasing `x-ratelimit-remaining`, and (B) 6 requests with different forged `X-Forwarded-For` values must keep decreasing (no reset towards 299). Counter jumping = value too low (try 3); counter resetting for forged values = value too high (try 1). Repeat the test from a second network: its counter must be independent. Re-run it after any custom-domain change, because a proxied custom domain adds a hop.
- **Dependencies:** `mongoose` updated within its major version to 9.11.4 (fixes the four advisories; it is still unused by the code). Production audit: 0 vulnerabilities. Two moderate dev-only findings remain (`nodemon` and its `minimatch`; the only offered fix is a downgrade flagged as major, not applied).
- **Demo wording:** the demo page, the admin invite card and two neutral labels no longer imply that email is sent; in demo mode the invite card says email sending is disabled and the button reads "Create Invitations (no email sent)".
