// Outgoing email. Everything provider-specific lives in this file; the rest of the backend only
// calls sendInvitationEmail().
//
// Two transports:
//   resend       RESEND_API_KEY is set  -> the message is handed to Resend (https://resend.com).
//   development  no key, NOT production -> nothing is sent; the message is logged on the server and
//                the admin API returns the invitation link so the flow can be tried locally.
// In production the key and sender are required: the process refuses to start without them, so
// the app can never pretend to send email.
import { Resend } from 'resend'
import { ServiceError } from '../utils/errors.js'

const isProduction = process.env.NODE_ENV === 'production'
const apiKey = process.env.RESEND_API_KEY?.trim() || ''
const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || ''
const fromName = process.env.RESEND_FROM_NAME?.trim() || 'ReturnFlow'

export const EMAIL_MODE = apiKey ? 'resend' : 'development'
// True only for the local no-key fallback (the admin API then also returns the links).
export const isDevEmail = EMAIL_MODE === 'development'

if (isProduction && (!apiKey || !fromEmail)) {
  throw new Error('RESEND_API_KEY and RESEND_FROM_EMAIL must be set in production (see backend/.env.example).')
}
if (apiKey && !fromEmail) {
  throw new Error('RESEND_API_KEY is set but RESEND_FROM_EMAIL is not. Set a sender your Resend account may use (e.g. onboarding@resend.dev for testing).')
}

// One client for the whole process, created only when a key exists. The key never leaves this module.
const resend = apiKey ? new Resend(apiKey) : null
const from = `${fromName.replace(/[<>"\r\n]/g, '')} <${fromEmail}>`

// Base URL of the web app, used for links in emails (never taken from a request).
export const appUrl = () => (process.env.APP_BASE_URL || (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, '')
export const invitationLink = (token) => `${appUrl()}/accept-invitation?token=${encodeURIComponent(token)}`

const ROLE_NAMES = { SELLER: 'Seller', PICKUP_AGENT: 'Pickup Agent', WAREHOUSE: 'Warehouse' }
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// --------------------------------------------------------------- the message ----
function buildInvitation({ role, link, expiresAt, message }) {
  const roleName = ROLE_NAMES[role] ?? role
  const days = Math.max(1, Math.round((new Date(expiresAt) - Date.now()) / 86_400_000))
  const validity = `Your invitation is valid for ${days} ${days === 1 ? 'day' : 'days'}.`
  const note = message ? message.trim() : ''

  const text = [
    "You're invited to join ReturnFlow",
    '',
    `You've been invited to join ReturnFlow as a ${roleName}.`,
    ...(note ? ['', `"${note}"`] : []),
    '',
    validity,
    '',
    `Accept Invitation: ${link}`,
    '',
    'If you were not expecting this invitation, you can safely ignore this email.',
  ].join('\n')

  // Table layout + inline styles: the combination email clients render reliably.
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>You're invited to join ReturnFlow</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px 28px;">
      <tr><td style="font-size:20px;font-weight:bold;color:#2563eb;padding-bottom:20px;">ReturnFlow</td></tr>
      <tr><td style="font-size:22px;font-weight:bold;padding-bottom:12px;">You're invited to join ReturnFlow</td></tr>
      <tr><td style="font-size:15px;line-height:1.6;padding-bottom:8px;">Hello,</td></tr>
      <tr><td style="font-size:15px;line-height:1.6;padding-bottom:8px;">You've been invited to join ReturnFlow as a <strong>${escapeHtml(roleName)}</strong>.</td></tr>
      ${note ? `<tr><td style="font-size:15px;line-height:1.6;padding:4px 0 8px;color:#475569;font-style:italic;">&ldquo;${escapeHtml(note)}&rdquo;</td></tr>` : ''}
      <tr><td style="font-size:15px;line-height:1.6;padding-bottom:20px;">${escapeHtml(validity)}</td></tr>
      <tr><td style="padding-bottom:24px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 24px;border-radius:8px;">Accept Invitation</a></td></tr>
      <tr><td style="font-size:13px;line-height:1.6;color:#475569;padding-bottom:16px;">If the button does not work, copy this link into your browser:<br><a href="${escapeHtml(link)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(link)}</a></td></tr>
      <tr><td style="font-size:13px;line-height:1.6;color:#64748b;border-top:1px solid #e2e8f0;padding-top:16px;">If you were not expecting this invitation, you can safely ignore this email.</td></tr>
    </table>
  </td></tr></table>
</body></html>`

  return { subject: "You're invited to join ReturnFlow", text, html }
}

// ----------------------------------------------------------------- transports ----
// Each takes { to, subject, text, html } and resolves to { accepted, providerId? }.
//   accepted: the provider took the message. For Resend that means "accepted for delivery";
//   it does NOT promise that it reached an inbox.
const TRANSPORTS = {
  resend: async ({ to, subject, text, html }) => {
    let result
    try {
      result = await resend.emails.send({ from, to: [to], subject, html, text })
    } catch (err) {
      // Network failure etc. Only the error's name is logged: never the request, never the key.
      console.error(`[email] Resend request failed (${err?.name ?? 'error'})`)
      throw new ServiceError('EMAIL_SEND_FAILED', 'The email provider could not be reached.')
    }
    if (result.error) {
      // The SDK returns { data, error } instead of throwing. Log the provider's reason, show clients nothing of it.
      console.error(`[email] Resend rejected the message (${result.error.name ?? 'error'}): ${result.error.message}`)
      throw new ServiceError('EMAIL_SEND_FAILED', 'The email provider rejected the message.')
    }
    return { accepted: true, providerId: result.data?.id }
  },

  // Local fallback only (see top of file): logs, sends nothing.
  development: async ({ to, subject, text }) => {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${text}`)
    return { accepted: false }
  },
}

// Sends the invitation to ONE recipient. Resolves to { accepted, providerId?, link }.
export async function sendInvitationEmail({ to, role, token, expiresAt, message }) {
  const link = invitationLink(token)
  const content = buildInvitation({ role, link, expiresAt, message })
  const result = await TRANSPORTS[EMAIL_MODE]({ to, ...content })
  return { ...result, link }
}
