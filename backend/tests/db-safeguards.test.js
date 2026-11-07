// UNIT tests: the db:seed-admin hardening, the data-aware seed/reset guard and the database-target description.
// The subprocess cases run the REAL scripts against a bogus, unreachable database host; a refusal must happen before any connection.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkAdminSeedSafety, DEMO_ADMIN_EMAIL, PUBLIC_DEMO_PASSWORD } from '../src/config/adminSeedGuard.js'
import { describeDatabaseTarget, isLocalDatabase } from '../src/config/dbConfig.js'
import { checkSetupDataSafety, DEMO_ACCOUNT_EMAILS } from '../src/config/setupGuard.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const GOOD = { NODE_ENV: 'production', ADMIN_EMAIL: 'owner@my-real-domain.example', ADMIN_PASSWORD: 'correct-horse-battery-staple' }

// ---------------------------------------------------------------------------------------------- db:seed-admin
test('seed-admin: local development keeps the demo defaults (no production, no DATABASE_URL)', () => {
  assert.deepEqual(checkAdminSeedSafety({}), [])
  assert.deepEqual(checkAdminSeedSafety({ NODE_ENV: 'development', DB_HOST: 'localhost' }), [])
})

test('seed-admin: on production or a DATABASE_URL the public demo email and the public demo password are refused', () => {
  for (const base of [{ NODE_ENV: 'production' }, { DATABASE_URL: 'postgresql://u:p@db.example.org/x' }]) {
    const p = checkAdminSeedSafety({ ...base, ADMIN_EMAIL: DEMO_ADMIN_EMAIL, ADMIN_PASSWORD: PUBLIC_DEMO_PASSWORD })
    assert.ok(p.some((m) => /ADMIN_EMAIL is the public demo admin/.test(m)))
    assert.ok(p.some((m) => /ADMIN_PASSWORD is the public demo password/.test(m)))
  }
  assert.ok(checkAdminSeedSafety({ ...GOOD, ADMIN_EMAIL: 'other.person@returnflow.test' }).some((m) => /demo admin/.test(m)), 'any @returnflow.test address')
  assert.ok(checkAdminSeedSafety({ ...GOOD, ADMIN_EMAIL: ' Admin@ReturnFlow.Test ' }).length > 0, 'case and spaces do not help')
  assert.ok(checkAdminSeedSafety({ ...GOOD, ADMIN_PASSWORD: 'PASSWORD123!' }).some((m) => /public demo password/.test(m)), 'the demo password in any letter case')
})

test('seed-admin: missing values are refused (the defaults would be the demo identity), as are weak or email-derived passwords', () => {
  assert.equal(checkAdminSeedSafety({ NODE_ENV: 'production' }).length, 2, 'both ADMIN_EMAIL and ADMIN_PASSWORD are required')
  assert.ok(checkAdminSeedSafety({ ...GOOD, ADMIN_EMAIL: '' }).some((m) => /ADMIN_EMAIL is not set/.test(m)))
  assert.ok(checkAdminSeedSafety({ ...GOOD, ADMIN_PASSWORD: '' }).some((m) => /ADMIN_PASSWORD is not set/.test(m)))
  assert.ok(checkAdminSeedSafety({ ...GOOD, ADMIN_PASSWORD: 'short1!' }).some((m) => /at least 12/.test(m)))
  assert.ok(checkAdminSeedSafety({ ...GOOD, ADMIN_PASSWORD: 'xx-owner-xx-1234567' }).some((m) => /email name/.test(m)))
  assert.ok(checkAdminSeedSafety({ ...GOOD, ADMIN_EMAIL: 'not-an-email' }).some((m) => /valid email/.test(m)))
})

test('seed-admin: your own address and a strong password pass, on production and on a DATABASE_URL', () => {
  assert.deepEqual(checkAdminSeedSafety(GOOD), [])
  assert.deepEqual(checkAdminSeedSafety({ DATABASE_URL: 'postgresql://u:p@db.example.org/x', ADMIN_EMAIL: GOOD.ADMIN_EMAIL, ADMIN_PASSWORD: GOOD.ADMIN_PASSWORD }), [])
})

test('the real db:seed-admin script refuses the demo identity and weak input before any connection, and never prints a password', () => {
  const run = (env) => spawnSync('node', ['src/config/seedAdmin.js'], { cwd: root, env: { ...process.env, DB_HOST: '203.0.113.1', DB_PORT: '1', DATABASE_URL: '', ADMIN_EMAIL: '', ADMIN_PASSWORD: '', DB_POOL_CONNECT_TIMEOUT_MS: '1500', ...env }, encoding: 'utf8', timeout: 20_000 })
  for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', ADMIN_EMAIL: DEMO_ADMIN_EMAIL, ADMIN_PASSWORD: PUBLIC_DEMO_PASSWORD }, { DATABASE_URL: 'postgresql://u:p@203.0.113.1:1/d' }]) {
    const r = run(env)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /Refusing to create the admin/); assert.match(r.stderr, /Nothing was changed/)
    assert.doesNotMatch(r.stderr + r.stdout, /ECONN|ETIMEDOUT|Admin seed failed|Created admin/, 'refused before connecting')
  }
  const weak = run({ NODE_ENV: 'production', ADMIN_EMAIL: 'me@my-real-domain.example', ADMIN_PASSWORD: 'Hunter2!' })
  assert.equal(weak.status, 1); assert.ok(!(weak.stderr + weak.stdout).includes('Hunter2!'), 'the password value is never printed')
  // valid input passes the guard; it then fails only because the bogus database is unreachable (so nothing could be created)
  const ok = run({ ...GOOD })
  assert.equal(ok.status, 1); assert.doesNotMatch(ok.stderr, /Refusing to create/); assert.match(ok.stderr + ok.stdout, /Admin seed failed/)
  assert.ok(!(ok.stderr + ok.stdout).includes(GOOD.ADMIN_PASSWORD))
})

