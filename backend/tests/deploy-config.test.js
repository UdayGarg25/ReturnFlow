// UNIT tests for the deployment-readiness fixes: database settings, the seed/reset guard, the Vercel SPA rewrite, response
// hardening and the pool error handler. No database or network is contacted.
import 'dotenv/config'
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPoolConfig } from '../src/config/dbConfig.js'
import { checkSetupSafety } from '../src/config/setupGuard.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL = 'postgresql://app:pw@db.example.supabase.co:5432/postgres'

test('local DB_* settings: no TLS, the same fields as before, pool defaults', () => {
  const c = buildPoolConfig({ DB_HOST: 'localhost', DB_PORT: '5432', DB_USER: 'postgres', DB_PASSWORD: 'x', DB_NAME: 'returnflow' })
  assert.deepEqual([c.host, c.port, c.user, c.database, c.ssl], ['localhost', '5432', 'postgres', 'returnflow', false])
  assert.deepEqual([c.max, c.idleTimeoutMillis, c.connectionTimeoutMillis], [10, 30_000, 10_000])
  assert.equal('statement_timeout' in c, false, 'statement_timeout is opt-in (poolers can reject it)')
  assert.equal('connectionString' in c, false)
})

test('DATABASE_URL: used instead of DB_*, TLS automatic for remote hosts (certificate not verified by default), sslmode stripped', () => {
  const c = buildPoolConfig({ DATABASE_URL: `${URL}?sslmode=require&application_name=returnflow`, DB_HOST: 'ignored', DB_USER: 'ignored' })
  assert.ok(c.connectionString.startsWith('postgresql://app:pw@db.example.supabase.co:5432/postgres'))
  assert.ok(!c.connectionString.includes('sslmode'), 'node-postgres would let sslmode override the ssl setting')
  assert.ok(c.connectionString.includes('application_name=returnflow'))
  assert.deepEqual(c.ssl, { rejectUnauthorized: false })
  assert.equal(c.host, undefined)
})

test('DATABASE_URL on localhost stays plain; DATABASE_SSL overrides in both directions', () => {
  assert.equal(buildPoolConfig({ DATABASE_URL: 'postgresql://u:p@localhost:5432/d' }).ssl, false)
  assert.equal(buildPoolConfig({ DATABASE_URL: 'postgresql://u:p@127.0.0.1/d' }).ssl, false)
  assert.equal(buildPoolConfig({ DATABASE_URL: URL, DATABASE_SSL: 'disable' }).ssl, false)
  assert.deepEqual(buildPoolConfig({ DATABASE_URL: 'postgresql://u:p@localhost/d', DATABASE_SSL: 'require' }).ssl, { rejectUnauthorized: false })
  assert.equal(buildPoolConfig({ DB_HOST: 'db.internal', DB_NAME: 'x', DATABASE_SSL: 'require' }).ssl.rejectUnauthorized, false)
})

test('DATABASE_SSL=verify verifies the certificate and accepts a CA (also with escaped newlines)', () => {
  const ca = '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----'
  assert.deepEqual(buildPoolConfig({ DATABASE_URL: URL, DATABASE_SSL: 'verify' }).ssl, { rejectUnauthorized: true })
  assert.deepEqual(buildPoolConfig({ DATABASE_URL: URL, DATABASE_SSL: 'verify', DATABASE_SSL_CA: ca }).ssl, { rejectUnauthorized: true, ca })
  assert.equal(buildPoolConfig({ DATABASE_URL: URL, DATABASE_SSL: 'verify', DATABASE_SSL_CA: ca.replaceAll('\n', '\\n') }).ssl.ca, ca)
})

