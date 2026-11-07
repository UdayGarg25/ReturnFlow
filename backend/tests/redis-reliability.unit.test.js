// UNIT tests (mocks, no Redis): backoff maths, per-command timeout wrapper, and lock-release failure handling.
// Real-Redis versions of the same behaviours are in redis-real.integration.test.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeBackoffMs, createRedisManager, RedisCommandTimeoutError, withCommandTimeout } from '../src/config/redis.js'
import { withLock } from '../src/services/redisLock.service.js'

const quiet = () => { const logs = []; return { logs, log: () => {}, warn: () => {}, error: (...a) => logs.push(a.join(' ')) } }

test('backoff: exponential, capped, jittered within [half, full] of the step, never zero or unbounded', () => {
  const lo = (n) => computeBackoffMs(n, { maxMs: 30_000, random: () => 0 })
  const hi = (n) => computeBackoffMs(n, { maxMs: 30_000, random: () => 0.999999 })
  assert.equal(lo(0), 100); assert.ok(hi(0) <= 200 && hi(0) >= 199)
  assert.equal(lo(3), 800); assert.equal(lo(5), 3200)
  for (const n of [10, 50, 1000]) { assert.equal(lo(n), 15_000); assert.ok(hi(n) <= 30_000 && hi(n) >= 29_999) }
  for (let i = 0; i < 200; i++) { const v = computeBackoffMs(i % 12); assert.ok(v >= 100 && v <= 30_000) }
})

test('the manager configures an infinite reconnect strategy and the supported timeout options', () => {
  let seen
  createRedisManager({ env: { REDIS_URL: 'redis://x:1', REDIS_SOCKET_TIMEOUT_MS: '4000' }, logger: quiet(), createClientFn: (opts) => { seen = opts; return { on() {}, connect: async () => {} } } }).initialize()
  assert.equal(seen.socket.socketTimeout, 4000); assert.equal('timeout' in seen.socket, false, 'the unsupported socket.timeout option must not be used')
  assert.equal(seen.disableOfflineQueue, true); assert.equal(seen.pingInterval, 2000)
  for (const retries of [0, 3, 10, 100, 10_000]) assert.equal(typeof seen.socket.reconnectStrategy(retries, new Error('x')), 'number', 'must always return a delay, never false')
})

test('withCommandTimeout: fast commands pass, hung commands reject on time, non-promise members pass through', async () => {
  let release
  const client = { isOpen: true, get name() { return 'c' }, quick: async (x) => x, hung: () => new Promise((r) => { release = r }), late: () => new Promise((_, rej) => setTimeout(() => rej(new Error('late failure')), 120)) }
  const wrapped = withCommandTimeout(client, 60)
  assert.equal(wrapped.isOpen, true); assert.equal(wrapped.name, 'c')
  assert.equal(await wrapped.quick(7), 7)
  const t0 = Date.now()
  await assert.rejects(() => wrapped.hung(), (e) => e instanceof RedisCommandTimeoutError && e.code === 'REDIS_COMMAND_TIMEOUT')
  assert.ok(Date.now() - t0 < 500)
  await assert.rejects(() => wrapped.late(), RedisCommandTimeoutError)
  await new Promise((r) => setTimeout(r, 250)) // the abandoned command fails later: must not surface as an unhandled rejection
  release?.()
})

const fakeRedis = ({ failRelease = false } = {}) => {
  const store = new Map(); let evalCalls = 0
  return { store, get evalCalls() { return evalCalls }, client: { isOpen: true, isReady: true,
    set: async (k, v) => { if (store.has(k)) return null; store.set(k, v); return 'OK' },
    eval: async (_s, { keys, arguments: [token] }) => { evalCalls++; if (failRelease) throw Object.assign(new Error('boom'), { code: 'ECONNRESET' }); if (store.get(keys[0]) === token) { store.delete(keys[0]); return 1 } return 0 } } }
}

test('withLock: callback succeeds + release FAILS -> the result is returned (not an error), failure is logged', async () => {
  const r = fakeRedis({ failRelease: true }); const logger = quiet()
  const out = await withLock('k1', async () => 'done', { getClient: () => r.client, logger })
  assert.equal(out, 'done'); assert.equal(r.evalCalls, 1)
  assert.ok(logger.logs.some((l) => l.includes('Failed to release lock')))
  assert.equal(r.store.size, 1, 'the lock stays until its TTL expires (a real Redis removes it)')
})

test('withLock: callback FAILS + release fails -> the ORIGINAL error is what the caller sees', async () => {
  const r = fakeRedis({ failRelease: true })
  await assert.rejects(() => withLock('k2', async () => { throw new Error('business failure') }, { getClient: () => r.client, logger: quiet() }), /business failure/)
})

test('withLock: normal path releases the lock, and a stolen/expired lock is never deleted by the old owner', async () => {
  const r = fakeRedis()
  assert.equal(await withLock('k3', async () => 42, { getClient: () => r.client, logger: quiet() }), 42); assert.equal(r.store.size, 0)
  await withLock('k4', async (lock) => { r.store.set(lock.lockKey, 'a-newer-owner-token') }, { getClient: () => r.client, logger: quiet() })
  assert.equal(r.store.get('rf:lock:k4'), 'a-newer-owner-token', 'compare-and-delete must leave another owner\'s lock alone')
})
