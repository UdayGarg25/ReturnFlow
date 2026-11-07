// INTEGRATION test: TWO real backend processes (src/server.js) sharing ONE real Redis and one PostgreSQL.
// Proves the distributed rate limiter counts across instances (a per-process counter would allow 2x).
// Needs the throwaway Redis container (see redis-real.integration.test.js). Skipped when it is not running.
//   node --test --test-concurrency=1 --test-timeout=120000 tests/redis-multi-instance.integration.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTAINER = process.env.REDIS_TEST_CONTAINER || 'rf-redis-test'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const docker = (...a) => execFileSync('docker', a, { stdio: 'pipe' }).toString().trim()
let reachable = false
try { docker('exec', CONTAINER, 'redis-cli', 'ping'); reachable = true } catch { /* skipped */ }
const skip = reachable ? false : `real Redis container "${CONTAINER}" is not running`

async function boot(port, extra = {}) {
  const env = { ...process.env, PORT: String(port), REDIS_URL: 'redis://127.0.0.1:6390', RATE_LIMIT_LOGIN_FAILURES: '3', RATE_LIMIT_LOGIN_PER_IP: '1000', RESEND_API_KEY: '', ...extra }
  const child = spawn('node', ['src/server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.log = ''
  child.stdout.on('data', (d) => (child.log += d)); child.stderr.on('data', (d) => (child.log += d))
  for (let i = 0; i < 100 && !(child.log.includes('Server running') && child.log.includes('Redis connected')); i++) await sleep(100)
  assert.ok(child.log.includes('Redis connected'), 'instance did not connect to Redis: ' + child.log.slice(-300))
  return child
}
const login = (port, email) => fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'wrong-password' }) })

test('two backend instances share login-failure counting through Redis', { skip }, async (t) => {
  const kill = (c) => spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'])
  const a = await boot(5095); const b = await boot(5096)
  const email = `nobody-${Date.now()}@returnflow.test`
  t.after(() => { kill(a); kill(b); try { docker('exec', CONTAINER, 'redis-cli', '--scan', '--pattern', 'rf:rl:login_failures:*') } catch { /* ignore */ } })

  const statuses = []
  for (const port of [5095, 5096, 5095]) statuses.push((await login(port, email)).status) // 3 failures, alternating instances
  assert.deepEqual(statuses, [401, 401, 401])
  const fourthOnA = await login(5095, email); const fourthOnB = await login(5096, email)
  assert.equal(fourthOnA.status, 429, 'instance A refuses: the failures were recorded by BOTH instances')
  assert.equal(fourthOnB.status, 429, 'instance B refuses as well')
  assert.ok(Number(fourthOnB.headers.get('retry-after')) > 0)
  assert.notEqual(fourthOnA.headers.get('x-ratelimit-fallback'), 'local-memory')

  const keys = docker('exec', CONTAINER, 'redis-cli', '--scan', '--pattern', 'rf:rl:login_failures:*').split('\n').filter(Boolean)
  assert.equal(keys.length, 1, 'one shared counter')
  assert.ok(!keys[0].includes(email), 'the e-mail address is hashed, never stored in a Redis key')
  docker('exec', CONTAINER, 'redis-cli', 'del', keys[0]) // leave nothing behind
})
