// UNIT tests (no Redis: the limiter runs on its local-memory fallback) for the general API limiter keying and the
// TRUST_PROXY parsing. Redis-backed sharing across instances is covered in redis-real.integration.test.js.
import 'dotenv/config'
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { parseTrustProxy } from '../src/config/trustProxy.js'

process.env.RATE_LIMIT_API_PER_IP = '3'
process.env.RATE_LIMIT_API_PER_USER = '5'
const { apiLimiter } = await import('../src/middleware/rateLimit.middleware.js')
const { generateToken } = await import('../src/utils/jwt.js')
const { authConfig } = await import('../src/config/auth.js')

const quiet = { warns: [], warn(m) { this.warns.push(m) } }
test('parseTrustProxy: safe default, hop counts, address lists, and a warning for "true"', () => {
  for (const v of [undefined, '', '  ', 'false', 'FALSE']) assert.equal(parseTrustProxy(v, { logger: quiet }), false)
  assert.equal(parseTrustProxy('1'), 1); assert.equal(parseTrustProxy(' 2 '), 2)
  assert.equal(parseTrustProxy('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8')
  assert.equal(quiet.warns.length, 0)
  assert.equal(parseTrustProxy('true', { logger: quiet }), true); assert.equal(quiet.warns.length, 1); assert.match(quiet.warns[0], /forge/)
})

// What req.ip becomes, using the real Express setting, for a request that arrives via ONE proxy and carries a forged header.
async function clientIpSeenBy(setting) {
  const app = express()
  if (setting !== false) app.set('trust proxy', setting)
  app.get('/ip', (req, res) => res.json({ ip: req.ip }))
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
  try {
    // the client forged "1.2.3.4"; the (single) proxy appended the real client address 198.51.100.7 after it
    const res = await fetch(`http://127.0.0.1:${server.address().port}/ip`, { headers: { 'X-Forwarded-For': '1.2.3.4, 198.51.100.7' } })
    return (await res.json()).ip
  } finally { server.close() }
}
test('TRUST_PROXY semantics with the real Express: a hop count ignores forged entries, "true" is spoofable, unset ignores the header', async () => {
  const unset = await clientIpSeenBy(parseTrustProxy(undefined))
  assert.ok(['127.0.0.1', '::ffff:127.0.0.1'].includes(unset), `unset: the TCP peer, got ${unset}`)
  assert.equal(await clientIpSeenBy(parseTrustProxy('1')), '198.51.100.7', 'hop count 1: the address the proxy recorded; the forged value is ignored')
  assert.equal(await clientIpSeenBy(parseTrustProxy('true', { logger: quiet })), '1.2.3.4', '"true" lets the client choose its own IP')
})

const call = async (cookieToken, ip) => {
  const res = { code: 200, set() {}, status(c) { this.code = c; return this }, json() { return this }, on() {} }
  let passed = false
  await apiLimiter({ ip, cookies: cookieToken ? { [authConfig.cookieName]: cookieToken } : {}, headers: {}, socket: {} }, res, () => { passed = true })
  return passed ? 200 : res.code
}
const run = async (n, ...args) => { const out = []; for (let i = 0; i < n; i++) out.push(await call(...args)); return out }

test('apiLimiter: verified users get their own budget even behind one shared IP; anonymous callers are limited per IP', async () => {
  const alice = generateToken({ userId: 101 }); const bob = generateToken({ userId: 102 })
  const NAT = '203.0.113.50'
  assert.deepEqual(await run(6, alice, NAT), [200, 200, 200, 200, 200, 429], 'user budget is 5')
  assert.deepEqual(await run(6, bob, NAT), [200, 200, 200, 200, 200, 429], 'a second user on the same IP has an untouched budget')
  assert.deepEqual(await run(4, null, NAT), [200, 200, 200, 429], 'anonymous traffic from that IP is limited to 3, independent of the users')
})

test('apiLimiter: a forged, tampered or expired token cannot buy a bigger or fresh budget', async () => {
  const IP = '203.0.113.60'
  const real = generateToken({ userId: 201 })
  const tampered = real.slice(0, -3) + (real.endsWith('aaa') ? 'bbb' : 'aaa')
  for (const bad of ['garbage', tampered, generateToken({ userId: 'x' }), generateToken({})]) {
    const results = await run(4, bad, IP)
    assert.equal(results.at(-1), 429, 'treated as anonymous: limited by the per-IP budget of 3')
  }
})
