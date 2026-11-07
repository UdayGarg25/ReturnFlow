// UNIT tests: DEMO_ENABLED=true must block ALL real email delivery, and normal email must keep working when demo mode is off.
// The Resend SDK is pointed at a local capture server (RESEND_BASE_URL), so a send can never leave this machine and every
// attempt is counted. email.service.js reads its settings when it is imported, so each case imports a fresh copy (?case=N).
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const captured = []
const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (d) => (raw += d))
  req.on('end', () => {
    captured.push({ url: req.url, body: JSON.parse(raw || '{}') })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id: 'captured-not-sent' }))
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
process.env.RESEND_BASE_URL = `http://127.0.0.1:${server.address().port}` // must be set before the SDK is first loaded
test.after(() => server.close())

const KEYS = ['DEMO_ENABLED', 'NODE_ENV', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL']
let n = 0
async function load(env) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
  Object.assign(process.env, env)
  try {
    return await import(`../src/services/email.service.js?case=${++n}`)
  } finally {
    for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))
  }
}
const invite = (svc, to, message) => svc.sendInvitationEmail({ to, role: 'SELLER', token: 'x'.repeat(43), expiresAt: new Date(Date.now() + 864e5), message })
const FAKE = { RESEND_API_KEY: 'fake-key-for-capture-test', RESEND_FROM_EMAIL: 'noreply@example.invalid' }

test('DEMO_ENABLED=true in production: every send is blocked, even with a Resend key configured', async () => {
  const svc = await load({ NODE_ENV: 'production', DEMO_ENABLED: 'true', ...FAKE })
  assert.equal(svc.EMAIL_BLOCKED, true); assert.equal(svc.EMAIL_MODE, 'demo-blocked'); assert.equal(svc.isDevEmail, false, 'no dev links are handed out either')
  const before = captured.length
  for (let i = 0; i < 25; i++) {
    const r = await invite(svc, `stranger${i}@example.org`, 'Visitor-chosen text that must never be mailed')
    assert.deepEqual(r, { accepted: false, blocked: true }, 'no link, no provider id')
  }
  assert.equal(captured.length, before, 'zero outbound requests')
})

test('demo mode needs no email credentials to start, even in production; the same settings without demo still refuse', async () => {
  await load({ NODE_ENV: 'production', DEMO_ENABLED: 'true' })
  await assert.rejects(() => load({ NODE_ENV: 'production' }), /RESEND_API_KEY and RESEND_FROM_EMAIL must be set in production/)
  await assert.rejects(() => load({ NODE_ENV: 'production', DEMO_ENABLED: 'false' }), /must be set in production/)
})

test('fail closed: any spelling of "true" blocks; anything else does not', async () => {
  for (const v of ['true', 'TRUE', 'True', ' true ', '\ttrue\n']) assert.equal((await load({ DEMO_ENABLED: v, ...FAKE })).EMAIL_BLOCKED, true, JSON.stringify(v))
  for (const v of ['false', '', '1', 'yes', 'on', 'truee']) assert.equal((await load({ DEMO_ENABLED: v, ...FAKE })).EMAIL_BLOCKED, false, JSON.stringify(v))
})

test('CONTROL: with demo mode off, a configured Resend key really sends (so the zero-request results above mean something)', async () => {
  for (const env of [{ NODE_ENV: 'production', ...FAKE }, { NODE_ENV: 'production', DEMO_ENABLED: 'false', ...FAKE }, { ...FAKE }]) {
    const svc = await load(env)
    assert.equal(svc.EMAIL_MODE, 'resend')
    const before = captured.length
    const r = await invite(svc, 'real.recipient@example.org', 'Hello')
    assert.equal(r.accepted, true)
    assert.equal(captured.length, before + 1)
    assert.deepEqual(captured.at(-1).body.to, ['real.recipient@example.org'])
    assert.equal(captured.at(-1).url, '/emails')
  }
})

test('normal local development is unchanged: no key and no demo flag logs the message and returns the link', async () => {
  const svc = await load({})
  assert.equal(svc.EMAIL_MODE, 'development'); assert.equal(svc.isDevEmail, true)
  const original = console.log; const lines = []; console.log = (m) => lines.push(String(m))
  try {
    const r = await invite(svc, 'dev.person@example.org', 'Hi')
    assert.equal(r.accepted, false); assert.match(r.link, /accept-invitation\?token=/)
  } finally { console.log = original }
  assert.ok(lines.some((l) => l.includes('[email:dev]')))
})

test('the blocked-mode log line contains no recipient, subject, message or key', async () => {
  const svc = await load({ NODE_ENV: 'production', DEMO_ENABLED: 'true', ...FAKE })
  const original = console.warn; const lines = []; console.warn = (m) => lines.push(String(m))
  try { await invite(svc, 'secret.person@example.org', 'Confidential words') } finally { console.warn = original }
  assert.equal(lines.length, 1)
  assert.match(lines[0], /blocked in demo mode/)
  for (const forbidden of ['secret.person', 'Confidential', 'invited', FAKE.RESEND_API_KEY]) assert.ok(!lines[0].includes(forbidden), forbidden)
})

test('no other code can reach an email provider: the provider SDK is imported only by email.service.js, and only admin.service.js calls it', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const files = []
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (f === 'node_modules') continue; statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p) } }
  walk(path.join(root, 'src')); walk(path.join(root, 'scripts'))
  const rel = (p) => path.relative(root, p).replaceAll('\\', '/')
  const using = (re) => files.filter((f) => re.test(readFileSync(f, 'utf8'))).map(rel).sort()
  assert.deepEqual(using(/from ['"]resend['"]|require\(['"]resend['"]\)/), ['src/services/email.service.js'])
  assert.deepEqual(using(/nodemailer|sendgrid|mailgun|smtp|emails\.send/i), ['src/services/email.service.js'])
  assert.deepEqual(using(/sendInvitationEmail/).filter((f) => f !== 'src/services/email.service.js'), ['src/services/admin.service.js'])
})
