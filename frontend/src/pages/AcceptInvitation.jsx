import { Loader2, Lock, User } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthCard from '../components/AuthCard.jsx'
import Button from '../components/Button.jsx'
import { TextField } from '../components/FormField.jsx'
import Notice from '../components/Notice.jsx'
import RoleBadge from '../components/RoleBadge.jsx'
import { useAuth } from '../context/useAuth.js'
import useApi from '../hooks/useApi.js'
import { acceptInvitation, getInvitation } from '../services/invitationService.js'

const loginFooter = (
  <>
    Already have an account?{' '}
    <Link to="/login" className="rounded font-semibold text-brand-600 hover:text-brand-700">Login</Link>
  </>
)

// Public page opened from the invitation email. The email and role shown come from the server's
// invitation record; the form only asks for a name and a password.
export default function AcceptInvitation() {
  const token = useSearchParams()[0].get('token') ?? ''
  const { data: invitation, error, loading } = useApi((signal) => (token ? getInvitation(token, { signal }) : Promise.reject(Object.assign(new Error('missing'), { status: 404 }))), [token])

  if (loading) {
    return (
      <AuthCard title="Checking your invitation" subtitle="One moment..." footer={loginFooter}>
        <p role="status" className="flex items-center justify-center gap-2 text-sm text-slate-600"><Loader2 size={18} aria-hidden="true" className="animate-spin text-brand-600" /> Loading...</p>
      </AuthCard>
    )
  }
  if (error) {
    const text = error.status === 404 ? 'This invitation link is not valid. Check that you opened the full link from your email.' : error.status === 409 ? error.message : error.message
    return (
      <AuthCard title="Invitation unavailable" subtitle="We could not open this invitation." footer={loginFooter}>
        <Notice tone="error">{text}</Notice>
      </AuthCard>
    )
  }
  return <AcceptForm token={token} invitation={invitation} />
}

function AcceptForm({ token, invitation }) {
  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({ name: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const field = (name) => ({ name, value: values[name], onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })), error: errors[name] })

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const local = {}
    if (!values.name.trim()) local.name = 'Enter your name.'
    if (values.password.length < 8) local.password = 'Password must be at least 8 characters.'
    if (values.confirmPassword !== values.password) local.confirmPassword = 'The passwords do not match.'
    setErrors(local)
    setFormError(null)
    if (Object.keys(local).length > 0) return
    setSubmitting(true)
    try {
      await acceptInvitation(token, values) // creates the account and starts the session
      await refreshUser()
      navigate('/dashboard', { replace: true }) // the dashboard for the role the server assigned
    } catch (err) {
      setErrors(err.fieldErrors ?? {})
      setFormError(Object.keys(err.fieldErrors ?? {}).length > 0 ? null : err.message)
      setSubmitting(false)
    }
  }

  return (
    <AuthCard title="You've been invited to ReturnFlow" subtitle="Create your account to get started." footer={loginFooter}>
      <dl className="mb-5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Email</dt><dd className="break-all font-medium text-slate-900">{invitation.email}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Role</dt><dd><RoleBadge role={invitation.role} /></dd></div>
      </dl>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField label="Name" icon={User} autoComplete="name" placeholder="Your full name" required {...field('name')} />
        <TextField label="Password" icon={Lock} type="password" autoComplete="new-password" placeholder="At least 8 characters" required {...field('password')} />
        <TextField label="Confirm Password" icon={Lock} type="password" autoComplete="new-password" placeholder="Repeat your password" required {...field('confirmPassword')} />
        <Button type="submit" fullWidth size="lg" disabled={submitting}>{submitting ? 'Creating account...' : 'Create Account'}</Button>
      </form>
    </AuthCard>
  )
}
