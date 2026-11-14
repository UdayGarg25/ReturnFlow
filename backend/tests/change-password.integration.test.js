// INTEGRATION test: the REAL backend process and a real (LOCAL) PostgreSQL, called the way a browser would call it.
//  - every shared demo account is refused (403) and its stored password hash NEVER changes;
//  - a normal registered user can change their password, with all the checks, and the old password stops working;
//  - nobody can change another account's password, and the endpoint needs a session and is rate limited.
// Test users use "@example.test" addresses and are deleted afterwards. The database is forced to the local one and the
// test refuses to run if the server reports any other target.   node --test --test-timeout=180000 tests/change-password.integration.test.js
process.env.DATABASE_URL = '' // never the hosted database, whatever .env says
import 'dotenv/config'
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../src/config/db.js'
import { DEMO_ACCOUNT_EMAILS } from '../src/config/demoAccounts.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 5066
const API = `http://127.0.0.1:${PORT}`
const PUBLIC_PASSWORD = 'Password123!'
const RUN = String(Date.now())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let server
let log = ''

const call = async (cookie, method, route, body) => {
  const r = await fetch(API + route, { method, headers: { ...(cookie && { Cookie: cookie }), ...(body !== undefined && { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, json: await r.json().catch(() => null), cookie: r.headers.getSetCookie()[0]?.split(';')[0] }
}
const login = (email, password) => call(null, 'POST', '/api/auth/login', { email, password })
const hashOf = async (email) => (await pool.query('SELECT password_hash FROM users WHERE LOWER(email) = $1', [email])).rows[0]?.password_hash

test.before(async () => {
  server = spawn('node', ['src/server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DATABASE_URL: '', PORT: String(PORT), NODE_ENV: '', DEMO_ENABLED: 'true', REDIS_URL: '', RESEND_API_KEY: '', RATE_LIMIT_LOGIN_PER_IP: '100000', RATE_LIMIT_LOGIN_FAILURES: '100000', RATE_LIMIT_REGISTER_PER_IP: '100000', RATE_LIMIT_API_PER_USER: '100000', RATE_LIMIT_API_PER_IP: '100000' } })
  server.stdout.on('data', (d) => (log += d)); server.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 100 && !log.includes('Server running'); i++) await sleep(100)
  assert.ok(log.includes('Server running'), 'server did not start: ' + log.slice(-300))
  assert.match(log, /Database target: localhost:\d+\//, 'the test must run against the LOCAL database only')
})
test.after(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'change-pw-test-%@example.test'`)
  spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'])
  await sleep(300)
  await pool.end()
})

test('every shared demo account is flagged in /me, refused with 403, and its stored password never changes', async (t) => {
  for (const email of DEMO_ACCOUNT_EMAILS) {
    const before = await hashOf(email)
    assert.ok(before, `${email} must exist in the local database (run the demo seed)`)
    const session = await login(email, PUBLIC_PASSWORD)
    assert.equal(session.status, 200, email)
    assert.equal((await call(session.cookie, 'GET', '/api/auth/me')).json.user.isDemoAccount, true, `${email}: /me must say isDemoAccount`)

    // a perfectly valid-looking request, and also garbage: the refusal comes first either way
    for (const body of [{ currentPassword: PUBLIC_PASSWORD, newPassword: 'Brand-new-pass-9!', confirmPassword: 'Brand-new-pass-9!' }, { currentPassword: 'wrong', newPassword: 'x', confirmPassword: 'y' }, {}]) {
      const r = await call(session.cookie, 'POST', '/api/auth/change-password', body)
      assert.equal(r.status, 403, `${email} ${JSON.stringify(body).slice(0, 40)}`)
      assert.equal(r.json.message, 'Password changes are disabled for demo accounts.')
      assert.equal(r.json.errors, undefined, 'a demo refusal says nothing about which fields were wrong')
    }
    assert.equal(await hashOf(email), before, `${email}: the stored password hash must be untouched`)
    assert.equal((await login(email, PUBLIC_PASSWORD)).status, 200, `${email}: the public demo password still works`)
    assert.equal((await login(email, 'Brand-new-pass-9!')).status, 401, `${email}: the attempted new password was never set`)
  }
  t.diagnostic(`${DEMO_ACCOUNT_EMAILS.length} demo accounts checked`)
})

test('the endpoint needs a session', async () => {
  const r = await call(null, 'POST', '/api/auth/change-password', { currentPassword: 'a', newPassword: 'bbbbbbbb', confirmPassword: 'bbbbbbbb' })
  assert.equal(r.status, 401)
})

test('a normal user can change their password; every check works; the old password stops working', async () => {
  const email = `change-pw-test-${RUN}-a@example.test`
  const OLD = 'Old-secret-pass-1'; const NEW = 'New-secret-pass-2'
  const reg = await call(null, 'POST', '/api/auth/register', { name: 'Change Password Tester', email, password: OLD })
  assert.equal(reg.status, 201)
  assert.equal(reg.json.user.isDemoAccount, false, 'a normal account is not a demo account')
  const { cookie } = reg
  assert.equal((await call(cookie, 'GET', '/api/auth/me')).json.user.isDemoAccount, false)
  const change = (body) => call(cookie, 'POST', '/api/auth/change-password', body)

  const wrong = await change({ currentPassword: 'not-my-password', newPassword: NEW, confirmPassword: NEW })
  assert.equal(wrong.status, 400); assert.deepEqual(wrong.json.errors, { currentPassword: 'Your current password is incorrect.' })
  const mismatch = await change({ currentPassword: OLD, newPassword: NEW, confirmPassword: 'something-else-9' })
  assert.equal(mismatch.status, 400); assert.deepEqual(mismatch.json.errors, { confirmPassword: 'The passwords do not match.' })
  const weak = await change({ currentPassword: OLD, newPassword: 'short', confirmPassword: 'short' })
  assert.equal(weak.status, 400); assert.match(weak.json.errors.newPassword, /at least 8/)
  const same = await change({ currentPassword: OLD, newPassword: OLD, confirmPassword: OLD })
  assert.equal(same.status, 400); assert.match(same.json.errors.newPassword, /different/)
  const empty = await change({})
  assert.equal(empty.status, 400); assert.equal(Object.keys(empty.json.errors).length, 3)
  assert.equal((await login(email, OLD)).status, 200, 'nothing changed yet: every failed attempt left the password alone')

  const hashBefore = await hashOf(email)
  const ok = await change({ currentPassword: OLD, newPassword: NEW, confirmPassword: NEW })
  assert.equal(ok.status, 200); assert.equal(ok.json.message, 'Your password was updated.')
  assert.notEqual(await hashOf(email), hashBefore, 'the stored hash changed')
  assert.ok(!JSON.stringify(ok.json).includes(NEW) && !log.includes(NEW) && !log.includes(OLD), 'no password appears in a response or in the server log')
  assert.equal((await login(email, OLD)).status, 401, 'the old password no longer works')
  assert.equal((await login(email, NEW)).status, 200, 'the new password works')
  assert.equal((await call(cookie, 'GET', '/api/auth/me')).status, 200, 'the current session stays signed in')
})

test('nobody can change another account: ids and emails in the body are ignored', async () => {
  const email = `change-pw-test-${RUN}-b@example.test`
  const reg = await call(null, 'POST', '/api/auth/register', { name: 'Second Tester', email, password: 'Second-pass-word-1' })
  const aliceBefore = await hashOf('alice@returnflow.test')
  const r = await call(reg.cookie, 'POST', '/api/auth/change-password', { currentPassword: 'Second-pass-word-1', newPassword: 'Changed-pass-word-2', confirmPassword: 'Changed-pass-word-2', email: 'alice@returnflow.test', userId: 1, id: 1 })
  assert.equal(r.status, 200)
  assert.equal(await hashOf('alice@returnflow.test'), aliceBefore, "Alice's password is untouched")
  assert.equal((await login(email, 'Changed-pass-word-2')).status, 200, 'only the caller\'s own password changed')
})

test('guessing the current password is rate limited per user (11th attempt in the window is refused)', async () => {
  const email = `change-pw-test-${RUN}-c@example.test`
  const reg = await call(null, 'POST', '/api/auth/register', { name: 'Third Tester', email, password: 'Third-pass-word-1' })
  const statuses = []
  for (let i = 0; i < 11; i++) statuses.push((await call(reg.cookie, 'POST', '/api/auth/change-password', { currentPassword: `guess-${i}-password`, newPassword: 'Whatever-pass-3', confirmPassword: 'Whatever-pass-3' })).status)
  assert.deepEqual(statuses, [...Array(10).fill(400), 429])
  assert.equal((await login(email, 'Third-pass-word-1')).status, 200, 'the password was never changed by the guesses')
})
