// UNIT tests: demo-account recognition and the password-change rules. No database, no network.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEMO_ACCOUNT_EMAILS, isDemoAccountEmail } from '../src/config/demoAccounts.js'
import { DEMO_ACCOUNT_EMAILS as FROM_SETUP_GUARD } from '../src/config/setupGuard.js'
import { AUTH_ERRORS, validatePasswordChange, validateRegistration } from '../src/services/auth.service.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fields = (fn) => { try { fn(); return null } catch (e) { assert.equal(e.code, AUTH_ERRORS.VALIDATION); return e.details.fieldErrors } }
const OK = { currentPassword: 'Old-password-1', newPassword: 'New-password-2', confirmPassword: 'New-password-2' }

test('every seeded demo account is recognised, whatever the letter case or surrounding spaces', () => {
  assert.equal(DEMO_ACCOUNT_EMAILS.length, 9)
  for (const e of DEMO_ACCOUNT_EMAILS) {
    for (const variant of [e, e.toUpperCase(), ` ${e} `, e[0].toUpperCase() + e.slice(1)]) assert.equal(isDemoAccountEmail(variant), true, variant)
  }
})

test('other addresses, look-alikes and non-strings are not demo accounts', () => {
  for (const e of ['owner@my-real-domain.example', 'alice@returnflow.test.evil.example', 'xalice@returnflow.test', 'alice@returnflow.tes', 'alice+1@returnflow.test', '', ' ', null, undefined, 42, {}, ['alice@returnflow.test']]) {
    assert.equal(isDemoAccountEmail(e), false, JSON.stringify(e))
  }
})

test('the seed guard and the password rule share ONE list (no second copy that could drift)', () => {
  assert.equal(FROM_SETUP_GUARD, DEMO_ACCOUNT_EMAILS)
})

test('password change: a valid change passes and returns exactly the two values the service needs', () => {
  assert.deepEqual(validatePasswordChange(OK), { currentPassword: 'Old-password-1', newPassword: 'New-password-2' })
})

test('password change: every field is checked and all problems are reported together', () => {
  assert.deepEqual(fields(() => validatePasswordChange({})), { currentPassword: 'Enter your current password.', newPassword: 'Enter a new password.', confirmPassword: 'Confirm your new password.' })
  assert.deepEqual(fields(() => validatePasswordChange(undefined)), fields(() => validatePasswordChange({})))
  assert.deepEqual(fields(() => validatePasswordChange({ currentPassword: 5, newPassword: ['x'], confirmPassword: {} })), { currentPassword: 'Enter your current password.', newPassword: 'Enter a new password.', confirmPassword: 'Confirm your new password.' })
})

test('password change: new password length, same-as-current and confirmation rules', () => {
  assert.match(fields(() => validatePasswordChange({ ...OK, newPassword: 'short1', confirmPassword: 'short1' })).newPassword, /at least 8 characters/)
  const long = 'x'.repeat(73)
  assert.match(fields(() => validatePasswordChange({ ...OK, newPassword: long, confirmPassword: long })).newPassword, /at most 72 bytes/)
  const multibyte = 'é'.repeat(37) // 37 characters but 74 bytes: bcrypt would silently cut it
  assert.match(fields(() => validatePasswordChange({ ...OK, newPassword: multibyte, confirmPassword: multibyte })).newPassword, /at most 72 bytes/)
  assert.deepEqual(fields(() => validatePasswordChange({ currentPassword: 'Same-password-1', newPassword: 'Same-password-1', confirmPassword: 'Same-password-1' })), { newPassword: 'Choose a password different from your current one.' })
  assert.deepEqual(fields(() => validatePasswordChange({ ...OK, confirmPassword: 'New-password-3' })), { confirmPassword: 'The passwords do not match.' })
})

test('registration messages are exactly what they were before the shared length rule was introduced', () => {
  const pw = (password) => fields(() => validateRegistration({ name: 'Jane Doe', email: 'jane@example.org', password })).password
  assert.equal(pw(''), 'Enter a password.')
  assert.equal(pw(undefined), 'Enter a password.')
  assert.equal(pw('short'), 'Password must be at least 8 characters.')
  assert.equal(pw('x'.repeat(73)), 'Password must be at most 72 bytes.')
  assert.deepEqual(validateRegistration({ name: 'Jane Doe', email: 'Jane@Example.org', password: 'long-enough-1' }), { name: 'Jane Doe', email: 'jane@example.org', password: 'long-enough-1' })
})

test('the route is behind authentication and its own rate limiter, and the controller never reads a user id from the body', () => {
  const routes = readFileSync(path.join(root, 'src', 'routes', 'auth.routes.js'), 'utf8')
  assert.match(routes, /router\.post\('\/change-password', authenticate, changePasswordLimiter, authController\.changePassword\)/)
  const controller = readFileSync(path.join(root, 'src', 'controllers', 'auth.controller.js'), 'utf8')
  const handler = controller.slice(controller.indexOf('export async function changePassword'))
  assert.match(handler, /changePasswordService\(req\.user\.id,/)
  assert.doesNotMatch(handler, /req\.body\??\.(id|userId|email)/)
})
