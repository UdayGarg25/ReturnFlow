import { Lock, Mail, User } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthCard from '../components/AuthCard.jsx'
import Button from '../components/Button.jsx'
import { TextField } from '../components/FormField.jsx'
import Notice from '../components/Notice.jsx'
import { useAuth } from '../context/useAuth.js'

// Public sign-up creates a customer account. There is no role to pick: the backend
// always creates a CUSTOMER and never reads a role from the request.
export default function Register() {
  const { register } = useAuth()
  const [values, setValues] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
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
    setError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      await register(values.name, values.email, values.password)
    } catch (err) {
      const fields = err.fieldErrors ?? {}
      setFieldErrors(fields)
      setError(Object.keys(fields).length > 0 ? null : err.message)
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Create Your Account"
      subtitle="Join ReturnFlow and start managing returns."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="rounded font-semibold text-brand-600 hover:text-brand-700">Login</Link>
        </>
      }
      className="max-w-lg"
    >
      <Notice tone="info" className="mb-4">
  <p className="font-medium mb-1">Before you register</p>
  ReturnFlow works with e‑commerce brands to manage product returns. Your orders will become available when your shopping platform or retailer integrates with ReturnFlow.
  <br />
  <br />
  Just exploring? Use our demo experience to explore ReturnFlow with sample data.
</Notice>
<form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <TextField label="Full name" icon={User} autoComplete="name" placeholder="John Doe" required {...field('name')} />
        <TextField label="Email address" icon={Mail} type="email" autoComplete="email" placeholder="example@returnflow.test" required {...field('email')} />
        <TextField label="Password" icon={Lock} type="password" autoComplete="new-password" placeholder="At least 8 characters" required hint="Use at least 8 characters." {...field('password')} />
        <Button type="submit" fullWidth size="lg" disabled={submitting}>{submitting ? 'Creating account...' : 'Register'}</Button>
      </form>
    </AuthCard>
  )
}
