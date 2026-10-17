// Public invitation endpoints (/api/invitations/:token). The token in the link is the credential;
// the page never decides the role or the email, it only shows what the server says.
import { request } from './authApi.js'

export async function getInvitation(token, { signal } = {}) {
  const { invitation } = await request(`/api/invitations/${encodeURIComponent(token)}`, { signal })
  return { email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt }
}

// Creates the account (role and email come from the invitation) and starts the session cookie.
export async function acceptInvitation(token, { name, password, confirmPassword }) {
  const { user } = await request(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', body: { name, password, confirmPassword } })
  return user
}
