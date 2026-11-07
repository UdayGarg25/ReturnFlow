// INTEGRATION test of the real db scripts against a THROWAWAY database that this test creates and drops
// (returnflow_guard_tmp_<time>). No other database is ever targeted: every script run gets DB_NAME overridden, and the first
// run asserts that the script itself reports the scratch name as its target. Needs a PostgreSQL user that may CREATE DATABASE.
//   node --test --test-timeout=240000 tests/db-safeguards.integration.test.js
import 'dotenv/config'
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP = `returnflow_guard_tmp_${Date.now()}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const conn = (database) => ({ user: process.env.DB_USER, host: process.env.DB_HOST, password: process.env.DB_PASSWORD, port: Number(process.env.DB_PORT), database })

const run = (script, args = [], env = {}) => {
  const r = spawnSync('node', [script, ...args], { cwd: root, encoding: 'utf8', timeout: 90_000, env: { ...process.env, DB_NAME: TMP, DATABASE_URL: '', NODE_ENV: '', DEMO_ENABLED: '', CONFIRM_DROP_ALL_TABLES: '', CONFIRM_SEED_DEMO_DATA: '', ADMIN_EMAIL: '', ADMIN_PASSWORD: '', ...env } })
  return { status: r.status, out: r.stdout + r.stderr }
}
const setup = (args, env) => run('src/config/setup.js', args, env)

let admin, db
test.before(async () => {
  admin = new pg.Client(conn('postgres')); await admin.connect()
  await admin.query(`CREATE DATABASE ${TMP}`)
  db = new pg.Client(conn(TMP)); await db.connect()
})
test.after(async () => {
  await db?.end().catch(() => {})
  await admin.query(`DROP DATABASE IF EXISTS ${TMP} WITH (FORCE)`)
  await admin.end()
})
const q = async (sql, params) => (await db.query(sql, params)).rows
const users = async () => (await q('SELECT email FROM users ORDER BY id')).map((r) => r.email)

test('a fresh database: schema, then demo seed, run without any confirmation (local development is unchanged)', async () => {
  const schema = setup([])
  assert.equal(schema.status, 0, schema.out)
  const seed = setup(['--seed'])
  assert.equal(seed.status, 0, seed.out)
  assert.ok(seed.out.includes(`Target database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${TMP}`), 'the script names the scratch database as its target')
  assert.equal((await users()).length, 9)
})

test('with a non-demo account present, --reset and --seed are refused (database untouched); --demo-only still works', async () => {
  await q(`INSERT INTO users (name, email, password_hash, role) VALUES ('Real Person', 'real.person@my-real-domain.example', 'x', 'CUSTOMER')`)
  const before = await users()

  for (const args of [['--reset'], ['--reset', '--seed'], ['--seed']]) {
    const r = setup(args)
    assert.equal(r.status, 1, args.join(' '))
    assert.match(r.out, new RegExp(`Refusing to run on .*${TMP}`)); assert.match(r.out, /1 account\(s\) that are not the seeded demo accounts/); assert.match(r.out, /Nothing was changed/)
    assert.deepEqual(await users(), before, 'no account was touched')
  }
  assert.equal((await q(`SELECT to_regclass('public.orders') AS t`))[0].t, 'orders', 'tables still exist')

  const demoOnly = setup(['--demo-only'])
  assert.equal(demoOnly.status, 0, demoOnly.out)
  assert.doesNotMatch(demoOnly.out, /Refusing/)
  assert.ok((await users()).includes('real.person@my-real-domain.example'), 'the real account survived the demo reseed')
})

test('explicit confirmation lets each destructive flag through, and only the flag it names', async () => {
  const half = setup(['--reset', '--seed'], { CONFIRM_DROP_ALL_TABLES: 'yes' })
  assert.equal(half.status, 1); assert.match(half.out, /CONFIRM_SEED_DEMO_DATA/)
  assert.ok((await users()).includes('real.person@my-real-domain.example'), 'still untouched')

  const full = setup(['--reset', '--seed'], { CONFIRM_DROP_ALL_TABLES: 'yes', CONFIRM_SEED_DEMO_DATA: 'yes' })
  assert.equal(full.status, 0, full.out)
  assert.deepEqual((await users()).filter((e) => !e.endsWith('@returnflow.test')), [], 'the reset removed the real account, as confirmed')
  assert.equal((await users()).length, 9)
})

test('a database holding only demo accounts can be reset and reseeded without confirmation', async () => {
  const r = setup(['--reset', '--seed'])
  assert.equal(r.status, 0, r.out)
  assert.equal((await users()).length, 9)
})

test('db:seed-admin on a DATABASE_URL: refuses the demo identity, accepts the owner identity once, never overwrites, never prints the password', async () => {
  const url = `postgresql://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT}/${TMP}`
  const OWNER = { DATABASE_URL: url, ADMIN_EMAIL: 'owner@my-real-domain.example', ADMIN_PASSWORD: 'a-long-private-passphrase-42', ADMIN_NAME: 'Owner' }

  const demoIdentity = run('src/config/seedAdmin.js', [], { DATABASE_URL: url, ADMIN_EMAIL: 'admin@returnflow.test', ADMIN_PASSWORD: 'Password123!' })
  assert.equal(demoIdentity.status, 1); assert.match(demoIdentity.out, /Refusing to create the admin/)
  const defaults = run('src/config/seedAdmin.js', [], { DATABASE_URL: url })
  assert.equal(defaults.status, 1); assert.match(defaults.out, /ADMIN_EMAIL is not set[\s\S]*ADMIN_PASSWORD is not set/)
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'ADMIN'`))[0].n, 1, 'still only the demo admin')

  const created = run('src/config/seedAdmin.js', [], OWNER)
  assert.equal(created.status, 0, created.out); assert.match(created.out, /Created admin owner@my-real-domain.example/)
  assert.ok(!created.out.includes(OWNER.ADMIN_PASSWORD))
  const owner = (await q(`SELECT role, password_hash FROM users WHERE email = 'owner@my-real-domain.example'`))[0]
  assert.equal(owner.role, 'ADMIN')
  assert.equal(await bcrypt.compare(OWNER.ADMIN_PASSWORD, owner.password_hash), true, 'the chosen password works')
  assert.equal(await bcrypt.compare('Password123!', owner.password_hash), false, 'and the public demo password does not')

  const again = run('src/config/seedAdmin.js', [], { ...OWNER, ADMIN_PASSWORD: 'a-different-long-passphrase-43' })
  assert.equal(again.status, 0); assert.match(again.out, /already exists[\s\S]*nothing changed/i)
  assert.equal(await bcrypt.compare(OWNER.ADMIN_PASSWORD, (await q(`SELECT password_hash FROM users WHERE email = 'owner@my-real-domain.example'`))[0].password_hash), true, 'an existing account is never modified')
  const demoAdmin = (await q(`SELECT password_hash FROM users WHERE email = 'admin@returnflow.test'`))[0]
  assert.equal(await bcrypt.compare('Password123!', demoAdmin.password_hash), true, 'the public demo admin is untouched and keeps its documented login')
})

test('the server says which database it uses (no credentials) and warns when demo mode in production runs on a local database', async () => {
  const child = spawn('node', ['src/server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DB_NAME: TMP, DATABASE_URL: '', PORT: '5074', NODE_ENV: 'production', DEMO_ENABLED: 'true', REDIS_URL: '', CORS_ORIGIN: 'https://app.example.test' } })
  let log = ''
  child.stdout.on('data', (d) => (log += d)); child.stderr.on('data', (d) => (log += d))
  try {
    for (let i = 0; i < 100 && !log.includes('Server running'); i++) await sleep(100)
    assert.ok(log.includes('Server running'), log.slice(-300))
    assert.ok(log.includes(`Database target: ${process.env.DB_HOST}:${process.env.DB_PORT}/${TMP}`))
    assert.match(log, /DEMO_ENABLED=true in production but the database is on this machine/)
    assert.ok(!log.includes(process.env.DB_PASSWORD), 'the password never appears in the log')
  } finally {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    await sleep(500)
  }
})
