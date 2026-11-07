// UNIT tests (local-memory path, no Redis) of the failure-counting limiter used for logins. The same scenarios run
// against a real Redis, across two instances, in redis-real.integration.test.js ("failure counter is atomic").
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRateLimiter } from '../src/middleware/rateLimit.middleware.js'

const quiet = { log() {}, warn() {}, error() {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failureLimiter = (max = 5) => createRateLimiter({ name: `atomic_${Math.random()}`, windowMs: 60_000, max, countIf: (s) => s === 401, getClient: () => null, logger: quiet, key: () => 'k' })

// One simulated login request: passes the limiter, "checks the password" for `workMs`, then answers with `status`.
async function attempt(limiter, status, workMs = 30) {
  const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v }, status(c) { this.statusCode = c; return this }, json() { this.finish429 = true; return this } })
  let reachedHandler = false
  await limiter({ ip: '203.0.113.1' }, res, () => { reachedHandler = true })
  if (!reachedHandler) return 429
  await sleep(workMs) // the password check takes time: the old read-then-count design let a whole burst pass during it
  res.statusCode = status
  res.emit('finish')
  return status
}

test('a CONCURRENT burst of wrong passwords is capped at max (the old check-then-count design let all of them through)', async () => {
  const limiter = failureLimiter(5)
  const results = await Promise.all(Array.from({ length: 25 }, () => attempt(limiter, 401)))
  assert.equal(results.filter((s) => s === 401).length, 5, 'exactly 5 attempts may reach the password check')
  assert.equal(results.filter((s) => s === 429).length, 20)
  assert.equal(await attempt(limiter, 401), 429, 'and the next one is still blocked')
})

test('a correct password clears the counter; a malformed request (400) is not counted; failures (401) are', async () => {
  const limiter = failureLimiter(3)
  assert.equal(await attempt(limiter, 401), 401)
  assert.equal(await attempt(limiter, 401), 401)
  assert.equal(await attempt(limiter, 200), 200, 'success resets')
  for (let i = 0; i < 3; i++) assert.equal(await attempt(limiter, 401), 401, `fresh budget, failure ${i + 1}`)
  assert.equal(await attempt(limiter, 401), 429)

  const other = failureLimiter(2)
  for (let i = 0; i < 6; i++) assert.equal(await attempt(other, 400), 400, '400s are refunded, never blocking')
  assert.equal(await attempt(other, 401), 401)
  assert.equal(await attempt(other, 401), 401)
  assert.equal(await attempt(other, 401), 429)
})

test('a request that never gets an answer (client abort) still counts, so aborting cannot dodge the limit', async () => {
  const limiter = failureLimiter(2)
  for (let i = 0; i < 2; i++) {
    const res = Object.assign(new EventEmitter(), { statusCode: 200, set() {}, status() { return this }, json() { return this } })
    await limiter({ ip: '203.0.113.1' }, res, () => {}) // reserved, but 'finish' is never emitted
  }
  assert.equal(await attempt(limiter, 401), 429)
})
