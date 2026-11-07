// INTEGRATION test: the REAL backend process (src/server.js) + real PostgreSQL + real Redis container, through an outage.
// Needs: PostgreSQL from backend/.env and the throwaway Redis container (see redis-real.integration.test.js).
//   node --test --test-timeout=180000 tests/redis-backend-outage.integration.test.js
// Skipped when the container is not running.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTAINER = process.env.REDIS_TEST_CONTAINER || 'rf-redis-test'
const PORT = 5094
const API = `http://localhost:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const docker = (...a) => execFileSync('docker', a, { stdio: 'pipe' }).toString().trim()
let reachable = false
try { docker('exec', CONTAINER, 'redis-cli', 'ping'); reachable = true } catch { /* skipped */ }
const skip = reachable ? false : `real Redis container "${CONTAINER}" is not running`

const getJson = async (route, init) => { const res = await fetch(API + route, init); return { status: res.status, body: await res.json().catch(() => null), headers: res.headers } }
async function until(fn, ms, label) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(150) } throw new Error('timed out waiting for ' + label) }
const HEALTH = 'outage-test-health-token-1234'
const ready = (headers) => getJson('/health/ready', { headers })
const redisState = async () => (await ready({ 'X-Health-Token': HEALTH })).body?.dependencies?.redis

test('backend keeps serving PostgreSQL-backed requests while Redis is down, and re-attaches to Redis by itself', { skip }, async (t) => {
  docker('stop', CONTAINER) // Redis is DOWN when the backend boots
  const env = { ...process.env, PORT: String(PORT), REDIS_URL: 'redis://127.0.0.1:6390', REDIS_MAX_BACKOFF_MS: '500', REDIS_STARTUP_WAIT_MS: '800', REDIS_COMMAND_TIMEOUT_MS: '400', REDIS_SOCKET_TIMEOUT_MS: '2000', RESEND_API_KEY: '', HEALTH_CHECK_TOKEN: HEALTH }
  const child = spawn('node', ['src/server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', (d) => (log += d)); child.stderr.on('data', (d) => (log += d))
  t.after(() => { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']); try { docker('start', CONTAINER) } catch { /* running */ } })

  await until(() => log.includes('Server running'), 15_000, 'the server to start without Redis')
  const publicView = await ready()
  assert.equal(publicView.status, 200, 'readiness stays 200 (degraded) when only Redis is down')
  assert.deepEqual(publicView.body, { status: 'degraded' }, 'the public view discloses no dependency detail')
  const detail = await ready({ 'X-Health-Token': HEALTH })
  assert.equal(detail.body.dependencies.postgresql.status, 'up'); assert.equal(detail.body.dependencies.redis.status, 'down')
  const products = await getJson('/api/products')
  assert.equal(products.status, 200); assert.ok(products.body.products.length > 0, 'PostgreSQL-backed catalog works with Redis down')
  const login = await getJson('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'alice@returnflow.test', password: 'Password123!' }) })
  assert.equal(login.status, 200, 'login works with Redis down'); assert.equal(login.headers.get('x-ratelimit-fallback'), 'local-memory', 'rate limiting fell back to per-process memory')

  docker('start', CONTAINER) // Redis appears AFTER the backend
  await until(async () => (await redisState())?.status === 'up', 25_000, 'the backend to attach to the Redis that started later')
  assert.equal((await ready()).body.status, 'ok')
  const withRedis = await getJson('/api/products'); assert.equal(withRedis.status, 200)
  assert.notEqual(withRedis.headers.get('x-ratelimit-fallback'), 'local-memory', 'rate limiting is back on Redis')
  assert.ok(Number(withRedis.headers.get('x-ratelimit-limit')) > 0)

  docker('stop', CONTAINER) // outage while running
  await until(async () => (await redisState())?.status === 'down', 15_000, 'the backend to notice the outage')
  assert.equal((await getJson('/api/products')).status, 200, 'still serving during the outage')
  assert.equal((await ready()).body.status, 'degraded')

  docker('start', CONTAINER) // restart
  await until(async () => (await redisState())?.status === 'up', 25_000, 'automatic recovery after the restart')
  assert.equal((await ready()).body.status, 'ok')
  assert.ok(!/Unhandled promise rejection/i.test(log), 'no unhandled rejections in the server log')
})
