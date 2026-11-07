// UNIT tests: bundled demo image fixtures, the seller image-URL check, and the seed file. No network, no database.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIXTURE_DIR, isDemoFixtureRef, readDemoFixture } from '../src/utils/demoFixtures.js'
import { sellerImageUrlProblem } from '../src/utils/imageUrl.js'
import { AiError, resolveImage } from '../src/services/aiInspection.service.js'
import { validateProduct } from '../src/services/seller.service.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('every bundled fixture is a real image and loads through the strict reader', async () => {
  const files = (await readdir(FIXTURE_DIR)).filter((f) => /\.(jpg|png|webp)$/.test(f))
  assert.ok(files.length >= 7)
  for (const f of files) {
    const bytes = await readDemoFixture(`demo-fixture:${f}`)
    assert.ok(bytes && bytes.length > 1000, f)
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8
    const png = bytes.subarray(1, 4).toString() === 'PNG'
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF'
    assert.ok(jpeg || png || webp, `${f} has an image signature`)
  }
})

test('fixture references are file names only: traversal, absolute paths, odd names and unknown files give null', async () => {
  const bad = ['demo-fixture:../src/app.js', 'demo-fixture:..\\.env', 'demo-fixture:/etc/passwd', 'demo-fixture:C:\\x.jpg', 'demo-fixture:a/b.jpg', 'demo-fixture:iphone-16.jpg\u0000.png',
    'demo-fixture:.env', 'demo-fixture:', 'demo-fixture:IPHONE-16.JPG', 'demo-fixture:iphone-16.svg', 'demo-fixture:missing-file.jpg', 'https://example.com/a.jpg', null, undefined, 42]
  for (const b of bad) assert.equal(await readDemoFixture(b), null, String(b))
  assert.equal(isDemoFixtureRef('demo-fixture:x.jpg'), true)
  assert.equal(isDemoFixtureRef('https://x'), false)
})

test('resolveImage serves a demo fixture from disk without any network fetch, and reports a missing one as unavailable', async () => {
  let fetches = 0
  const fetchImage = async () => { fetches++; throw new Error('must not be called') }
  const r = await resolveImage(null, 'demo-fixture:iphone-16.jpg', { fetchImage })
  assert.equal(r.type, 'image/jpeg')
  assert.ok(r.bytes.length > 1000)
  assert.equal(fetches, 0)
  await assert.rejects(() => resolveImage(null, 'demo-fixture:nope.jpg', { fetchImage }), (e) => e instanceof AiError && e.code === 'IMAGE_UNAVAILABLE')
  await assert.rejects(() => resolveImage(null, 'demo-fixture:../../.env', { fetchImage }), (e) => e instanceof AiError && e.code === 'IMAGE_UNAVAILABLE')
  assert.equal(fetches, 0)
})

test('seller image URLs: public https domain names only', () => {
  for (const ok of ['https://cdn.example.org/a.jpg', 'https://images.shop.co.in/p/1.png?x=1', 'https://a.b.c.example.com:8443/x.webp']) assert.equal(sellerImageUrlProblem(ok), null, ok)
  const bad = ['http://cdn.example.org/a.jpg', 'ftp://cdn.example.org/a.jpg', 'file:///etc/passwd', 'javascript:alert(1)', 'demo-fixture:iphone-16.jpg', 'data:image/png;base64,AAAA',
    'https://user:pw@cdn.example.org/a.jpg', 'https://127.0.0.1/a.jpg', 'https://[::1]/a.jpg', 'https://[::ffff:7f00:1]/a.jpg', 'https://169.254.169.254/latest', 'https://10.0.0.5/a.jpg', 'https://8.8.8.8/a.jpg',
    'https://localhost/a.jpg', 'https://app.localhost/a.jpg', 'https://intranet/a.jpg', 'https://printer.local/a.jpg', 'https://db.internal/a.jpg', 'https://metadata.google.internal/x', 'not a url',
    `https://${'a'.repeat(500)}.com/x.jpg`, 42, {}]
  for (const b of bad) assert.ok(sellerImageUrlProblem(b), `must reject ${String(b).slice(0, 40)}`)
})

test('validateProduct (used by create and update) applies the https-only rule and still accepts "no image"', () => {
  const base = { name: 'Widget', price: '10.50', description: 'x' }
  assert.equal(validateProduct({ ...base, imageUrl: 'https://cdn.example.org/a.jpg' }).imageUrl, 'https://cdn.example.org/a.jpg')
  for (const none of [undefined, null, '']) assert.equal(validateProduct({ ...base, imageUrl: none }).imageUrl, null)
  for (const bad of ['http://cdn.example.org/a.jpg', 'https://127.0.0.1/a.jpg', 'https://169.254.169.254/x', 'demo-fixture:iphone-16.jpg']) {
    assert.throws(() => validateProduct({ ...base, imageUrl: bad }), (e) => e.code === 'VALIDATION_ERROR' && Boolean(e.details?.fieldErrors?.imageUrl), bad)
  }
})

test('the demo seed no longer points at example.com and only references fixtures that exist', async () => {
  const seed = await readFile(path.join(here, '..', 'src', 'config', 'seed-demo.sql'), 'utf8')
  assert.ok(!/example\.com/i.test(seed), 'seed-demo.sql must not contain example.com image URLs')
  const refs = [...seed.matchAll(/demo-fixture:([a-z0-9.-]+)/g)].map((m) => m[1])
  assert.ok(refs.length >= 7)
  for (const f of new Set(refs)) assert.ok(await readDemoFixture(`demo-fixture:${f}`), `${f} is referenced by the seed but missing`)
})
