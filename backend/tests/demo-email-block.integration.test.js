// INTEGRATION test: the REAL backend process + real PostgreSQL, called the way an attacker holding the public Admin login would
// call it: direct API requests, no UI. Proves that with DEMO_ENABLED=true NO email request is ever made (the Resend SDK is
// pointed at a local capture server, so nothing can leave this machine), and that with demo mode off the same calls DO send.
// Needs the seeded demo admin (admin@returnflow.test / the public demo password). Test invitations use ".invalid" addresses and
// are deleted afterwards. Run: node --test --test-timeout=120000 tests/demo-email-block.integration.test.js
import 'dotenv/config'
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../src/config/db.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RUN = `${Date.now()}`
const addr = (i) => `email-block-test-${RUN}-${i}@email-block.invalid`
const MESSAGE = 'Operator-controlled free text typed by a visitor'

const captured = []
const capture = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (d) => (raw += d))
  req.on('end', () => {
    captured.push({ url: req.url, body: JSON.parse(raw || '{}') })
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'captured-not-sent' }))
  })
})
await new Promise((r) => capture.listen(0, '127.0.0.1', r))

const servers = []
async function boot(port, demo) {
  const env = {
    ...process.env, PORT: String(port), NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example.test', REDIS_URL: '',
    RESEND_API_KEY: 'fake-key-for-capture-test', RESEND_FROM_EMAIL: 'noreply@example.invalid', RESEND_BASE_URL: `http://127.0.0.1:${capture.address().port}`, // a real-looking key IS configured
    DEMO_ENABLED: demo ? 'true' : 'false',
  }
  const child = spawn('node', ['src/server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.log = ''
  child.stdout.on('data', (d) => (child.log += d)); child.stderr.on('data', (d) => (child.log += d))
  servers.push(child)
  for (let i = 0; i < 100 && !child.log.includes('Server running'); i++) await sleep(100)
  assert.ok(child.log.includes('Server running'), 'server did not start: ' + child.log.slice(-300))
  const base = `http://127.0.0.1:${port}`
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@returnflow.test', password: 'Password123!' }) })
  assert.equal(res.status, 200, 'the seeded demo admin must exist to run this test')
  const cookie = res.headers.getSetCookie()[0].split(';')[0]
  const call = async (method, route, body) => {
    const r = await fetch(base + route, { method, headers: { Cookie: cookie, ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  return { child, call }
}

test.after(async () => {
  await pool.query(`DELETE FROM invitations WHERE email LIKE $1`, [`email-block-test-${RUN}-%@email-block.invalid`])
  for (const s of servers) spawn('taskkill', ['/pid', String(s.pid), '/T', '/F'])
  capture.close()
  await sleep(300)
  await pool.end()
})

test('DEMO_ENABLED=true, production, Resend key configured: creating and re-sending invitations sends NOTHING', async () => {
  const demo = await boot(5071, true)
  const before = captured.length

  const created = await demo.call('POST', '/api/admin/invitations', { role: 'SELLER', emails: [addr(1), addr(2), addr(3)].join('\n'), message: MESSAGE })
  assert.equal(created.status, 201)
  assert.equal(created.json.created, 3); assert.equal(created.json.emailed, 0)
  for (const inv of created.json.invitations) {
    assert.equal(inv.emailed, false)
    assert.equal(inv.emailError, 'Email sending is turned off in demo mode. No email was sent.')
    assert.equal('devLink' in inv, false)
  }
  assert.equal('devMode' in created.json, false)
  assert.ok(!JSON.stringify(created.json).includes('accept-invitation') && !JSON.stringify(created.json).toLowerCase().includes('token'), 'no link or token comes back')

  for (const inv of created.json.invitations) {
    const resent = await demo.call('POST', `/api/admin/invitations/${inv.id}/resend`)
    assert.equal(resent.status, 200)
    assert.equal(resent.json.emailed, false)
    assert.equal(resent.json.emailError, 'Email sending is turned off in demo mode. No email was sent.')
    assert.ok(!JSON.stringify(resent.json).includes('accept-invitation'))
  }

  // the maximum a single request may carry (50 addresses), for another role
  const many = await demo.call('POST', '/api/admin/invitations', { role: 'WAREHOUSE', emails: Array.from({ length: 50 }, (_, i) => addr(100 + i)).join(','), message: MESSAGE })
  assert.equal(many.status, 201); assert.equal(many.json.created, 50); assert.equal(many.json.emailed, 0)

  assert.equal(captured.length, before, 'ZERO outbound email requests were made')
  assert.ok(demo.child.log.includes('blocked in demo mode'))
  for (const secret of ['fake-key-for-capture-test', 'email-block-test']) assert.ok(!demo.child.log.includes(secret), `the server log must not contain ${secret}`)
})

test('the invitation workflow still works in demo mode: rows are created, listed and can be cancelled', async () => {
  const demo = await boot(5073, true)
  const created = await demo.call('POST', '/api/admin/invitations', { role: 'PICKUP_AGENT', emails: addr(200) })
  assert.equal(created.status, 201); assert.equal(created.json.created, 1)
  const id = created.json.invitations[0].id
  const list = await demo.call('GET', '/api/admin/invitations')
  assert.ok(list.json.invitations.some((i) => i.id === id && i.status === 'PENDING'))
  const cancelled = await demo.call('POST', `/api/admin/invitations/${id}/cancel`)
  assert.equal(cancelled.status, 200); assert.equal(cancelled.json.invitation.status, 'CANCELLED')
  assert.equal((await demo.call('GET', '/api/admin/stats')).status, 200)
  assert.equal((await demo.call('GET', '/api/admin/users')).status, 200)
})

test('CONTROL: DEMO_ENABLED=false with the same key and capture server DOES send, for create and resend', async () => {
  const real = await boot(5072, false)
  const before = captured.length
  const created = await real.call('POST', '/api/admin/invitations', { role: 'SELLER', emails: [addr(300), addr(301)].join(' '), message: MESSAGE })
  assert.equal(created.status, 201); assert.equal(created.json.created, 2); assert.equal(created.json.emailed, 2)
  assert.equal(captured.length, before + 2)
  assert.deepEqual(captured.slice(before).map((c) => c.body.to[0]).sort(), [addr(300), addr(301)].sort())
  assert.ok(captured.at(-1).body.text.includes(MESSAGE))

  const resent = await real.call('POST', `/api/admin/invitations/${created.json.invitations[0].id}/resend`)
  assert.equal(resent.status, 200); assert.equal(resent.json.emailed, true)
  assert.equal(captured.length, before + 3)
})
