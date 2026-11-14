import { randomUUID } from 'node:crypto'
import pool from '../config/db.js'
import { isDemoAccountEmail } from '../config/demoAccounts.js'
import { ServiceError } from '../utils/errors.js'
import { generateToken } from '../utils/jwt.js'
import { comparePassword, hashPassword } from '../utils/password.js'

// Error codes thrown by this service (a controller maps them to HTTP statuses):
//   VALIDATION_ERROR     -> 400   details.fieldErrors = { name?, email?, password? }
//   EMAIL_TAKEN          -> 409
//   INVALID_CREDENTIALS  -> 401   same error for "no such email" and "wrong password"
//   USER_NOT_FOUND       -> 404
//   DEMO_ACCOUNT         -> 403   a shared public demo account may not change its password
//   CONFLICT             -> 409   the password changed while this request was running
export const AUTH_ERRORS = Object.freeze({
  VALIDATION: 'VALIDATION_ERROR',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  DEMO_ACCOUNT: 'DEMO_ACCOUNT',
  CONFLICT: 'CONFLICT',
})

const PG_UNIQUE_VIOLATION = '23505'
const PG_MAX_INT = 2147483647 // users.id is a 4-byte INTEGER

// ------------------------------------------------------------------ helpers ----
const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '')

// Only these columns ever leave the service. password_hash is never among them.
const toSafeUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  // true for the shared public demo accounts (see config/demoAccounts.js); the UI uses it to explain why passwords are locked
  isDemoAccount: isDemoAccountEmail(row.email),
})

// The token carries only who the user is. Role and everything else is looked up
// from the database when a request arrives, so a role change takes effect at once.
const issueToken = (user) => generateToken({ userId: user.id })

// ----------------------------------------------------------------- validation ----
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const NAME_MAX = 100
const EMAIL_MAX = 254
const PASSWORD_MIN = 8
const PASSWORD_MAX_BYTES = 72 // bcrypt silently ignores everything after 72 bytes

// The one length rule for a NEW password (registration and password change). Returns a message, or null when it is fine.
const passwordLengthProblem = (password) => {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`
  return null
}

// Returns the cleaned values, or throws a VALIDATION_ERROR listing every bad field.
export function validateRegistration(input) {
  const { name, email, password } = input ?? {}
  const fieldErrors = {}

  const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
  if (typeof name !== 'string' || cleanName === '') fieldErrors.name = 'Enter your name.'
  else if (cleanName.length > NAME_MAX) fieldErrors.name = `Name must be ${NAME_MAX} characters or fewer.`
  else if (!/\p{L}/u.test(cleanName) || /\p{Cc}/u.test(cleanName)) fieldErrors.name = 'Enter a valid name.'

  const cleanEmail = normalizeEmail(email)
  if (typeof email !== 'string' || cleanEmail === '') fieldErrors.email = 'Enter your email address.'
  else if (cleanEmail.length > EMAIL_MAX || !EMAIL_PATTERN.test(cleanEmail)) fieldErrors.email = 'Enter a valid email address.'

  if (typeof password !== 'string' || password === '') fieldErrors.password = 'Enter a password.'
  else {
    const problem = passwordLengthProblem(password)
    if (problem) fieldErrors.password = problem
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ServiceError(AUTH_ERRORS.VALIDATION, 'Invalid registration details.', { fieldErrors })
  }
  return { name: cleanName, email: cleanEmail, password }
}

// ----------------------------------------------------------------- register ----
// Public registration. Accepts name, email and password ONLY: any other property
// (such as a "role") is never read, so the new account is always a CUSTOMER.
// Resolves to { user, token }.
export async function registerCustomer(input) {
  const { name, email, password } = validateRegistration(input)

  const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email])
  if (existing.rowCount > 0) throw emailTaken()

  const passwordHash = await hashPassword(password)

  let row
  try {
    // The role is a constant in the statement, never a parameter and never input.
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'CUSTOMER')
       RETURNING id, name, email, role, created_at, updated_at`,
      [name, email, passwordHash],
    )
    row = result.rows[0]
  } catch (err) {
    // Two sign-ups racing past the check above: the unique index on LOWER(email) decides.
    if (err.code === PG_UNIQUE_VIOLATION) throw emailTaken()
    throw err
  }

  const user = toSafeUser(row)
  return { user, token: issueToken(user) }
}

const emailTaken = () => new ServiceError(AUTH_ERRORS.EMAIL_TAKEN, 'An account with this email already exists.')