test('pool tuning comes from the environment, and bad values fall back to safe defaults', () => {
  const c = buildPoolConfig({ DATABASE_URL: URL, DB_POOL_MAX: '4', DB_POOL_IDLE_MS: '5000', DB_POOL_CONNECT_TIMEOUT_MS: '2000', DB_STATEMENT_TIMEOUT_MS: '15000' })
  assert.deepEqual([c.max, c.idleTimeoutMillis, c.connectionTimeoutMillis, c.statement_timeout], [4, 5000, 2000, 15_000])
  const bad = buildPoolConfig({ DATABASE_URL: URL, DB_POOL_MAX: '-3', DB_POOL_IDLE_MS: 'abc', DB_POOL_CONNECT_TIMEOUT_MS: '0' })
  assert.deepEqual([bad.max, bad.idleTimeoutMillis, bad.connectionTimeoutMillis], [10, 30_000, 10_000])
})

test('invalid configuration fails loudly instead of connecting somewhere unintended', () => {
  assert.throws(() => buildPoolConfig({ DATABASE_URL: 'not a url' }), /DATABASE_URL is not a valid/)
  assert.throws(() => buildPoolConfig({ DATABASE_URL: URL, DATABASE_SSL: 'maybe' }), /DATABASE_SSL must be/)
})

// --------------------------------------------------------------------------------------------- seed / reset guard
test('setup guard: local development is unchanged; plain schema setup is always allowed', () => {
  for (const args of [[], ['--seed'], ['--reset', '--seed'], ['--demo-only']]) assert.equal(checkSetupSafety(args, { NODE_ENV: 'development', DB_HOST: 'localhost' }), null, args.join(' '))
  for (const env of [{ NODE_ENV: 'production' }, { DATABASE_URL: URL }]) assert.equal(checkSetupSafety([], env), null, 'schema.sql is idempotent')
})

test('setup guard: --reset, --seed and --demo-only are refused on production or a DATABASE_URL without explicit confirmation', () => {
  for (const env of [{ NODE_ENV: 'production' }, { DATABASE_URL: URL }, { NODE_ENV: 'production', DATABASE_URL: URL }]) {
    assert.match(checkSetupSafety(['--reset'], env), /CONFIRM_DROP_ALL_TABLES=yes/)
    assert.match(checkSetupSafety(['--seed'], env), /CONFIRM_SEED_DEMO_DATA=yes/)
    assert.match(checkSetupSafety(['--demo-only'], env), /CONFIRM_SEED_DEMO_DATA=yes/)
    assert.match(checkSetupSafety(['--reset', '--seed'], env), /CONFIRM_DROP_ALL_TABLES[\s\S]*CONFIRM_SEED_DEMO_DATA/, 'both confirmations are needed')
  }
  const msg = checkSetupSafety(['--seed'], { NODE_ENV: 'production' })
  assert.match(msg, /npm run db:schema/); assert.match(msg, /db:seed-admin/)
})

test('setup guard: explicit confirmations unlock exactly what they name', () => {
  const prod = { NODE_ENV: 'production' }
  assert.equal(checkSetupSafety(['--seed'], { ...prod, CONFIRM_SEED_DEMO_DATA: 'yes' }), null)
  assert.match(checkSetupSafety(['--reset', '--seed'], { ...prod, CONFIRM_SEED_DEMO_DATA: 'yes' }), /CONFIRM_DROP_ALL_TABLES/)
  assert.equal(checkSetupSafety(['--reset'], { ...prod, CONFIRM_DROP_ALL_TABLES: 'yes' }), null)
  for (const wrong of ['true', '1', 'YES', '']) assert.ok(checkSetupSafety(['--seed'], { ...prod, CONFIRM_SEED_DEMO_DATA: wrong }), `"${wrong}" is not a confirmation`)
})

test('the real setup script refuses before touching any database (exit 1, message, bogus DB host never contacted)', () => {
  const run = (args, env) => spawnSync('node', ['src/config/setup.js', ...args], { cwd: root, env: { ...process.env, DB_HOST: '203.0.113.1', DB_PORT: '1', DATABASE_URL: '', ...env }, encoding: 'utf8', timeout: 15_000 })
  for (const [args, env] of [[['--reset'], { NODE_ENV: 'production' }], [['--seed'], { NODE_ENV: 'production' }], [['--demo-only'], { NODE_ENV: '', DATABASE_URL: 'postgresql://u:p@203.0.113.1:1/d' }], [['--reset', '--seed'], { NODE_ENV: 'production' }]]) {
    const r = run(args, env)
    assert.equal(r.status, 1, args.join(' '))
    assert.match(r.stderr, /Refusing to run/)
    assert.doesNotMatch(r.stderr + r.stdout, /Applied|Dropped|ECONN|ETIMEDOUT|setup failed/, 'it must stop before any connection attempt')
  }
})

