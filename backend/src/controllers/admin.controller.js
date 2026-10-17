import * as admin from '../services/admin.service.js'
import { handle, parseId } from '../utils/http.js'

// Every handler here sits behind authenticate + authorize(ADMIN) (see admin.routes.js).
export const stats = handle(async () => ({ body: { stats: await admin.getStats() } }))
export const users = handle(async () => ({ body: { users: await admin.listUsers() } }))
export const invitations = handle(async () => ({ body: { invitations: await admin.listInvitations() } }))
// The inviter is always the logged-in admin; only role, emails and an optional message come from the body.
export const invite = handle(async (req) => ({ status: 201, body: await admin.createInvitations(req.user.id, { role: req.body?.role, emails: req.body?.emails, message: req.body?.message }) }))
export const resend = handle(async (req) => ({ body: await admin.resendInvitation(parseId(req.params.id, 'Invitation')) }))
export const cancel = handle(async (req) => ({ body: await admin.cancelInvitation(parseId(req.params.id, 'Invitation')) }))
