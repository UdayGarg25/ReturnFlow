import { acceptInvitation, getInvitationByToken } from '../services/invitation.service.js'
import { setAuthCookie } from '../utils/cookies.js'
import { handle } from '../utils/http.js'
import { generateToken } from '../utils/jwt.js'

export const show = handle(async (req) => ({ body: { invitation: await getInvitationByToken(req.params.token) } }))

// POST /api/invitations/:token/accept  { name, password, confirmPassword }
// Any "role" or "email" in the body is never read: both come from the stored invitation.
// The new user is logged in through the normal session cookie (the same one login sets).
export const accept = handle(async (req) => {
  const { name, password, confirmPassword } = req.body ?? {}
  const user = await acceptInvitation(req.params.token, { name, password, confirmPassword })
  setAuthCookie(req.res, generateToken({ userId: user.id }))
  return { status: 201, body: { user } }
})
