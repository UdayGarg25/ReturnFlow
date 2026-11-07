// UNIT/SECURITY tests of the REAL src/utils/safeFetch.js. No internet, no cloud metadata endpoint and no internal
// service is contacted: blocked targets are refused before any connection, and "reachable" cases use servers on
// 127.0.0.1 that this file starts. DNS is replaced by an injected resolver. Run: node --test tests/safefetch-security.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { FetchError, isBlockedAddress, safeFetchImage, SsrfError } from '../src/utils/safeFetch.js'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)])

// A local server whose behaviour each test chooses. `hits` counts requests that actually reached it.
async function server(handler) {
  const state = { hits: 0 }
  const s = http.createServer((req, res) => { state.hits++; handler(req, res, state) })
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  state.port = s.address().port
  state.url = (p = '/') => `http://127.0.0.1:${state.port}${p}`
  state.close = () => { s.closeAllConnections?.(); return new Promise((r) => s.close(r)) }
  return state
}
const png = (req, res) => { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(PNG) }

// Test-only policy: the production rules, except that exactly 127.0.0.1 (our own test server) is reachable.
const allowOnlyTestLoopback = (a) => (a === '127.0.0.1' ? false : isBlockedAddress(a))
const resolveTo = (...addresses) => async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
const HTTP = { allowHttp: true } // the local test servers speak plain http; production code never sets this
const refuse = (p) => assert.rejects(p, (e) => e instanceof SsrfError)

// ------------------------------------------------------------------------------------------------ address policy
test('isBlockedAddress: private, loopback, link-local, metadata, multicast and reserved ranges are blocked', () => {
  const blocked = ['127.0.0.1', '127.255.255.254', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '240.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.1',
    '::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '::ffff:8.8.8.8', 'fe80::1', 'fe81::1', 'febf::1', 'fe80::1%eth0', 'fc00::1', 'fd12:3456::1', 'ff02::1', '64:ff9b::7f00:1', '2002:7f00:1::', '2001::1', '2001:db8::1', '[::1]', 'not-an-ip', '']
  for (const ip of blocked) assert.equal(isBlockedAddress(ip), true, `${ip} must be blocked`)
})

test('isBlockedAddress: ordinary public addresses are allowed (including 172.32.x, just outside 172.16/12)', () => {
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '172.15.255.255', '2606:4700::1111', '2a00:1450:4001::1']) assert.equal(isBlockedAddress(ip), false, `${ip} must be allowed`)
})

// ------------------------------------------------------------------------------------- literals in the URL are refused
test('literal blocked addresses in the URL are refused and the local server is never contacted', async () => {
  const s = await server(png)
  try {
    const targets = [s.url(), `http://[::ffff:127.0.0.1]:${s.port}/`, `http://[::ffff:7f00:1]:${s.port}/`, `http://[::1]:${s.port}/`, `http://[fe80::1]:${s.port}/`,
      `http://2130706433:${s.port}/`, `http://0x7f.0.0.1:${s.port}/`, `http://127.1:${s.port}/`, 'http://10.0.0.1/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::ffff:169.254.169.254]/', 'http://[fd00::1]/']
    for (const t of targets) await assert.rejects(() => safeFetchImage(t, HTTP), (e) => e instanceof SsrfError && /Blocked/.test(e.message), t) // refused by the ADDRESS rule, not the scheme
    for (const t of targets) await assert.rejects(() => safeFetchImage(t.replace('http:', 'https:')), (e) => e instanceof SsrfError, t)
    assert.equal(s.hits, 0, 'nothing may reach the server')
  } finally { await s.close() }
})

test('plain http is refused by default (https only), before any DNS lookup or connection', async () => {
  let lookups = 0
  const resolver = async () => { lookups++; return [{ address: '93.184.216.34', family: 4 }] }
  await assert.rejects(() => safeFetchImage('http://images.example.test/a.png', { resolver }), (e) => e instanceof SsrfError && /https/.test(e.message))
  assert.equal(lookups, 0)
})

test('other schemes, credentials and localhost names are refused', async () => {
  for (const t of ['file:///etc/passwd', 'ftp://example.com/a.png', 'javascript:alert(1)', 'gopher://example.com/', 'http://user:pw@example.com/a.png', 'http://localhost/a.png', 'http://app.localhost/a.png', 'http://localhost./a.png', 'not a url', '']) {
    await assert.rejects(() => safeFetchImage(t, { ...HTTP, resolver: resolveTo('93.184.216.34') }), (e) => e instanceof SsrfError, t)
  }
})

