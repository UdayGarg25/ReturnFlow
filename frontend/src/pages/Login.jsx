import { Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AuthCard from '../components/AuthCard.jsx'
import Button from '../components/Button.jsx'
import { TextField } from '../components/FormField.jsx'
import GoogleIcon from '../components/GoogleIcon.jsx'
import Notice from '../components/Notice.jsx'
import { useAuth } from '../context/useAuth.js'

export default function Login() {
  const { login } = useAuth()
  // The demo page can pre-fill the email (never the password) through router state, not the URL.
  const prefill = useLocation().state?.email
  const [values, setValues] = useState({ email: typeof prefill === 'string' ? prefill : '', password: '' })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const field = (name) => ({
    name,
    value: values[name],
    onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })),
  })

  // On success the backend has set the session cookie and /me was re-read; GuestRoute
  // then sends the (now logged-in) user to their dashboard.
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await login(values.email, values.password)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Welcome Back"
      subtitle="Login to your account to continue"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="rounded font-semibold text-brand-600 hover:text-brand-700">Register</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <TextField label="Email address" icon={Mail} type="email" autoComplete="email" placeholder="example@returnflow.test" required {...field('email')} />
        <TextField label="Password" icon={Lock} type="password" autoComplete="current-password" placeholder="Enter your password" required {...field('password')} />
        <Button type="submit" fullWidth size="lg" disabled={submitting}>{submitting ? 'Logging in...' : 'Login'}</Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs font-medium text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />OR<span className="h-px flex-1 bg-slate-200" />
      </div>

      <Button variant="secondary" fullWidth size="lg" className="text-slate-800">
        <GoogleIcon /> Continue with Google
      </Button>
    </AuthCard>
  )
}