// -------------------------------------------------------------------- login ----
const invalidCredentials = () => new ServiceError(AUTH_ERRORS.INVALID_CREDENTIALS, 'Invalid email or password')

// Compared against when the email is unknown, so "no such user" costs as much
// time as "wrong password" and response timing cannot reveal which emails exist.
let dummyHash
const getDummyHash = () => (dummyHash ??= hashPassword(randomUUID()))

// Resolves to { user, token }. Unknown email and wrong password are the same error.
export async function login(email, password) {
  const cleanEmail = normalizeEmail(email)
  if (cleanEmail === '' || typeof password !== 'string' || password === '') throw invalidCredentials()

  // password_hash is selected only so it can be compared; it is dropped below.
  const result = await pool.query(
    `SELECT id, name, email, password_hash, role, created_at, updated_at
       FROM users
      WHERE LOWER(email) = $1`,
    [cleanEmail],
  )
  const row = result.rows[0]

  const matches = await comparePassword(password, row ? row.password_hash : await getDummyHash())
  if (!row || !matches) throw invalidCredentials()

  const user = toSafeUser(row)
  return { user, token: issueToken(user) }
}

// --------------------------------------------------------------- current user ----
// Safe profile for an authenticated user id (later: GET /api/auth/me).
export async function getCurrentUser(userId) {
  const id = typeof userId === 'number' || typeof userId === 'string' ? Number(userId) : NaN
  // An id that cannot exist is "not found"; it must not reach Postgres as a type error.
  if (!Number.isSafeInteger(id) || id <= 0 || id > PG_MAX_INT) throw userNotFound()

  const result = await pool.query(
    `SELECT id, name, email, role, created_at, updated_at
       FROM users
      WHERE id = $1`,
    [id],
  )
  if (result.rowCount === 0) throw userNotFound()
  return toSafeUser(result.rows[0])
}

const userNotFound = () => new ServiceError(AUTH_ERRORS.USER_NOT_FOUND, 'User not found.')

// ------------------------------------------------------------- change password ----
// Checks the three fields of a password change. Returns the values to use, or throws a VALIDATION_ERROR listing every bad field.
export function validatePasswordChange(input) {
  const { currentPassword, newPassword, confirmPassword } = input ?? {}
  const fieldErrors = {}

  if (typeof currentPassword !== 'string' || currentPassword === '') fieldErrors.currentPassword = 'Enter your current password.'

  if (typeof newPassword !== 'string' || newPassword === '') fieldErrors.newPassword = 'Enter a new password.'
  else {
    const problem = passwordLengthProblem(newPassword)
    if (problem) fieldErrors.newPassword = problem
    else if (typeof currentPassword === 'string' && newPassword === currentPassword) fieldErrors.newPassword = 'Choose a password different from your current one.'
  }

  if (typeof confirmPassword !== 'string' || confirmPassword === '') fieldErrors.confirmPassword = 'Confirm your new password.'
  else if (confirmPassword !== newPassword) fieldErrors.confirmPassword = 'The passwords do not match.'

  if (Object.keys(fieldErrors).length > 0) {
    throw new ServiceError(AUTH_ERRORS.VALIDATION, 'Invalid password change.', { fieldErrors })
  }
  return { currentPassword, newPassword }
}

// Changes the password of the logged-in user. Nothing about the session changes (the cookie stays valid; this app has no
// server-side session list, so other signed-in browsers stay signed in until their token expires).
export async function changePassword(userId, input) {
  const { rows } = await pool.query('SELECT id, email, password_hash FROM users WHERE id = $1', [userId])
  const row = rows[0]
  if (!row) throw userNotFound()

  // FIRST, before reading any input or touching the password hash: the shared public demo accounts can never be changed.
  if (isDemoAccountEmail(row.email)) {
    throw new ServiceError(AUTH_ERRORS.DEMO_ACCOUNT, 'Password changes are disabled for demo accounts.')
  }

  const { currentPassword, newPassword } = validatePasswordChange(input)

  if (!(await comparePassword(currentPassword, row.password_hash))) {
    throw new ServiceError(AUTH_ERRORS.VALIDATION, 'Invalid password change.', { fieldErrors: { currentPassword: 'Your current password is incorrect.' } })
  }

  const newHash = await hashPassword(newPassword)
  // Only if the password is still the one we just verified: two simultaneous changes cannot overwrite each other silently.
  const result = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2 AND password_hash = $3', [newHash, row.id, row.password_hash])
  if (result.rowCount === 0) throw new ServiceError(AUTH_ERRORS.CONFLICT, 'Your password was changed from somewhere else. Please try again.')
}
