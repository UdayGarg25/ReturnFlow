// UNIT test: the "Redis rate limiting unavailable" warning says what is really going on and is not repeated on every request.
// Regression for the 2026-11-05 report: with REDIS_URL unset the log said "disconnected" for every single request.
// An EMPTY REDIS_URL is set before anything is imported (dotenv never overwrites a variable that is already present),
// so the real redis manager in this process is "not configured".
process.env.REDIS_URL = ''
import test from 'node:test'
import assert from 'node:assert/strict'

const { createRateLimiter } = await import('../src/middleware/rateLimit.middleware.js')

const run = async (limiter) => {
  const res = { code: 200, set() {}, status(c) { this.code = c; return this }, json() { return this }, on() {} }
  let passed = false
  await limiter({ ip: '203.0.113.7' }, res, () => { passed = true })
  return passed ? 200 : res.code
}

test('not configured is reported as such, once, and requests keep being served under the unchanged local-memory policy', async () => {
  const warnings = []
  const limiter = createRateLimiter({ name: 'log_test', windowMs: 60_000, max: 100, getClient: () => null, logger: { warn: (m) => warnings.push(m), error() {}, log() {} } })
  for (let i = 0; i < 25; i++) assert.equal(await run(limiter), 200)
  assert.equal(warnings.length, 1, 'one warning, not one per request')
  assert.match(warnings[0], /Redis not configured \(REDIS_URL is not set\)/)
  assert.match(warnings[0], /Policy: local_memory/)
  assert.doesNotMatch(warnings[0], /disconnected/)
})

test('the fallback policy itself is unchanged: the local limit still blocks, and fail_closed still refuses', async () => {
  const quiet = { warn() {}, error() {}, log() {} }
  const local = createRateLimiter({ name: 'log_test2', windowMs: 60_000, max: 3, getClient: () => null, logger: quiet })
  const codes = []
  for (let i = 0; i < 5; i++) codes.push(await run(local))
  assert.deepEqual(codes, [200, 200, 200, 429, 429])
  const closed = createRateLimiter({ name: 'log_test3', windowMs: 60_000, max: 3, getClient: () => null, fallbackPolicy: 'fail_closed', logger: quiet })
  assert.equal(await run(closed), 503)
})
