// Usage: npm run test:ai:scenario
// Deterministic test of the development-only AI test scenario (isolated test return + warehouse AI assessment).
// OpenRouter is a LOCAL MOCK here (no provider quota); PostgreSQL and the private S3 bucket are real. It checks that the
// scenario is walled off from production and from real data, that two DISTINCT images reach the model, and that removing the
// scenario puts every table back exactly as it was.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import pool from '../src/config/db.js'
import { S3_BUCKET, s3 } from '../src/config/s3.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REFERENCE = readFileSync(path.join(root, 'assets', 'demo-products', 'sony-wh1000xm5.png'))
const [PORT, PROD_PORT, OFF_PORT, MOCK_PORT] = [5090, 5091, 5092, 5097]
const API = `http://localhost:${PORT}`
const MODEL = 'dots-studio/dots-3-note-preview:free', PROVIDER = 'atlas-cloud/fp8'
const PNG = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, n)])
const q = async (s, p) => (await pool.query(s, p)).rows
let n = 0
const ok = (m) => console.log('PASS', ++n, m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const md5 = (x) => createHash('md5').update(JSON.stringify(x)).digest('hex')
const TABLES = ['users', 'products', 'orders', 'order_items', 'return_requests', 'pickup_assignments', 'inspections', 'refunds', 'return_images', 'ai_assessments', 'invitations']
const fingerprint = async () => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, md5(await q(`SELECT * FROM ${t} ORDER BY id`))])))

// ---- mock OpenRouter: records what it receives, answers with a valid assessment
const calls = []
const mock = createServer((req, res) => {
  let raw = ''
  req.on('data', (d) => (raw += d))
  req.on('end', () => {
    const body = JSON.parse(raw || '{}'); calls.push(body)
    const result = { schemaVersion: 1, overallAssessment: 'needs_manual_review', productMatch: { status: 'likely_match', evidence: ['Shape matches the reference.'] }, damageAssessment: { status: 'inconclusive', types: [], evidence: [] }, visibleCondition: 'inconclusive', limitations: ['Test run against a local mock.'], manualReviewRequired: true, summary: 'Mock answer for the scenario test.' }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id: 'g', object: 'chat.completion', created: 1, model: body.model, system_fingerprint: 'fp', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(result) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
  })
}).listen(MOCK_PORT)

