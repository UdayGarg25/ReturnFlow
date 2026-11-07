// UNIT tests: who may see the dependency detail of /health/ready. No network.
import test from 'node:test'
import assert from 'node:assert/strict'
import { canSeeReadinessDetail, getReadinessStatus, publicReadinessBody } from '../src/health/readiness.js'

const TOKEN = 'monitoring-token-0123456789'
const req = ({ header, cookie } = {}) => ({ headers: header === undefined ? {} : { 'x-health-token': header }, cookies: cookie === undefined ? {} : { rf_token: cookie } })
const opts = (extra = {}) => ({ env: { HEALTH_CHECK_TOKEN: TOKEN }, cookieName: 'rf_token', verify: (c) => ({ userId: Number(c.split(':')[1]) }), findUser: async (id) => ({ id, role: id === 1 ? 'ADMIN' : 'CUSTOMER' }), ...extra })

test('the public view contains only the overall status', async () => {
  const full = (await getReadinessStatus({ dbPool: { query: async () => ({}) }, redisHealthProvider: () => ({ configured: true, connected: false, state: 'error', lastErrorCode: 'ECONNREFUSED' }) })).body
  assert.ok(full.dependencies.redis.errorCode)
  assert.deepEqual(publicReadinessBody(full), { status: 'degraded' })
})

test('a monitoring token grants detail; wrong, empty, different-length and missing tokens do not', async () => {
  assert.equal(await canSeeReadinessDetail(req({ header: TOKEN }), opts()), true)
  for (const bad of ['wrong', '', TOKEN + 'x', TOKEN.slice(1), TOKEN.toUpperCase()]) assert.equal(await canSeeReadinessDetail(req({ header: bad }), opts()), false, bad)
  assert.equal(await canSeeReadinessDetail(req(), opts()), false)
})

test('token access is OFF when HEALTH_CHECK_TOKEN is unset, empty or too short (even if the caller sends the same short value)', async () => {
  for (const env of [{}, { HEALTH_CHECK_TOKEN: '' }, { HEALTH_CHECK_TOKEN: 'short' }]) {
    assert.equal(await canSeeReadinessDetail(req({ header: env.HEALTH_CHECK_TOKEN ?? 'x' }), opts({ env })), false)
  }
})

test('an ADMIN session grants detail; other roles, bad cookies and lookup failures do not', async () => {
  assert.equal(await canSeeReadinessDetail(req({ cookie: 'jwt:1' }), opts()), true)
  assert.equal(await canSeeReadinessDetail(req({ cookie: 'jwt:2' }), opts()), false, 'a customer')
  assert.equal(await canSeeReadinessDetail(req({ cookie: 'jwt:0' }), opts()), false)
  assert.equal(await canSeeReadinessDetail(req({ cookie: 'jwt:abc' }), opts()), false)
  assert.equal(await canSeeReadinessDetail(req({ cookie: '' }), opts()), false)
  assert.equal(await canSeeReadinessDetail(req({ cookie: 'jwt:1' }), opts({ verify: () => { throw new Error('bad signature') } })), false)
  assert.equal(await canSeeReadinessDetail(req({ cookie: 'jwt:1' }), opts({ findUser: async () => { throw new Error('db down') } })), false)
  assert.equal(await canSeeReadinessDetail(req({ cookie: 'jwt:1' }), opts({ findUser: async () => null })), false)
})