// ------------------------------------------------------------------------------------------------------------- DNS
test('a hostname that resolves to a blocked address is refused', async () => {
  const s = await server(png)
  try {
    for (const bad of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '::1', '::ffff:7f00:1', 'fe80::2']) {
      await refuse(safeFetchImage(`http://images.example.test:${s.port}/a.png`, { ...HTTP, resolver: resolveTo(bad) }))
    }
    assert.equal(s.hits, 0)
  } finally { await s.close() }
})

test('mixed DNS answers (public + blocked) are refused as a whole', async () => {
  const s = await server(png)
  try {
    await refuse(safeFetchImage(`http://images.example.test:${s.port}/a.png`, { ...HTTP, resolver: resolveTo('93.184.216.34', '127.0.0.1') }))
    await refuse(safeFetchImage(`http://images.example.test:${s.port}/a.png`, { ...HTTP, resolver: resolveTo('127.0.0.1', '93.184.216.34') }))
    await refuse(safeFetchImage(`http://images.example.test:${s.port}/a.png`, { ...HTTP, resolver: resolveTo('2606:4700::1111', '::ffff:7f00:1') }))
    assert.equal(s.hits, 0)
  } finally { await s.close() }
})

test('DNS rebinding: the name is resolved ONCE per hop and the socket uses only that validated answer', async () => {
  const s = await server(png)
  try {
    let calls = 0
    // first answer: the test loopback (allowed by the test policy). Any further lookup would answer a blocked address.
    const rebinding = async () => { calls++; return calls === 1 ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '10.0.0.1', family: 4 }] }
    const r = await safeFetchImage(`http://rebind.example.test:${s.port}/a.png`, { ...HTTP, resolver: rebinding, isBlocked: allowOnlyTestLoopback })
    assert.equal(r.contentType, 'image/png')
    assert.equal(calls, 1, 'a second, unchecked resolution would be a rebinding window')
    assert.equal(s.hits, 1)

    // and the opposite order: the first answer is blocked, so nothing is ever dialled
    let blockedCalls = 0
    const hostile = async () => { blockedCalls++; return blockedCalls === 1 ? [{ address: '10.0.0.1', family: 4 }] : [{ address: '127.0.0.1', family: 4 }] }
    await refuse(safeFetchImage(`http://rebind.example.test:${s.port}/a.png`, { ...HTTP, resolver: hostile, isBlocked: allowOnlyTestLoopback }))
    assert.equal(s.hits, 1, 'the second attempt must not have reached the server')
  } finally { await s.close() }
})

test('a name that does not resolve is a plain fetch error, not an SSRF verdict', async () => {
  await assert.rejects(() => safeFetchImage('http://nowhere.example.test/a.png', { ...HTTP, resolver: async () => { throw new Error('ENOTFOUND') } }), (e) => e instanceof FetchError && !(e instanceof SsrfError))
})

// ----------------------------------------------------------------------------------------------------- redirects
test('redirects: every target is validated (blocked IPs, mapped IPv6, bad schemes, hostnames resolving to private space)', async () => {
  for (const location of ['http://169.254.169.254/latest/meta-data/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/x', 'http://10.0.0.1/', 'file:///etc/passwd', 'http://user:pw@example.com/', 'http://localhost/']) {
    const s = await server((req, res) => { res.writeHead(302, { Location: location }); res.end() })
    try {
      await assert.rejects(() => safeFetchImage(s.url(), { ...HTTP, resolver: resolveTo('93.184.216.34'), isBlocked: allowOnlyTestLoopback }), (e) => e instanceof SsrfError, location)
      assert.equal(s.hits, 1, 'only the first hop is contacted')
    } finally { await s.close() }
  }
  // a redirect to a NAME that resolves to a private address
  const s = await server((req, res) => { res.writeHead(301, { Location: 'http://internal.example.test/a.png' }); res.end() })
  try {
    const resolver = async (host) => (host === 'internal.example.test' ? [{ address: '10.1.2.3', family: 4 }] : [{ address: '127.0.0.1', family: 4 }])
    await refuse(safeFetchImage(`http://start.example.test:${s.port}/`, { ...HTTP, resolver, isBlocked: allowOnlyTestLoopback }))
  } finally { await s.close() }
})

