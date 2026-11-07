// INTEGRATION test against a REAL Redis 7 (not mocks). Needs Docker and a container named by REDIS_TEST_CONTAINER:
//   docker run -d --name rf-redis-test -p 127.0.0.1:6390:6379 redis:7-alpine
//   node --test --test-timeout=120000 tests/redis-real.integration.test.js
// It stops/pauses/starts that container to simulate outages, so use a throwaway container, never a shared Redis.
// If Redis is not reachable the whole file is SKIPPED (reported as skipped, not as passed).
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRedisManager } from '../src/config/redis.js'
import { createCacheService } from '../src/services/cache.service.js'
import { acquireLock, LockContentionError, RedisUnavailableError, releaseLock, withLock } from '../src/services/redisLock.service.js'
import { createRateLimiter } from '../src/middleware/rateLimit.middleware.js'

const URL = process.env.REDIS_TEST_URL || 'redis://127.0.0.1:6390'
const CONTAINER = process.env.REDIS_TEST_CONTAINER || 'rf-redis-test'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const docker = (...args) => execFileSync('docker', args, { stdio: 'pipe' }).toString().trim()
const quiet = { log() {}, error() {}, warn() {} }
const FAST = { REDIS_MAX_BACKOFF_MS: '500', REDIS_COMMAND_TIMEOUT_MS: '400', REDIS_SOCKET_TIMEOUT_MS: '2000', REDIS_STARTUP_WAIT_MS: '800' }
const manager = (extra = {}) => createRedisManager({ env: { REDIS_URL: URL, ...FAST, ...extra }, logger: quiet })
async function until(fn, ms = 15_000, label = 'condition') {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return; await sleep(100) }
  throw new Error(`timed out waiting for ${label}`)
}

let reachable = false
try { docker('exec', CONTAINER, 'redis-cli', 'ping'); reachable = true } catch { /* skipped below */ }
const skip = reachable ? false : `real Redis container "${CONTAINER}" is not running`
const managers = []
const track = (m) => { managers.push(m); return m }
test.afterEach(async () => { try { docker('unpause', CONTAINER) } catch { /* not paused */ } try { docker('start', CONTAINER) } catch { /* running */ } })
test.after(async () => { for (const m of managers) await m.close() })

test('Redis available at startup: connects, health is up, server version is 7', { skip }, async () => {
  const m = track(manager())
  const h = await m.initialize()
  assert.equal(h.status, 'up'); assert.equal(h.state, 'ready'); assert.equal(m.isReady(), true)
  assert.match(await m.getClient().info('server'), /redis_version:7\./)
})

test('cache: set/get round trip, TTL expiry and invalidation against real Redis', { skip }, async () => {
  const m = track(manager()); await m.initialize()
  const cache = createCacheService({ getClient: m.getClient, logger: quiet })
  assert.equal(await cache.set('rf:test:a', { n: 1 }, 1), true)
  assert.deepEqual(await cache.get('rf:test:a'), { n: 1 })
  await sleep(1300)
  assert.equal(await cache.get('rf:test:a'), null, 'expired after its TTL')
  await cache.set('rf:test:b', [1, 2], 60)
  assert.equal(await cache.del('rf:test:b'), 1)
  assert.equal(await cache.get('rf:test:b'), null)
  let fetched = 0
  const load = async () => { fetched++; return { v: fetched } }
  await cache.del('rf:test:remember')
  assert.deepEqual(await cache.remember('rf:test:remember', 60, load), { v: 1 })
  assert.deepEqual(await cache.remember('rf:test:remember', 60, load), { v: 1 }, 'second call is a hit')
  assert.equal(fetched, 1)
  await cache.del('rf:test:remember')
})