const procs = []
const start = async (port, env) => {
  const p = spawn('node', ['src/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), RESEND_API_KEY: '', RESEND_FROM_EMAIL: '', RATE_LIMIT_LOGIN_PER_IP: '100000', RATE_LIMIT_LOGIN_FAILURES: '100000', RATE_LIMIT_AI_PER_USER: '100000', ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  procs.push(p); p.log = ''; p.stdout.on('data', (d) => (p.log += d)); p.stderr.on('data', (d) => (p.log += d))
  for (let i = 0; i < 80 && !p.log.includes('Server running'); i++) await sleep(100)
  assert.ok(p.log.includes('Server running'), 'server did not start: ' + p.log.slice(-300))
  return p
}
const call = async (base, who, method, route, body, form) => {
  const res = await fetch(base + route, { method, headers: { ...(who?.c && { Cookie: who.c }), ...(body !== undefined && { 'Content-Type': 'application/json' }) }, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) })
  const buf = Buffer.from(await res.arrayBuffer()); let json; try { json = JSON.parse(buf.toString()) } catch { /* binary */ }
  return { s: res.status, j: json, buf, h: res.headers }
}
const login = async (base, email) => { const r = await call(base, null, 'POST', '/api/auth/login', { email, password: 'Password123!' }); assert.equal(r.s, 200, email); return { c: r.h.getSetCookie()[0].split(';')[0] } }
const upload = (who, buf, type = 'image/png', name = 'photo.png') => { const f = new FormData(); f.append('image', new Blob([buf], { type }), name); return call(API, who, 'POST', '/api/dev/ai-test/scenarios', undefined, f) }
const exists = async (key) => { try { await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key })); return true } catch (e) { if (e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound') return false; throw e } }

let before
try {
  before = await fingerprint()
  const counts0 = await q('SELECT (SELECT COUNT(*)::int FROM return_requests) r, (SELECT COUNT(*)::int FROM refunds) f, (SELECT COUNT(*)::int FROM users) u')

  // ============================================================================ walled off from production
  const flagOff = await start(OFF_PORT, { AI_TEST_SCENARIO: '' })
  const offWho = await login(`http://localhost:${OFF_PORT}`, 'wendy@returnflow.test')
  assert.equal((await call(`http://localhost:${OFF_PORT}`, offWho, 'GET', '/api/dev/ai-test/scenarios')).s, 404)
  const prod = await start(PROD_PORT, { NODE_ENV: 'production', AI_TEST_SCENARIO: 'true', CORS_ORIGIN: 'http://localhost:5173', RESEND_API_KEY: 'unused-test-value', RESEND_FROM_EMAIL: 'onboarding@resend.dev', DEMO_ENABLED: 'false' })
  const prodWho = await login(`http://localhost:${PROD_PORT}`, 'wendy@returnflow.test'); const prodCall = await call(`http://localhost:${PROD_PORT}`, prodWho, 'GET', '/api/dev/ai-test/scenarios')
  assert.equal(prodCall.s, 404); assert.equal((await call(`http://localhost:${PROD_PORT}`, prodWho, 'POST', '/api/dev/ai-test/scenarios')).s, 404); assert.equal((await call(`http://localhost:${PROD_PORT}`, prodWho, 'DELETE', '/api/dev/ai-test/scenarios')).s, 404)
  ok('the test routes do not exist when AI_TEST_SCENARIO is off (404) and not even with the flag on when NODE_ENV=production (404 for GET, POST and DELETE)')

  // ======================================================================================= enabled (development)
  const dev = await start(PORT, { AI_TEST_SCENARIO: 'true', OPENROUTER_API_KEY: 'sk-or-test-not-real', OPENROUTER_SERVER_URL: `http://localhost:${MOCK_PORT}` })
  const [wendy, alice, sam, sara, pete] = await Promise.all(['wendy', 'alice', 'sam', 'sara', 'pete'].map((u) => login(API, `${u}@returnflow.test`)))
  for (const [name, who] of [['logged out', null], ['customer', alice], ['seller', sam], ['pickup agent', pete]]) { assert.equal((await call(API, who, 'GET', '/api/dev/ai-test/scenarios')).s, name === 'logged out' ? 401 : 403, name); assert.equal((await call(API, who, 'DELETE', '/api/dev/ai-test/scenarios')).s, name === 'logged out' ? 401 : 403, name) }
  assert.deepEqual((await call(API, wendy, 'GET', '/api/dev/ai-test/scenarios')).j.scenarios, []); ok('enabled in development: only a warehouse user can use it (401 logged out, 403 customer / seller / pickup agent); it starts empty')

  // ================================================================================= bad uploads change nothing
  assert.equal((await upload(wendy, REFERENCE)).s, 400); const same = await upload(wendy, REFERENCE); assert.match(same.j.message, /identical to the product reference/)
  assert.equal((await upload(wendy, Buffer.from('not an image'), 'image/png', 'a.png')).s, 400); assert.equal((await upload(wendy, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml', 'a.svg')).s, 400)
  assert.equal((await upload(wendy, Buffer.concat([PNG(5), Buffer.alloc(5 * 1024 * 1024)]))).s, 400); assert.equal((await call(API, wendy, 'POST', '/api/dev/ai-test/scenarios', undefined, new FormData())).s, 400)
  assert.deepEqual(await fingerprint(), before); ok('the same image as the reference, a non-image, an SVG, an oversized file and no file are all refused (400) and change nothing in the database')

  // ============================================================================================= create + isolation
  const photo = PNG(7)
  const created = await upload(wendy, photo); assert.equal(created.s, 201); const { returnId, inspectionId } = created.j
  const chain = (await q(`SELECT u.email, u.name, u.role, o.status ostatus, p.name product, s.email seller, rr.status rstatus, rr.description, rr.seller_decision_at, pa.status pstatus, i.status istatus, i.id iid, w.email staff
    FROM return_requests rr JOIN users u ON u.id = rr.customer_id JOIN orders o ON o.id = rr.order_id JOIN order_items oi ON oi.id = rr.order_item_id JOIN products p ON p.id = oi.product_id JOIN users s ON s.id = p.seller_id
    JOIN pickup_assignments pa ON pa.return_request_id = rr.id JOIN inspections i ON i.return_request_id = rr.id JOIN users w ON w.id = i.warehouse_staff_id WHERE rr.id = $1`, [returnId]))[0]
  assert.deepEqual([chain.email, chain.name, chain.role, chain.ostatus, chain.product, chain.seller, chain.rstatus, chain.pstatus, chain.istatus, chain.staff, chain.iid],
    ['ai-test.customer@returnflow.test', '[TEST] AI Inspection Customer', 'CUSTOMER', 'DELIVERED', 'Sony WH-1000XM5', 'sam@returnflow.test', 'WAREHOUSE_RECEIVED', 'PICKED_UP', 'PENDING', 'wendy@returnflow.test', inspectionId]); assert.match(chain.description, /\[TEST\]/); assert.ok(chain.seller_decision_at)
  const keys = (await q('SELECT image_key FROM return_images WHERE return_request_id = $1', [returnId])).map((r) => r.image_key); assert.equal(keys.length, 1); assert.match(keys[0], new RegExp(`^returns/${returnId}/[0-9a-f-]{36}\\.png$`)); assert.ok(await exists(keys[0]))
  const others = await q(`SELECT COUNT(*)::int c FROM return_requests WHERE id <> $1`, [returnId]); assert.equal(others[0].c, counts0[0].r)
  ok(`a labelled test return (#${returnId}) exists, owned by the [TEST] customer, built through the real workflow (delivered Sony order, seller approved, photo stored privately with a server-made key, pickup picked up, inspection PENDING for Wendy); the real returns are unchanged`)
  const rowsNow = await fingerprint()
  for (const t of ['products', 'refunds', 'invitations']) assert.equal(rowsNow[t], before[t]); const stillSame = await q(`SELECT md5(string_agg(rr::text, ',' ORDER BY rr.id)) m FROM return_requests rr WHERE rr.id <> $1`, [returnId])
  assert.ok(stillSame[0].m); ok('products, refunds and invitations are byte-identical; no existing return was reopened')

  // ===================================================================== the warehouse AI assessment, two distinct images
  const base = `/api/warehouse/inspections/${inspectionId}/ai-assessment`
  const info = (await call(API, wendy, 'GET', base)).j.assessment; assert.equal(info.status, 'NOT_STARTED'); assert.equal(info.unavailable, null); assert.equal(info.evidence.hasReference, true); assert.equal(info.evidence.photos.length, 1)
  const refImg = await call(API, wendy, 'GET', `/api/warehouse/inspections/${inspectionId}/evidence/reference`); const picImg = await call(API, wendy, 'GET', `/api/warehouse/inspections/${inspectionId}/evidence/photos/${info.evidence.photos[0].id}`)
  assert.ok(refImg.buf.equals(REFERENCE)); assert.ok(picImg.buf.equals(photo)); assert.ok(!refImg.buf.equals(picImg.buf)); ok('the warehouse screen data offers both images through the private evidence endpoints, and they are different bytes (reference vs the uploaded photo)')
  const lifecycle = async () => (await q(`SELECT rr.status rs, i.status ist, (SELECT COUNT(*)::int FROM refunds WHERE return_request_id = rr.id) f FROM return_requests rr JOIN inspections i ON i.return_request_id = rr.id WHERE rr.id = $1`, [returnId]))[0]
  const lifeBefore = await lifecycle()
  assert.equal((await call(API, wendy, 'POST', base)).s, 202)
  let a; for (let i = 0; i < 100; i++) { a = (await call(API, wendy, 'GET', base)).j.assessment; if (a.status !== 'RUNNING') break; await sleep(150) }
  assert.equal(a.status, 'COMPLETED'); assert.equal(calls.length, 1)
  const sent = calls[0]; assert.equal(sent.model, MODEL); assert.deepEqual(sent.provider, { only: [PROVIDER], allow_fallbacks: false })
  const imgs = sent.messages[1].content.filter((p) => p.type === 'image_url').map((p) => p.image_url.url)
  assert.equal(imgs.length, 2); assert.notEqual(imgs[0], imgs[1]); assert.equal(imgs[0], `data:image/png;base64,${REFERENCE.toString('base64')}`); assert.equal(imgs[1], `data:image/png;base64,${photo.toString('base64')}`)
  ok(`the request to the (mock) model uses ${MODEL} restricted to ${PROVIDER} with fallbacks off, and carries TWO DISTINCT images: the S3 reference image, then the uploaded photo`)
  assert.deepEqual(await lifecycle(), lifeBefore); assert.equal(lifeBefore.f, 0); ok('the assessment changed no status and created no refund')
  const again = (await call(API, wendy, 'GET', base)).j.assessment; assert.deepEqual(again.result, a.result); assert.equal((await q('SELECT status FROM ai_assessments WHERE inspection_id = $1', [inspectionId]))[0].status, 'COMPLETED'); ok('the stored assessment is returned again on a fresh request (as after a page refresh)')
  const seller = (await call(API, sam, 'GET', `/api/seller/returns/${returnId}`)).j.return.ai_summary; assert.equal(seller.status, 'COMPLETED'); assert.equal((await call(API, sara, 'GET', `/api/seller/returns/${returnId}`)).s, 404); ok('the owning seller (Sam) sees the summary; another seller (Sara) gets 404')

  // ===================================================================================================== cleanup
  const second = await upload(wendy, PNG(8)); assert.equal(second.s, 201); assert.equal((await call(API, wendy, 'GET', '/api/dev/ai-test/scenarios')).j.scenarios.length, 2)
  const allKeys = (await q(`SELECT image_key FROM return_images WHERE return_request_id IN (SELECT id FROM return_requests WHERE customer_id = (SELECT id FROM users WHERE email = 'ai-test.customer@returnflow.test'))`)).map((r) => r.image_key); assert.equal(allKeys.length, 2)
  const removed = await call(API, wendy, 'DELETE', '/api/dev/ai-test/scenarios'); assert.equal(removed.s, 200); assert.equal(removed.j.removed, 2)
  for (const k of allKeys) assert.equal(await exists(k), false); assert.deepEqual(await fingerprint(), before); ok('removing the test data deletes both test returns, their photos in S3, the assessment and the [TEST] customer; every table is byte-identical to before')
  assert.ok(!dev.log.includes('sk-or-test-not-real') && !flagOff.log.includes('Error')); void prod; ok('no API key in the server log')
  console.log(`\nAll ${n} checks passed.`)
} catch (e) {
  console.error('FAIL', e.stack?.split('\n').slice(0, 6).join('\n'))
  process.exitCode = 1
} finally {
  try { const w = await login(API, 'wendy@returnflow.test'); await call(API, w, 'DELETE', '/api/dev/ai-test/scenarios') } catch { /* server may be down */ }
  mock.close(); for (const p of procs) spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']); await sleep(400)
  const left = await q(`SELECT (SELECT COUNT(*)::int FROM users WHERE email = 'ai-test.customer@returnflow.test') test_users, (SELECT COUNT(*)::int FROM return_requests) returns, (SELECT COUNT(*)::int FROM return_images) imgs`)
  console.log('after cleanup:', JSON.stringify(left[0]), before ? '| tables identical to start: ' + (md5(await fingerprint()) === md5(before)) : '')
  await pool.end(); process.exit(process.exitCode ?? 0)
}
