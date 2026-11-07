/**
 * image-fallback-phase6.test.js - UNIT tests (no network, no S3, no PostgreSQL) of the PRODUCTION image resolution in
 * src/services/aiInspection.service.js: resolveImage and getEvidenceImage. Nothing from the service is copied here.
 * External services are injected through the service's own parameters:
 *   - resolveImage(key, url, { getObject, fetchImage })      S3 and the URL fetcher
 *   - getEvidenceImage(id, kind, imageId, { db, resolve })   a fake db whose query() returns canned rows
 * The SQL itself is checked against the real schema in ai-context.integration.test.js; the SSRF guarantees of the real
 * fetcher are in safefetch-security.test.js.
 *
 * Run: node --test tests/image-fallback-phase6.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { AiError, getEvidenceImage, resolveImage } from '../src/services/aiInspection.service.js'
import { SsrfError } from '../src/utils/safeFetch.js'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)])
const HTML = Buffer.from('<html>not an image</html>')
const noSuchKey = () => Object.assign(new Error('missing'), { name: 'NoSuchKey' })
const code = (c) => (e) => e instanceof AiError && e.code === c

// a recording pair of fakes
function fakes({ s3 = {}, urls = {} } = {}) {
  const calls = { s3: [], urls: [] }
  return {
    calls,
    deps: {
      getObject: async (key) => { calls.s3.push(key); const v = s3[key]; if (v instanceof Error) throw v; if (v === undefined) throw noSuchKey(); return { body: v, contentType: 'x' } },
      fetchImage: async (url) => { calls.urls.push(url); const v = urls[url]; if (v instanceof Error) throw v; if (v === undefined) throw new Error('unexpected url'); return { body: v, contentType: 'x' } },
    },
  }
}

// ------------------------------------------------------------------------------------------------ resolveImage
test('resolveImage: an S3 key is preferred, the URL is not even fetched, and the type comes from the bytes', async () => {
  const f = fakes({ s3: { 'a/key.png': PNG }, urls: { 'https://img.test/a.jpg': JPG } })
  const r = await resolveImage('a/key.png', 'https://img.test/a.jpg', f.deps)
  assert.deepEqual([r.type, r.bytes.equals(PNG)], ['image/png', true])
  assert.deepEqual(f.calls.urls, [])
})

test('resolveImage: no key -> the demo URL is used (JPEG, PNG and WebP are recognised)', async () => {
  for (const [bytes, type] of [[JPG, 'image/jpeg'], [PNG, 'image/png'], [WEBP, 'image/webp']]) {
    const f = fakes({ urls: { 'https://img.test/x': bytes } })
    const r = await resolveImage(null, 'https://img.test/x', f.deps)
    assert.equal(r.type, type)
    assert.deepEqual(f.calls.s3, [])
  }
})

test('resolveImage: a key that is MISSING in S3 (NoSuchKey) falls back to the URL', async () => {
  const f = fakes({ urls: { 'https://img.test/a.jpg': JPG } })
  const r = await resolveImage('gone/key.png', 'https://img.test/a.jpg', f.deps)
  assert.equal(r.type, 'image/jpeg')
  assert.deepEqual(f.calls.s3, ['gone/key.png'])
  assert.deepEqual(f.calls.urls, ['https://img.test/a.jpg'])
})

test('resolveImage: any OTHER S3 failure is an error and does NOT silently fall back to the URL', async () => {
  for (const name of ['AccessDenied', 'InternalError', 'TimeoutError', 'NetworkingError']) {
    const f = fakes({ s3: { k: Object.assign(new Error(name), { name }) }, urls: { 'https://img.test/a.jpg': JPG } })
    await assert.rejects(() => resolveImage('k', 'https://img.test/a.jpg', f.deps), code('IMAGE_UNAVAILABLE'), name)
    assert.deepEqual(f.calls.urls, [], `${name}: the URL must not be tried`)
  }
})

test('resolveImage: nothing to load -> IMAGE_UNAVAILABLE; missing key and no URL -> IMAGE_UNAVAILABLE', async () => {
  await assert.rejects(() => resolveImage(null, null, fakes().deps), code('IMAGE_UNAVAILABLE'))
  await assert.rejects(() => resolveImage('gone', null, fakes().deps), code('IMAGE_UNAVAILABLE'))
})

test('resolveImage: fetch failures (including SSRF refusals) become IMAGE_UNAVAILABLE and reveal nothing', async () => {
  for (const err of [new SsrfError('Blocked address 10.0.0.1'), new Error('ECONNRESET')]) {
    const f = fakes({ urls: { 'https://img.test/a.jpg': err } })
    await assert.rejects(() => resolveImage(null, 'https://img.test/a.jpg', f.deps), (e) => e instanceof AiError && e.code === 'IMAGE_UNAVAILABLE' && !/10\.0\.0\.1/.test(e.message))
  }
})

test('resolveImage: bytes that are not an image are refused from S3 and from the URL; oversized files too', async () => {
  await assert.rejects(() => resolveImage('k', null, fakes({ s3: { k: HTML } }).deps), code('UNSUPPORTED_IMAGE'))
  await assert.rejects(() => resolveImage(null, 'https://img.test/h', fakes({ urls: { 'https://img.test/h': HTML } }).deps), code('UNSUPPORTED_IMAGE'))
  const huge = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)])
  await assert.rejects(() => resolveImage('k', null, fakes({ s3: { k: huge } }).deps), code('IMAGES_TOO_LARGE'))
  await assert.rejects(() => resolveImage(null, 'https://img.test/big', fakes({ urls: { 'https://img.test/big': huge } }).deps), code('IMAGES_TOO_LARGE'))
})

// ------------------------------------------------------------------------------------------------ getEvidenceImage
// The service's real loadContext runs against this fake database (two queries: the inspection, then the photo rows).
function fakeDb({ inspection, photos = [] }) {
  return {
    query: async (sql) => {
      if (/FROM inspections/i.test(sql)) {
        return { rows: inspection ? [{ id: 9, return_id: 3, customer_image_url: null, product_name: 'Sony', image_key: null, product_image_url: null, ...inspection }] : [] }
      }
      return { rows: photos }
    },
  }
}
const spy = (result = { bytes: PNG, type: 'image/png' }) => {
  const calls = []
  return { calls, resolve: async (...a) => { calls.push(a); if (result instanceof Error) throw result; return result } }
}
const notFound = (e) => e.code === 'NOT_FOUND'

test('getEvidenceImage(reference): passes the product S3 key first and the product URL as the fallback', async () => {
  const s = spy()
  const r = await getEvidenceImage(9, 'reference', undefined, { db: fakeDb({ inspection: { image_key: 'products/x.png', product_image_url: 'https://img.test/p.png' } }), resolve: s.resolve })
  assert.deepEqual(s.calls, [['products/x.png', 'https://img.test/p.png']])
  assert.equal(r.type, 'image/png')
  assert.ok(r.body.equals(PNG))
})

test('getEvidenceImage(reference): URL-only demo product works; no key and no URL is a 404', async () => {
  const s = spy()
  await getEvidenceImage(9, 'reference', undefined, { db: fakeDb({ inspection: { product_image_url: 'https://img.test/p.png' } }), resolve: s.resolve })
  assert.deepEqual(s.calls, [[null, 'https://img.test/p.png']])
  await assert.rejects(() => getEvidenceImage(9, 'reference', undefined, { db: fakeDb({ inspection: {} }), resolve: s.resolve }), notFound)
  assert.equal(s.calls.length, 1, 'nothing is resolved when there is no source')
})

test('getEvidenceImage(photo): a real return_images row is served by its S3 key, with its stored type', async () => {
  const s = spy({ bytes: JPG, type: 'image/jpeg' })
  const db = fakeDb({ inspection: { customer_image_url: 'https://img.test/demo.jpg' }, photos: [{ id: 41, image_key: 'returns/3/a.jpg', image_type: 'image/webp' }] })
  const r = await getEvidenceImage(9, 'photo', 41, { db, resolve: s.resolve })
  assert.deepEqual(s.calls, [['returns/3/a.jpg', null]], 'the demo URL is ignored when real photos exist')
  assert.equal(r.type, 'image/webp')
})

test('getEvidenceImage(demo-photo): a demo return without return_images serves customer_image_url, only through the explicit kind', async () => {
  const s = spy()
  const db = fakeDb({ inspection: { customer_image_url: 'demo-fixture:iphone-16.jpg' } })
  await getEvidenceImage(9, 'demo-photo', undefined, { db, resolve: s.resolve })
  assert.deepEqual(s.calls, [[null, 'demo-fixture:iphone-16.jpg']])
  // the numeric-id route must never reach the sample photo, whatever id (or non-id) is sent
  for (const bad of [null, undefined, 0, -1, '1', 'null', NaN, 1.5]) await assert.rejects(() => getEvidenceImage(9, 'photo', bad, { db, resolve: s.resolve }), notFound, String(bad))
  assert.equal(s.calls.length, 1)
})

test('getEvidenceImage(demo-photo): 404 when the return has real photos, or no sample photo at all', async () => {
  const s = spy()
  const withReal = fakeDb({ inspection: { customer_image_url: 'demo-fixture:iphone-16.jpg' }, photos: [{ id: 41, image_key: 'k', image_type: 'image/png' }] })
  await assert.rejects(() => getEvidenceImage(9, 'demo-photo', undefined, { db: withReal, resolve: s.resolve }), notFound)
  await assert.rejects(() => getEvidenceImage(9, 'demo-photo', undefined, { db: fakeDb({ inspection: {} }), resolve: s.resolve }), notFound)
  assert.equal(s.calls.length, 0)
})

test('getEvidenceImage(photo): an unknown photo id, no photos at all, and an unknown inspection are all 404', async () => {
  const s = spy()
  await assert.rejects(() => getEvidenceImage(9, 'photo', 999, { db: fakeDb({ inspection: {}, photos: [{ id: 41, image_key: 'k', image_type: 'image/png' }] }), resolve: s.resolve }), notFound)
  await assert.rejects(() => getEvidenceImage(9, 'photo', 41, { db: fakeDb({ inspection: {} }), resolve: s.resolve }), notFound)
  await assert.rejects(() => getEvidenceImage(9, 'photo', 41, { db: fakeDb({ inspection: null }), resolve: s.resolve }), notFound)
  assert.equal(s.calls.length, 0)
})

test('getEvidenceImage: a failure while loading the image (S3 error, blocked URL, bad bytes) is a plain 404, never a leak', async () => {
  const db = fakeDb({ inspection: { image_key: 'k', product_image_url: 'https://img.test/p.png' } })
  for (const err of [new AiError('IMAGE_UNAVAILABLE'), new AiError('UNSUPPORTED_IMAGE'), new SsrfError('Blocked address')]) {
    await assert.rejects(() => getEvidenceImage(9, 'reference', undefined, { db, resolve: spy(err).resolve }), notFound)
  }
})
