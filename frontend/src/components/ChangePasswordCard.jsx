import { Lock } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../context/useAuth.js'
import { changePasswordRequest } from '../services/authApi.js'
import Button from './Button.jsx'
import Card from './Card.jsx'
import { TextField } from './FormField.jsx'
import Notice from './Notice.jsx'

const PASSWORD_MIN = 8
const PASSWORD_MAX_BYTES = 72 // bcrypt ignores anything past 72 bytes; the backend enforces the same limit
const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' }

// The same rules the backend applies. The backend is the authority; this only saves a round trip for obvious mistakes.
function check({ currentPassword, newPassword, confirmPassword }) {
  const errors = {}
  if (currentPassword === '') errors.currentPassword = 'Enter your current password.'
  if (newPassword === '') errors.newPassword = 'Enter a new password.'
  else if (newPassword.length < PASSWORD_MIN) errors.newPassword = `Password must be at least ${PASSWORD_MIN} characters.`
  else if (new TextEncoder().encode(newPassword).length > PASSWORD_MAX_BYTES) errors.newPassword = `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`
  else if (newPassword === currentPassword) errors.newPassword = 'Choose a password different from your current one.'
  if (confirmPassword === '') errors.confirmPassword = 'Confirm your new password.'
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'The passwords do not match.'
  return errors
}

// Shared demo accounts (Customer, Seller, Pickup Agent, Warehouse...) are used by every visitor, so their password can never
// be changed: the backend refuses it and this card does not even offer the form. `isDemoAccount` comes from /api/auth/me.
function DemoNotice() {
  return (
    <Card title="Change Password">
      <Notice tone="info">
        <p className="font-semibold">Password Changes Disabled</p>
        <p className="mt-1">
          Password changes are disabled for demo accounts. These accounts are shared among visitors to explore ReturnFlow, so their
          credentials cannot be modified.
        </p>
      </Notice>
    </Card>
  )
}

function PasswordForm() {
  const [values, setValues] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [notice, setNotice] = useState(null) // { tone, text }
  const [submitting, setSubmitting] = useState(false)

  const field = (name) => ({
    name,
    value: values[name],
    error: fieldErrors[name],
    onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })),
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setNotice(null)
    const problems = check(values)
    setFieldErrors(problems)
    if (Object.keys(problems).length > 0) return
    setSubmitting(true)
    try {
      await changePasswordRequest(values.currentPassword, values.newPassword, values.confirmPassword)
      setValues(EMPTY)
      setNotice({ tone: 'success', text: 'Your password was updated.' })
    } catch (err) {
      const fields = err.fieldErrors ?? {}
      setFieldErrors(fields)
      setNotice(Object.keys(fields).length > 0 ? null : { tone: 'error', text: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card title="Change Password">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <TextField label="Current Password" icon={Lock} type="password" autoComplete="current-password" placeholder="Enter current password" {...field('currentPassword')} />
        <TextField label="New Password" icon={Lock} type="password" autoComplete="new-password" placeholder="Enter new password" {...field('newPassword')} />
        <TextField label="Confirm New Password" icon={Lock} type="password" autoComplete="new-password" placeholder="Confirm new password" {...field('confirmPassword')} />
        <Button type="submit" fullWidth size="lg" disabled={submitting}>{submitting ? 'Updating...' : 'Update Password'}</Button>
      </form>
    </Card>
  )
}

export default function ChangePasswordCard() {
  const { user } = useAuth()
  return user?.isDemoAccount ? <DemoNotice /> : <PasswordForm />
}