test('two backend instances share one Redis: cache invalidation and counters cross instances', { skip }, async () => {
  const a = track(manager()); const b = track(manager()); await Promise.all([a.initialize(), b.initialize()])
  const cacheA = createCacheService({ getClient: a.getClient, logger: quiet }); const cacheB = createCacheService({ getClient: b.getClient, logger: quiet })
  await cacheA.set('rf:test:shared', { from: 'A' }, 60)
  assert.deepEqual(await cacheB.get('rf:test:shared'), { from: 'A' })
  await cacheB.del('rf:test:shared')
  assert.equal(await cacheA.get('rf:test:shared'), null, 'B invalidated what A cached')

  const name = `it_${Date.now()}`
  const limitA = createRateLimiter({ name, windowMs: 60_000, max: 3, getClient: a.getClient, logger: quiet })
  const limitB = createRateLimiter({ name, windowMs: 60_000, max: 3, getClient: b.getClient, logger: quiet })
  const call = async (limiter) => {
    const res = { code: 200, h: {}, set(k, v) { this.h[k] = v }, status(c) { this.code = c; return this }, json() { return this }, on() {} }
    let nexted = false
    await limiter({ ip: '203.0.113.9' }, res, () => { nexted = true })
    return nexted ? 200 : res.code
  }
  const codes = []
  for (const l of [limitA, limitB, limitA, limitB, limitA]) codes.push(await call(l))
  assert.deepEqual(codes, [200, 200, 200, 429, 429], 'the 4th request is refused no matter which instance it hits')
  await a.getClient().del(`rf:rl:${name}:203.0.113.9`)
})

test('locks (real Redis): exclusivity, owner-only release, expiry, withLock, and two instances racing', { skip }, async () => {
  const a = track(manager()); const b = track(manager()); await Promise.all([a.initialize(), b.initialize()])
  const key = `it-lock-${Date.now()}`
  const lockA = await acquireLock(key, { getClient: a.getClient, logger: quiet })
  await assert.rejects(() => acquireLock(key, { getClient: b.getClient, logger: quiet }), LockContentionError)
  assert.equal(await releaseLock({ ...lockA, token: 'someone-else' }, { getClient: b.getClient, logger: quiet }), false, 'a wrong token cannot release')
  assert.equal(await releaseLock(lockA, { getClient: a.getClient, logger: quiet }), true)
  const lockB = await acquireLock(key, { getClient: b.getClient, logger: quiet }); await releaseLock(lockB, { getClient: b.getClient, logger: quiet })

  const short = await acquireLock(key, { ttlMs: 250, getClient: a.getClient, logger: quiet })
  await sleep(400)
  const after = await acquireLock(key, { getClient: b.getClient, logger: quiet })
  assert.equal(await releaseLock(short, { getClient: a.getClient, logger: quiet }), false, 'an expired owner cannot delete the new owner\'s lock')
  assert.equal(await releaseLock(after, { getClient: b.getClient, logger: quiet }), true)

  let inside = 0; let maxInside = 0; let wins = 0
  const run = (m) => withLock(`${key}-race`, async () => { inside++; maxInside = Math.max(maxInside, inside); wins++; await sleep(150); inside-- }, { getClient: m.getClient, logger: quiet }).catch((e) => { if (!(e instanceof LockContentionError)) throw e })
  await Promise.all([run(a), run(b), run(a), run(b)])
  assert.equal(maxInside, 1, 'never two holders at once'); assert.equal(wins, 1, 'exactly one of four simultaneous attempts won')
})

test('Redis UNAVAILABLE at startup: startup is non-fatal; Redis started later is picked up automatically', { skip }, async () => {
  docker('stop', CONTAINER)
  const m = track(manager())
  const started = Date.now()
  const h = await m.initialize()
  assert.ok(Date.now() - started < 4000, 'startup must not wait for Redis')
  assert.equal(h.connected, false); assert.equal(h.status, 'down')
  const cache = createCacheService({ getClient: m.getClient, logger: quiet })
  assert.equal(await cache.get('rf:test:x'), null); assert.equal(await cache.set('rf:test:x', 1, 5), false, 'cache is a harmless no-op while Redis is down')
  await assert.rejects(() => acquireLock('rf-down', { getClient: m.getClient, logger: quiet }), RedisUnavailableError)

  docker('start', CONTAINER)
  await until(() => m.isReady(), 20_000, 'Redis to be picked up after it started')
  assert.equal(m.getHealth().status, 'up'); assert.equal(m.getHealth().lastErrorCode, null)
  assert.equal(await cache.set('rf:test:x', 1, 5), true); assert.equal(await cache.get('rf:test:x'), 1)
})

