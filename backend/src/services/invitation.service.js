import pool from '../config/db.js'
import { conflict, notFound, validationError } from '../utils/http.js'
import { hashPassword } from '../utils/password.js'
import { expireStale, hashToken } from './admin.service.js'
import { validateRegistration } from './auth.service.js'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/
const STATE_MESSAGE = {
  ACCEPTED: 'This invitation has already been used. Log in instead.',
  CANCELLED: 'This invitation was cancelled. Ask an admin for a new one.',
  EXPIRED: 'This invitation has expired. Ask an admin to resend it.',
}

// A malformed or unknown token is simply "not found": the answer never says which.
function lookupHash(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw notFound('Invitation')
  return hashToken(token)
}

// What the public accept page may know: the invited email and role, and nothing else.
export async function getInvitationByToken(token) {
  const hash = lookupHash(token)
  await expireStale()
  const { rows } = await pool.query('SELECT email, role, status, expires_at FROM invitations WHERE token_hash = $1', [hash])
  const inv = rows[0]
  if (!inv) throw notFound('Invitation')
  if (inv.status !== 'PENDING') throw conflict(STATE_MESSAGE[inv.status])
  return { email: inv.email, role: inv.role, expiresAt: inv.expires_at }
}

// Creates the account. Email and role come from the invitation row; the request supplies only the
// person's name and password. One transaction: the user row and the ACCEPTED mark both happen, or
// neither does (and then the invitation stays usable). Resolves to the new user (no password hash).
export async function acceptInvitation(token, { name, password, confirmPassword }) {
  const hash = lookupHash(token)
  if (typeof confirmPassword === 'string' && confirmPassword !== password) {
    throw validationError('The passwords do not match.', { confirmPassword: 'The passwords do not match.' })
  }

  // Cheap checks first, so a bad token or bad input never costs a bcrypt hash.
  await expireStale()
  const peek = (await pool.query('SELECT email, status FROM invitations WHERE token_hash = $1', [hash])).rows[0]
  if (!peek) throw notFound('Invitation')
  if (peek.status !== 'PENDING') throw conflict(STATE_MESSAGE[peek.status])
  const clean = validateRegistration({ name, email: peek.email, password })
  const passwordHash = await hashPassword(clean.password)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // The lock makes two simultaneous submissions take turns; the second sees ACCEPTED.
    const inv = (await client.query('SELECT id, email, role, status, expires_at FROM invitations WHERE token_hash = $1 FOR UPDATE', [hash])).rows[0]
    if (!inv) throw notFound('Invitation')
    if (inv.status === 'PENDING' && new Date(inv.expires_at) <= new Date()) {
      await client.query(`UPDATE invitations SET status = 'EXPIRED' WHERE id = $1`, [inv.id])
      await client.query('COMMIT')
      throw conflict(STATE_MESSAGE.EXPIRED)
    }
    if (inv.status !== 'PENDING') throw conflict(STATE_MESSAGE[inv.status])
    if ((await client.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [inv.email])).rowCount > 0) {
      throw conflict('An account with this email already exists. Log in instead.')
    }
    const user = (await client.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at, updated_at`,
      [clean.name, inv.email, passwordHash, inv.role],
    )).rows[0]
    await client.query(`UPDATE invitations SET status = 'ACCEPTED', accepted_at = NOW() WHERE id = $1`, [inv.id])
    await client.query('COMMIT')
    return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.created_at, updatedAt: user.updated_at }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {}) // no-op after the COMMIT above
    if (err.code === '23505') throw conflict('An account with this email already exists. Log in instead.')
    throw err
  } finally {
    client.release()
  }
}