test('redirects: a valid redirect is followed; loops and long chains are stopped', async () => {
  const ok = await server((req, res) => (req.url === '/final' ? png(req, res) : (res.writeHead(302, { Location: '/final' }), res.end())))
  try {
    const r = await safeFetchImage(ok.url('/start'), { ...HTTP, isBlocked: allowOnlyTestLoopback })
    assert.equal(r.contentType, 'image/png')
  } finally { await ok.close() }

  const loop = await server((req, res) => { res.writeHead(302, { Location: '/loop' }); res.end() })
  try {
    await assert.rejects(() => safeFetchImage(loop.url('/loop'), { ...HTTP, isBlocked: allowOnlyTestLoopback }), (e) => e instanceof FetchError && /loop/i.test(e.message))
    assert.ok(loop.hits <= 2)
  } finally { await loop.close() }

  const chain = await server((req, res, st) => { res.writeHead(302, { Location: `/n${st.hits}` }); res.end() }) // never repeats a URL
  try {
    await assert.rejects(() => safeFetchImage(chain.url('/'), { ...HTTP, isBlocked: allowOnlyTestLoopback }), (e) => e instanceof FetchError && /redirects/i.test(e.message))
    assert.ok(chain.hits <= 4, `stopped after ${chain.hits} requests`)
  } finally { await chain.close() }
})

// ------------------------------------------------------------------------------------------------- time and size
test('a response that trickles forever hits the TOTAL deadline', async () => {
  const s = await server((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' })
    const t = setInterval(() => res.write(Buffer.alloc(8, 1)), 50) // keeps the idle timer happy
    res.on('close', () => clearInterval(t))
  })
  try {
    const started = Date.now()
    await assert.rejects(() => safeFetchImage(s.url(), { ...HTTP, isBlocked: allowOnlyTestLoopback, totalTimeoutMs: 400 }), (e) => e instanceof FetchError && /timed out/i.test(e.message))
    assert.ok(Date.now() - started < 3000, 'must stop near the deadline')
  } finally { await s.close() }
})

test('a server that never answers hits the deadline', async () => {
  const s = await server(() => {})
  try {
    await assert.rejects(() => safeFetchImage(s.url(), { ...HTTP, isBlocked: allowOnlyTestLoopback, totalTimeoutMs: 300 }), (e) => e instanceof FetchError && /timed out/i.test(e.message))
  } finally { await s.close() }
})

test('oversized responses are refused (declared length and streamed)', async () => {
  const declared = await server((req, res) => { res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': '999999' }); res.end(PNG) })
  const streamed = await server((req, res) => { res.writeHead(200, { 'Content-Type': 'image/png' }); res.write(PNG); res.end(Buffer.alloc(5000, 1)) }) // chunked, no Content-Length
  try {
    await assert.rejects(() => safeFetchImage(declared.url(), { ...HTTP, isBlocked: allowOnlyTestLoopback, maxBytes: 1000 }), (e) => e instanceof FetchError && /too large/i.test(e.message))
    await assert.rejects(() => safeFetchImage(streamed.url(), { ...HTTP, isBlocked: allowOnlyTestLoopback, maxBytes: 1000 }), (e) => e instanceof FetchError && /too large/i.test(e.message))
  } finally { await declared.close(); await streamed.close() }
})

// ------------------------------------------------------------------------------------------------------ content
test('content checks: wrong type, HTML posing as an image, non-200 and truncated bodies are refused; the bytes decide the type', async () => {
  const cases = [
    ['text/html', Buffer.from('<html>x</html>'), /content type/i],
    ['image/png', Buffer.from('<html>not a png</html>'), /recognised image/i],
    ['image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), /content type/i],
    ['image/png', Buffer.alloc(0), /recognised image/i],
  ]
  for (const [type, body, message] of cases) {
    const s = await server((req, res) => { res.writeHead(200, { 'Content-Type': type }); res.end(body) })
    try { await assert.rejects(() => safeFetchImage(s.url(), { ...HTTP, isBlocked: allowOnlyTestLoopback }), (e) => e instanceof FetchError && message.test(e.message), type) } finally { await s.close() }
  }
  const notFound = await server((req, res) => { res.writeHead(404); res.end() })
  const truncated = await server((req, res) => { res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': '500' }); res.write(PNG.subarray(0, 20)); res.destroy() })
  const lying = await server((req, res) => { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(JPG) })
  try {
    await assert.rejects(() => safeFetchImage(notFound.url(), { ...HTTP, isBlocked: allowOnlyTestLoopback }), (e) => e instanceof FetchError && /status/i.test(e.message))
    await assert.rejects(() => safeFetchImage(truncated.url(), { ...HTTP, isBlocked: allowOnlyTestLoopback }), (e) => e instanceof FetchError)
    assert.equal((await safeFetchImage(lying.url(), { ...HTTP, isBlocked: allowOnlyTestLoopback })).contentType, 'image/jpeg')
  } finally { await notFound.close(); await truncated.close(); await lying.close() }
})