test('Redis goes DOWN after a successful connection and comes back after a restart, with no backend restart', { skip }, async () => {
  const m = track(manager()); await m.initialize()
  assert.equal(m.isReady(), true)
  docker('stop', CONTAINER)
  await until(() => !m.isReady(), 10_000, 'the client to notice the outage')
  assert.equal(m.getHealth().status, 'down'); assert.notEqual(m.getHealth().lastErrorCode, null)
  const cache = createCacheService({ getClient: m.getClient, logger: quiet })
  assert.equal(await cache.get('rf:test:y'), null)
  await sleep(1500) // several failed reconnect attempts while it is down
  docker('start', CONTAINER)
  await until(() => m.isReady(), 20_000, 'automatic reconnect')
  assert.equal(await cache.set('rf:test:y', 'back', 5), true); assert.equal(await cache.get('rf:test:y'), 'back')
  assert.equal(m.getHealth().status, 'up')
})

test('a HUNG Redis cannot block a request: commands time out quickly, and service resumes after it recovers', { skip }, async () => {
  const m = track(manager()); await m.initialize()
  const cache = createCacheService({ getClient: m.getClient, logger: quiet })
  await cache.set('rf:test:z', 1, 60)
  docker('pause', CONTAINER) // the process freezes: TCP stays open, nothing answers
  const t0 = Date.now()
  assert.equal(await cache.get('rf:test:z'), null, 'a timed-out read behaves like a miss')
  assert.ok(Date.now() - t0 < 1500, `read returned after ${Date.now() - t0} ms`)
  const t1 = Date.now()
  await assert.rejects(() => acquireLock('rf-hung', { getClient: m.getClient, logger: quiet }), RedisUnavailableError)
  assert.ok(Date.now() - t1 < 1500, 'lock acquisition also gives up quickly')
  docker('unpause', CONTAINER)
  await until(async () => (await cache.get('rf:test:z')) === 1, 20_000, 'service to resume after unpausing')
})

test('failure counter is atomic: a concurrent burst split across TWO instances lets exactly max attempts through', { skip }, async () => {
  const { EventEmitter } = await import('node:events')
  const a = track(manager()); const b = track(manager()); await Promise.all([a.initialize(), b.initialize()])
  const name = `atomic_${Date.now()}`
  const make = (m) => createRateLimiter({ name, windowMs: 60_000, max: 5, countIf: (s) => s === 401, getClient: m.getClient, logger: quiet, key: () => 'burst' })
  const [limitA, limitB] = [make(a), make(b)]
  const attempt = async (limiter, status) => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200, set() {}, status(c) { this.statusCode = c; return this }, json() { return this } })
    let reached = false
    await limiter({ ip: '198.51.100.9' }, res, () => { reached = true })
    if (!reached) return 429
    await sleep(40) // the "password check"
    res.statusCode = status; res.emit('finish')
    return status
  }
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => attempt(i % 2 ? limitA : limitB, 401)))
  assert.equal(results.filter((s) => s === 401).length, 5, 'exactly 5 reached the password check across both instances')
  assert.equal(results.filter((s) => s === 429).length, 25)
  await sleep(100)
  assert.equal(await attempt(limitA, 401), 429)

  // settle rules against the real counter
  await a.getClient().del(`rf:rl:${name}:burst`)
  assert.equal(await attempt(limitA, 401), 401); assert.equal(await attempt(limitB, 401), 401)
  assert.equal(await attempt(limitA, 200), 200, 'success clears the counter')
  await sleep(100)
  assert.equal(await a.getClient().get(`rf:rl:${name}:burst`), null)
  for (let i = 0; i < 8; i++) assert.equal(await attempt(limitA, 400), 400, 'malformed requests are refunded')
  await sleep(100)
  assert.equal(await a.getClient().get(`rf:rl:${name}:burst`), null, 'refunds leave nothing behind')
})
