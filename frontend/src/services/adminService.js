// Admin data, from the real API (/api/admin/*). Every call carries the session cookie; the
// backend authenticates, requires the ADMIN role and decides everything (who invites, the
// expiry, the token). No mock fallback: a failed call throws an ApiError for the screen to show.
import { request } from './authApi.js'

export const INVITE_ROLES = [
  { value: 'PICKUP_AGENT', label: 'Pickup Agent' },
  { value: 'SELLER', label: 'Seller' },
  { value: 'WAREHOUSE', label: 'Warehouse' },
]

const mapUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, joinedAt: u.created_at })

const mapInvitation = (i) => ({
  id: i.id,
  email: i.email,
  role: i.role,
  status: i.status,
  invitedAt: i.created_at,
  expiresAt: i.expires_at,
  acceptedAt: i.accepted_at,
  invitedByName: i.invited_by_name,
  userId: i.user_id, // set once accepted
})

export async function getAdminStats({ signal } = {}) {
  const { stats } = await request('/api/admin/stats', { signal })
  return stats
}

export async function getAdminUsers({ signal } = {}) {
  const { users } = await request('/api/admin/users', { signal })
  return users.map(mapUser)
}

export async function getAdminInvitations({ signal } = {}) {
  const { invitations } = await request('/api/admin/invitations', { signal })
  return invitations.map(mapInvitation)
}

// The admin sends the role, the addresses (one per line) and an optional note. Who is inviting
// is the logged-in admin; the backend creates the tokens and the emails.
export async function sendInvitations({ role, emails, message }) {
  const res = await request('/api/admin/invitations', { method: 'POST', body: { role, emails, ...(message?.trim() && { message: message.trim() }) } })
  return {
    entered: res.entered,
    created: res.created,
    emailed: res.emailed,
    skipped: res.skipped,
    devMode: Boolean(res.devMode),
    invitations: res.invitations.map((i) => ({ id: i.id, email: i.email, emailed: i.emailed, emailError: i.emailError, devLink: i.devLink })),
  }
}

export async function resendInvitation(id) {
  const res = await request(`/api/admin/invitations/${encodeURIComponent(id)}/resend`, { method: 'POST' })
  return { invitation: mapInvitation(res.invitation), emailed: res.emailed, emailError: res.emailError, devLink: res.devLink }
}

export async function cancelInvitation(id) {
  const res = await request(`/api/admin/invitations/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
  return { invitation: mapInvitation(res.invitation) }
}
