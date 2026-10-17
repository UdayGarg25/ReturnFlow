import { createHash, randomBytes } from 'node:crypto'
import pool from '../config/db.js'
import { conflict, notFound, validationError } from '../utils/http.js'
import { isDevEmail, sendInvitationEmail } from './email.service.js'

export const INVITABLE_ROLES = Object.freeze(['SELLER', 'PICKUP_AGENT', 'WAREHOUSE'])
const TTL_DAYS = Number(process.env.INVITATION_TTL_DAYS) > 0 ? Number(process.env.INVITATION_TTL_DAYS) : 7
const MAX_EMAILS = 50
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const EMAIL_MAX = 254
const MESSAGE_MAX = 500

export const hashToken = (token) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url') // 256 bits, URL-safe
const expiryDate = () => new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000)

// Anything past its expiry becomes EXPIRED in the table itself, so the status is always the truth.
export const expireStale = () => pool.query(`UPDATE invitations SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at <= NOW()`)

// ------------------------------------------------------------------- reads ----
export async function getStats() {
  const { rows } = await pool.query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`)
  const by = Object.fromEntries(rows.map((r) => [r.role, r.count]))
  return {
    totalUsers: rows.reduce((s, r) => s + r.count, 0),
    sellers: by.SELLER ?? 0,
    pickupAgents: by.PICKUP_AGENT ?? 0,
    warehouseStaff: by.WAREHOUSE ?? 0,
  }
}

// password_hash is never selected.
export async function listUsers() {
  const { rows } = await pool.query(`SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC, id DESC`)
  return rows
}

const INVITATION_SELECT = `
  SELECT i.id, i.email, i.role, i.status, i.expires_at, i.accepted_at, i.created_at,
         inviter.name AS invited_by_name,
         CASE WHEN i.status = 'ACCEPTED' THEN u.id END AS user_id
    FROM invitations i
    JOIN users inviter ON inviter.id = i.invited_by
    LEFT JOIN users u ON LOWER(u.email) = i.email`

export async function listInvitations() {
  await expireStale()
  const { rows } = await pool.query(`${INVITATION_SELECT} ORDER BY i.created_at DESC, i.id DESC`)
  return rows
}

const getInvitation = async (id) => (await pool.query(`${INVITATION_SELECT} WHERE i.id = $1`, [id])).rows[0]

// ------------------------------------------------------------ input parsing ----
function parseEmails(input) {
  const raw = Array.isArray(input) ? input.join('\n') : typeof input === 'string' ? input : ''
  const tokens = raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
  const valid = [], invalid = [], duplicates = []
  const seen = new Set()
  for (const email of tokens) {
    if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) invalid.push(email.slice(0, 100))
    else if (seen.has(email)) duplicates.push(email)
    else { seen.add(email); valid.push(email) }
  }
  return { entered: tokens.length, valid, invalid, duplicates }
}

// ------------------------------------------------------------------- create ----
// For each email: one row, a fresh random token (only its hash is stored), one email. Emails that
// cannot be invited are reported back with the reason, never silently dropped.
export async function createInvitations(adminId, { role, emails, message }) {
  if (!INVITABLE_ROLES.includes(role)) throw validationError('Choose Seller, Pickup Agent or Warehouse.', { role: 'Choose a role to invite for.' })
  const note = typeof message === 'string' ? message.trim() : ''
  if (note.length > MESSAGE_MAX) throw validationError(`The message must be ${MESSAGE_MAX} characters or fewer.`, { message: `At most ${MESSAGE_MAX} characters.` })
  const parsed = parseEmails(emails)
  if (parsed.entered === 0) throw validationError('Enter at least one email address.', { emails: 'Enter at least one email address (one per line).' })
  if (parsed.entered > MAX_EMAILS) throw validationError(`Invite at most ${MAX_EMAILS} people at a time.`, { emails: `At most ${MAX_EMAILS} addresses at a time.` })

  const skipped = [
    ...parsed.invalid.map((email) => ({ email, reason: 'Not a valid email address.' })),
    ...parsed.duplicates.map((email) => ({ email, reason: 'Listed more than once.' })),
  ]
  const invitations = []
  await expireStale()
  for (const email of parsed.valid) {
    if ((await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [email])).rowCount > 0) {
      skipped.push({ email, reason: 'Already has an account.' })
      continue
    }
    const token = newToken()
    const expiresAt = expiryDate()
    let id
    try {
      id = (await pool.query(
        `INSERT INTO invitations (email, role, token_hash, invited_by, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [email, role, hashToken(token), adminId, expiresAt],
      )).rows[0].id
    } catch (err) {
      if (err.code === '23505') { skipped.push({ email, reason: 'Already has a pending invitation. Use Resend.' }); continue }
      throw err
    }
    invitations.push({ id, email, ...(await deliver({ to: email, role, token, expiresAt, message: note })) })
  }
  return {
    entered: parsed.entered,
    created: invitations.length,
    emailed: invitations.filter((i) => i.emailed).length,
    skipped,
    invitations,
    // development mail mode only: nothing is emailed, so the admin gets the links to hand over
    ...(isDevEmail && { devMode: true }),
  }
}

// Sends one invitation email. `emailed: true` means the provider (Resend) accepted the message for
// delivery, not that it reached an inbox. If sending fails the invitation row stays PENDING (the admin
// can use the Resend action to send a fresh link) and the result says plainly that no email went out.
// The provider's own error text is logged by the email service and never returned to the client.
async function deliver(message) {
  try {
    const result = await sendInvitationEmail(message)
    return { emailed: true, ...(isDevEmail && { devLink: result.link }) }
  } catch {
    return { emailed: false, emailError: 'The email could not be sent. Use the Resend action to try again.' }
  }
}

// ------------------------------------------------------------ resend/cancel ----
// A new token replaces the old one, so an earlier link stops working.
export async function resendInvitation(id) {
  await expireStale()
  const client = await pool.connect()
  let cur, token, expiresAt
  try {
    await client.query('BEGIN')
    cur = (await client.query(`SELECT id, email, role, status FROM invitations WHERE id = $1 FOR UPDATE`, [id])).rows[0]
    if (!cur) throw notFound('Invitation')
    if (!['PENDING', 'EXPIRED'].includes(cur.status)) throw conflict(`This invitation was ${cur.status.toLowerCase()} and cannot be resent.`)
    if ((await client.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [cur.email])).rowCount > 0) throw conflict('This email already has an account.')
    if (cur.status === 'EXPIRED' && (await client.query(`SELECT 1 FROM invitations WHERE email = $1 AND status = 'PENDING'`, [cur.email])).rowCount > 0) throw conflict('This email already has a pending invitation.')
    token = newToken()
    expiresAt = expiryDate()
    await client.query(`UPDATE invitations SET token_hash = $1, status = 'PENDING', expires_at = $2 WHERE id = $3`, [hashToken(token), expiresAt, id])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  const sent = await deliver({ to: cur.email, role: cur.role, token, expiresAt })
  return { invitation: await getInvitation(id), ...sent }
}

export async function cancelInvitation(id) {
  await expireStale()
  const { rows } = await pool.query(`UPDATE invitations SET status = 'CANCELLED' WHERE id = $1 AND status = 'PENDING' RETURNING id`, [id])
  if (rows.length === 0) {
    const cur = (await pool.query('SELECT status FROM invitations WHERE id = $1', [id])).rows[0]
    if (!cur) throw notFound('Invitation')
    throw conflict(`Only pending invitations can be cancelled (this one is ${cur.status.toLowerCase()}).`)
  }
  return { invitation: await getInvitation(id) }
}
