import { Mail, Send } from 'lucide-react'
import { useState } from 'react'
import { INVITE_ROLES, sendInvitations } from '../services/adminService.js'
import Button from './Button.jsx'
import Card from './Card.jsx'
import { SelectField, TextAreaField } from './FormField.jsx'
import Notice from './Notice.jsx'

// The admin's invite form: one role + many email addresses (one per line) + optional note.
// The backend validates, de-duplicates, creates the invitations and sends the emails; this card
// only reports what happened. `onSent` lets the page re-read its lists.
export default function InviteUsersCard({ onSent }) {
  const [role, setRole] = useState('PICKUP_AGENT')
  const [emails, setEmails] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [failure, setFailure] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setResult(null)
    setFailure(null)
    if (emails.trim() === '') {
      setErrors({ emails: 'Enter at least one email address (one per line).' })
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const res = await sendInvitations({ role, emails, message })
      setResult(res)
      if (res.created > 0) setEmails('')
      onSent?.()
    } catch (err) {
      setErrors(err.fieldErrors ?? {})
      setFailure(Object.keys(err.fieldErrors ?? {}).length > 0 ? null : err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="h-fit">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <Mail size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-navy-900">Invite Users</h2>
          <p className="text-sm text-slate-500">Send invitation emails to onboard new users.</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        {failure && <Notice tone="error">{failure}</Notice>}
        <SelectField label="Role" name="role" options={INVITE_ROLES} value={role} onChange={(e) => setRole(e.target.value)} error={errors.role} />
        <TextAreaField
          label="Email Addresses"
          name="emails"
          rows={5}
          placeholder={'Enter email addresses (one per line)\nagent1@example.com\nagent2@example.com'}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          error={errors.emails}
          hint="You can add multiple email addresses (one per line)."
        />
        <TextAreaField
          label="Message (Optional)"
          name="message"
          rows={3}
          placeholder="Add a personal message to the invitation email..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          error={errors.message}
        />
        <Button type="submit" fullWidth size="lg" disabled={submitting}>
          <Send size={16} aria-hidden="true" /> {submitting ? 'Sending...' : 'Send Invitations'}
        </Button>
      </form>

      {result && <Result result={result} />}
    </Card>
  )
}

function Result({ result }) {
  const failed = result.invitations.filter((i) => !i.emailed)
  const links = result.invitations.filter((i) => i.devLink)
  const tone = result.created === 0 ? 'error' : result.skipped.length > 0 || failed.length > 0 ? 'warning' : 'success'
  return (
    <div className="mt-5 space-y-3" data-testid="invite-result">
      <Notice tone={tone}>
        <p className="font-semibold">
          {result.entered} {result.entered === 1 ? 'email' : 'emails'} entered, {result.created} {result.created === 1 ? 'invitation' : 'invitations'} created
          {result.devMode ? '' : `, ${result.emailed} accepted for sending`}
        </p>
        {result.devMode && result.created > 0 && <p className="mt-1">Development mode: no real emails were sent. Use the links below.</p>}
        {failed.length > 0 && (
          <ul className="mt-2 list-disc pl-5">
            {failed.map((i) => <li key={i.id} className="break-all">{i.email}: {i.emailError}</li>)}
          </ul>
        )}
        {result.skipped.length > 0 && (
          <>
            <p className="mt-2 font-medium">Not invited:</p>
            <ul className="list-disc pl-5">
              {result.skipped.map((s, n) => <li key={`${s.email}-${n}`} className="break-all">{s.email || '(empty)'}: {s.reason}</li>)}
            </ul>
          </>
        )}
      </Notice>
      {links.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          {links.map((i) => (
            <li key={i.id} className="break-all"><span className="font-medium text-slate-800">{i.email}</span>: <a className="text-brand-600 underline" href={i.devLink}>{i.devLink}</a></li>
          ))}
        </ul>
      )}
    </div>
  )
}