// ----------------------------------------------------------------------------------------- setup data-aware guard
test('setup data guard: demo-only databases and empty databases are never blocked', () => {
  for (const args of [['--reset'], ['--seed'], ['--reset', '--seed'], ['--demo-only']]) assert.equal(checkSetupDataSafety(args, {}, 0, 'x'), null)
})

test('setup data guard: with accounts that are not demo accounts, --reset and --seed need explicit confirmation, even on a local database', () => {
  const t = 'localhost:5432/returnflow'
  assert.match(checkSetupDataSafety(['--reset'], {}, 2, t), /localhost:5432\/returnflow[\s\S]*2 account\(s\)[\s\S]*CONFIRM_DROP_ALL_TABLES=yes/)
  assert.match(checkSetupDataSafety(['--seed'], {}, 1, t), /CONFIRM_SEED_DEMO_DATA=yes/)
  assert.match(checkSetupDataSafety(['--reset', '--seed'], {}, 1, t), /CONFIRM_DROP_ALL_TABLES[\s\S]*CONFIRM_SEED_DEMO_DATA/)
  assert.equal(checkSetupDataSafety(['--reset'], { CONFIRM_DROP_ALL_TABLES: 'yes' }, 2, t), null)
  assert.match(checkSetupDataSafety(['--reset', '--seed'], { CONFIRM_DROP_ALL_TABLES: 'yes' }, 2, t), /CONFIRM_SEED_DEMO_DATA/, 'each flag needs its own confirmation')
  for (const wrong of ['true', '1', 'YES']) assert.ok(checkSetupDataSafety(['--reset'], { CONFIRM_DROP_ALL_TABLES: wrong }, 2, t), `"${wrong}" is not a confirmation`)
})

test('setup data guard: --demo-only is deliberately not blocked (it keeps real accounts and its SQL refuses on its own)', () => {
  assert.equal(checkSetupDataSafety(['--demo-only'], {}, 5, 'x'), null)
})

test('the list of demo accounts matches the seed files exactly', async () => {
  const { readFile } = await import('node:fs/promises')
  const seed = (await readFile(path.join(root, 'src', 'config', 'seed.sql'), 'utf8')) + (await readFile(path.join(root, 'src', 'config', 'seed-demo.sql'), 'utf8'))
  const emails = [...new Set([...seed.matchAll(/[a-z]+@returnflow\.test/g)].map((m) => m[0]))].sort()
  assert.deepEqual([...DEMO_ACCOUNT_EMAILS].sort(), emails)
})

// ------------------------------------------------------------------------------------------ database target text
test('describeDatabaseTarget names host, port and database, and never a user name or password', () => {
  assert.equal(describeDatabaseTarget({ DATABASE_URL: 'postgresql://app:s3cr3t@db.abcd.supabase.co:6543/postgres?sslmode=require' }), 'db.abcd.supabase.co:6543/postgres')
  assert.equal(describeDatabaseTarget({ DATABASE_URL: 'postgresql://app:s3cr3t@db.example.org/mydb' }), 'db.example.org:5432/mydb')
  assert.equal(describeDatabaseTarget({ DB_HOST: 'localhost', DB_PORT: '5432', DB_NAME: 'returnflow', DB_PASSWORD: 'pw', DB_USER: 'postgres' }), 'localhost:5432/returnflow')
  assert.equal(describeDatabaseTarget({}), '(unknown)')
  assert.equal(describeDatabaseTarget({ DATABASE_URL: 'not a url' }), '(unknown)')
  for (const env of [{ DATABASE_URL: 'postgresql://app:s3cr3t@db.example.org/mydb' }, { DB_HOST: 'h', DB_NAME: 'n', DB_PASSWORD: 's3cr3t', DB_USER: 'app' }]) {
    const t = describeDatabaseTarget(env); assert.ok(!t.includes('s3cr3t') && !t.includes('app@') && !t.startsWith('app'))
  }
})

test('isLocalDatabase', () => {
  for (const env of [{ DB_HOST: 'localhost' }, { DB_HOST: '127.0.0.1' }, { DATABASE_URL: 'postgresql://u:p@localhost:5432/d' }, {}]) assert.equal(isLocalDatabase(env), true, JSON.stringify(env))
  for (const env of [{ DB_HOST: 'db.example.org' }, { DATABASE_URL: 'postgresql://u:p@db.supabase.co/d' }, { DATABASE_URL: 'garbage' }]) assert.equal(isLocalDatabase(env), false, JSON.stringify(env))
})

// ----------------------------------------------------------------------------------- reset covers the whole schema
test('db:reset drops EVERY table that schema.sql creates (a stale list once made the reset fail after the photo and AI tables were added)', async () => {
  const { readFile } = await import('node:fs/promises')
  const schema = await readFile(path.join(root, 'src', 'config', 'schema.sql'), 'utf8')
  const setup = await readFile(path.join(root, 'src', 'config', 'setup.js'), 'utf8')
  const created = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]).sort()
  const dropped = setup.match(/DROP TABLE IF EXISTS([\s\S]*?)CASCADE/)[1].split(',').map((t) => t.trim()).filter(Boolean).sort()
  assert.ok(created.length >= 11)
  assert.deepEqual(dropped, created)
})
