// INTEGRATION test: the REAL backend process + real PostgreSQL (and the private S3 bucket for the Sony reference).
// Proves that demo product images and demo return photos actually LOAD through the warehouse evidence routes, and that
// authorization and ID validation are intact. Read-only: it only issues GET requests (plus logins).
// Needs the seeded demo data (npm run db:seed, then npm run db:demo-images if the database predates the fixtures).
//   node --test --test-timeout=120000 tests/demo-evidence.integration.test.js
import 'dotenv/config'
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../src/config/db.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 5098
const API = `http://localhost:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const isImage = (buf) => (buf[0] === 0xff && buf[1] === 0xd8) || buf.subarray(1, 4).toString() === 'PNG' || buf.toString('ascii', 0, 4) === 'RIFF'

let server; let log = ''
const get = async (route, cookie) => {
  const res = await fetch(API + route, { headers: cookie ? { Cookie: cookie } : {} })
  return { status: res.status, type: res.headers.get('content-type'), body: Buffer.from(await res.arrayBuffer()) }
}
const login = async (email) => {
  const res = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Password123!' }) })
  assert.equal(res.status, 200, email)
  return res.headers.getSetCookie()[0].split(';')[0]
}

test.before(async () => {
  server = spawn('node', ['src/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), RESEND_API_KEY: '', REDIS_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', (d) => (log += d)); server.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 100 && !log.includes('Server running'); i++) await sleep(100)
  assert.ok(log.includes('Server running'), 'server did not start')
})
test.after(async () => {
  spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'])
  await sleep(300)
  await pool.end()
})

// every seeded inspection with what its product and return actually have
const inspections = async () => (await pool.query(
  `SELECT i.id, p.name, p.image_key, p.image_url, rr.customer_image_url,
          (SELECT COUNT(*)::int FROM return_images WHERE return_request_id = rr.id) AS real_photos
     FROM inspections i JOIN return_requests rr ON rr.id = i.return_request_id JOIN products p ON p.id = rr.product_id
    WHERE p.name NOT LIKE '[TEST]%' AND rr.customer_id NOT IN (SELECT id FROM users WHERE email LIKE '%@returnflow.test' AND name LIKE '[TEST]%') ORDER BY i.id`,
)).rows

test('demo reference pictures load (fixtures, and the Sony S3 image) and products without a picture answer 404', async () => {
  const wendy = await login('wendy@returnflow.test')
  const rows = await inspections()
  assert.ok(rows.length >= 5, 'the seed should provide several inspections')
  let loaded = 0; let missing = 0
  for (const r of rows) {
    const res = await get(`/api/warehouse/inspections/${r.id}/evidence/reference`, wendy)
    if (r.image_key || r.image_url) {
      assert.equal(res.status, 200, `inspection ${r.id} (${r.name}) reference`)
      assert.match(res.type, /^image\/(jpeg|png|webp)$/); assert.ok(isImage(res.body) && res.body.length > 1000)
      loaded++
    } else {
      assert.equal(res.status, 404, `inspection ${r.id} (${r.name}) has no picture`)
      missing++
    }
  }
  assert.ok(loaded >= 3, `only ${loaded} reference pictures loaded`)
  console.log(`   references loaded: ${loaded}, products without a picture (404): ${missing}`)
})

test('demo return photos load through the explicit demo-photo route; the numeric route never serves them', async () => {
  const wendy = await login('wendy@returnflow.test')
  const demo = (await inspections()).filter((r) => r.real_photos === 0 && r.customer_image_url)
  assert.ok(demo.length >= 2, 'the seed should provide demo returns with a sample photo')
  for (const r of demo) {
    const res = await get(`/api/warehouse/inspections/${r.id}/evidence/demo-photo`, wendy)
    assert.equal(res.status, 200, `inspection ${r.id} demo photo`)
    assert.match(res.type, /^image\/(jpeg|png|webp)$/); assert.ok(isImage(res.body) && res.body.length > 1000)
    for (const id of ['null', '0', '-1', 'abc', '1.5', '99999999']) {
      const bad = await get(`/api/warehouse/inspections/${r.id}/evidence/photos/${id}`, wendy)
      assert.ok([400, 404].includes(bad.status), `photos/${id} must not serve the demo photo (got ${bad.status})`)
    }
  }
  // the status endpoint tells the UI which photo is the demo one
  const first = demo[0]
  const a = JSON.parse((await get(`/api/warehouse/inspections/${first.id}/ai-assessment`, wendy)).body.toString()).assessment
  assert.deepEqual(a.evidence.photos, [{ id: null, type: null, demo: true }])
  console.log(`   demo return photos loaded: ${demo.length}`)
})

test('a return that has no sample photo answers 404 on the demo route', async () => {
  const wendy = await login('wendy@returnflow.test')
  const none = (await inspections()).find((r) => r.real_photos === 0 && !r.customer_image_url)
  assert.ok(none, 'the seed should contain an inspection without any photo')
  assert.equal((await get(`/api/warehouse/inspections/${none.id}/evidence/demo-photo`, wendy)).status, 404)
})

test('authorization is unchanged: logged-out 401; customer, seller and pickup agent 403 on every evidence route', async () => {
  const [inspection] = await inspections()
  const routes = [`/evidence/reference`, `/evidence/demo-photo`, `/evidence/photos/1`]
  for (const route of routes) {
    assert.equal((await get(`/api/warehouse/inspections/${inspection.id}${route}`)).status, 401, `logged out ${route}`)
    for (const who of ['alice', 'sam', 'pete']) assert.equal((await get(`/api/warehouse/inspections/${inspection.id}${route}`, await login(`${who}@returnflow.test`))).status, 403, `${who} ${route}`)
  }
})