// -------------------------------------------------------------------------------------------- hosting config / app
test('Vercel: /api is proxied to the backend FIRST (same origin, so the SameSite=Lax cookie works), then every other path falls back to index.html', () => {
  const v = JSON.parse(readFileSync(path.join(root, '..', 'frontend', 'vercel.json'), 'utf8'))
  assert.deepEqual(v.rewrites, [
    { source: '/api/:path*', destination: 'https://returnflow-4ab7.onrender.com/api/:path*' }, // must precede the catch-all, or /api/... would get index.html
    { source: '/(.*)', destination: '/index.html' },
  ])
  const target = new globalThis.URL(v.rewrites[0].destination) // (this file has its own constant named URL)
  assert.equal(target.protocol, 'https:'); assert.equal(target.search, ''); assert.equal(target.username, ''); assert.equal(target.password, '')
  // only the API prefix is proxied: the backend's /health and every other path are not exposed through the frontend domain
  assert.equal(v.rewrites.filter((r) => /^https?:/.test(r.destination)).length, 1)
})

test('Vercel: proxied API responses are never cached at the CDN, and the global security headers are kept', () => {
  const v = JSON.parse(readFileSync(path.join(root, '..', 'frontend', 'vercel.json'), 'utf8'))
  const rule = (source) => v.headers.find((h) => h.source === source)?.headers ?? []
  assert.deepEqual(rule('/api/:path*'), [{ key: 'x-vercel-enable-rewrite-caching', value: '0' }])
  const global = Object.fromEntries(rule('/(.*)').map((h) => [h.key, h.value]))
  assert.equal(global['X-Content-Type-Options'], 'nosniff'); assert.equal(global['X-Frame-Options'], 'DENY'); assert.ok(global['Referrer-Policy'])
})

test('the frontend sends every API call under /api, which is the only prefix the Vercel proxy forwards', () => {
  const files = []
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); statSync(p).isDirectory() ? walk(p) : /\.(js|jsx)$/.test(p) && files.push(p) } }
  walk(path.join(root, '..', 'frontend', 'src'))
  const offenders = []
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(?:fetch\(|xhr\.open\([^,]+,\s*|request\()\s*[`'"]([^`'"]*)/g)) {
      const url = m[1]
      if (url.startsWith('${API_URL}')) { if (!url.slice('${API_URL}'.length).startsWith('/api/') && !url.slice('${API_URL}'.length).startsWith('${')) offenders.push(`${path.basename(f)}: ${url}`) }
      else if (url.startsWith('/') && !url.startsWith('/api/')) offenders.push(`${path.basename(f)}: ${url}`)
      else if (/^https?:/.test(url)) offenders.push(`${path.basename(f)}: ${url}`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('the backend declares the Node versions it needs', () => {
  assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).engines.node, '>=20')
})

test('responses carry nosniff and do not advertise Express', async () => {
  const { default: app } = await import('../src/app.js')
  const server = http.createServer(app)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/health`)
    assert.equal(res.headers.get('x-powered-by'), null)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  } finally { server.close() }
})

test('the pool has an error listener, so a dropped idle connection cannot crash the process', async () => {
  const { default: pool } = await import('../src/config/db.js')
  assert.ok(pool.listenerCount('error') >= 1)
  const lines = []
  const original = console.error
  console.error = (m) => lines.push(String(m))
  try { assert.doesNotThrow(() => pool.emit('error', Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }))) } finally { console.error = original }
  assert.match(lines[0], /pool error on an idle connection \(57P01\)/)
  assert.ok(!lines[0].includes('postgresql://'))
  await pool.end()
})
