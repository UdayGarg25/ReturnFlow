// INTEGRATION test (needs the real PostgreSQL from backend/.env; no Redis, S3 or OpenRouter).
// Runs the PRODUCTION loadContext / getEvidenceImage against the real schema. Every write happens inside a transaction
// that is rolled back, so no data is changed. Run: node --test tests/ai-context.integration.test.js
import 'dotenv/config'
import test from 'node:test'
import assert from 'node:assert/strict'
import pool from '../src/config/db.js'
import { getAssessment, getEvidenceImage, loadContext } from '../src/services/aiInspection.service.js'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)])
let client
let inspection

test.before(async () => {
  const { rows } = await pool.query('SELECT i.id, i.return_request_id AS return_id FROM inspections i ORDER BY i.id LIMIT 1')
  assert.ok(rows[0], 'the database needs at least one inspection (run the demo seed)')
  inspection = rows[0]
  client = await pool.connect()
  await client.query('BEGIN')
})
test.after(async () => {
  await client?.query('ROLLBACK').catch(() => {})
  client?.release()
  await pool.end()
})

// each test starts from a clean slate inside the (never committed) transaction
async function arrange({ url = null, keys = [] }) {
  await client.query('SAVEPOINT s')
  await client.query('DELETE FROM return_images WHERE return_request_id = $1', [inspection.return_id])
  await client.query('UPDATE return_requests SET customer_image_url = $2 WHERE id = $1', [inspection.return_id, url])
  for (const key of keys) await client.query(`INSERT INTO return_images (return_request_id, image_key, image_type) VALUES ($1, $2, 'image/png')`, [inspection.return_id, key])
}
const undo = () => client.query('ROLLBACK TO SAVEPOINT s')

test('loadContext runs against the real schema and returns the reference fields', async () => {
  const ctx = await loadContext(inspection.id)
  for (const f of ['product_name', 'image_key', 'product_image_url', 'customer_image_url', 'photos']) assert.ok(f in ctx, f)
  assert.ok(Array.isArray(ctx.photos))
})

test('real S3 photos: returned with their keys and no URL', async () => {
  await arrange({ keys: ['returns/test/a.png', 'returns/test/b.png'] })
  const ctx = await loadContext(inspection.id, client)
  assert.deepEqual(ctx.photos.map((p) => [p.image_key, p.image_url, p.image_type]), [['returns/test/a.png', null, 'image/png'], ['returns/test/b.png', null, 'image/png']])
  await undo()
})

test('S3 photos win over the demo customer_image_url', async () => {
  await arrange({ url: 'https://example.com/demo.jpg', keys: ['returns/test/a.png'] })
  const ctx = await loadContext(inspection.id, client)
  assert.equal(ctx.photos.length, 1)
  assert.equal(ctx.photos[0].image_key, 'returns/test/a.png')
  await undo()
})

test('demo data: no return_images row but a customer_image_url becomes one synthetic photo', async () => {
  await arrange({ url: 'https://example.com/demo.jpg' })
  const ctx = await loadContext(inspection.id, client)
  assert.deepEqual(ctx.photos, [{ id: null, image_key: null, image_url: 'https://example.com/demo.jpg', image_type: null }])
  await undo()
})

test('no images at all: an empty photo list, not an error', async () => {
  await arrange({})
  assert.deepEqual((await loadContext(inspection.id, client)).photos, [])
  await undo()
})

test('an unknown inspection is a 404', async () => {
  await assert.rejects(() => loadContext(2_000_000_000, client), (e) => e.code === 'NOT_FOUND')
})

test('getAssessment (the status endpoint) works on the real schema', async () => {
  const a = await getAssessment(inspection.id)
  assert.ok(['NOT_STARTED', 'RUNNING', 'COMPLETED', 'FAILED'].includes(a.status))
  assert.ok(Array.isArray(a.evidence.photos))
})

test('getEvidenceImage (production code, real SQL) serves the right source for each case', async () => {
  const calls = []
  const resolve = async (key, url) => { calls.push([key, url]); return { bytes: PNG, type: 'image/png' } }

  await arrange({ keys: ['returns/test/a.png'] })
  const photoId = (await loadContext(inspection.id, client)).photos[0].id
  const real = await getEvidenceImage(inspection.id, 'photo', photoId, { db: client, resolve })
  assert.deepEqual(calls.at(-1), ['returns/test/a.png', null]); assert.equal(real.type, 'image/png'); assert.ok(real.body.equals(PNG))
  await undo()

  await arrange({ url: 'demo-fixture:iphone-16.jpg' })
  await getEvidenceImage(inspection.id, 'demo-photo', undefined, { db: client, resolve })
  assert.deepEqual(calls.at(-1), [null, 'demo-fixture:iphone-16.jpg'])
  await assert.rejects(() => getEvidenceImage(inspection.id, 'photo', null, { db: client, resolve }), (e) => e.code === 'NOT_FOUND')
  await assert.rejects(() => getEvidenceImage(inspection.id, 'photo', 987654, { db: client, resolve }), (e) => e.code === 'NOT_FOUND')
  await undo()

  await arrange({})
  await assert.rejects(() => getEvidenceImage(inspection.id, 'demo-photo', undefined, { db: client, resolve }), (e) => e.code === 'NOT_FOUND')
  await undo()
})
