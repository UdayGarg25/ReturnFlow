import { Check, Copy } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth.js'
import { DEMO_PASSWORD } from '../../utils/demoAccounts.js'
import Button from '../Button.jsx'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // clipboard API unavailable (plain http, old browser): fall back to a hidden textarea
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const done = document.execCommand?.('copy') ?? false
    area.remove()
    return done
  }
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 break-all rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800" data-testid={`demo-${label.toLowerCase()}`}>{value}</p>
    </div>
  )
}

// Email + password of a demo account, with Copy and Login buttons. "Login" opens the normal login page with the
// email filled in (router state, not the URL, and never the password). Nothing is sent anywhere: no email, no request.
export default function CredentialsBox({ account }) {
  const navigate = useNavigate()
  const { isAuthenticated, logout } = useAuth()
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  const copy = async () => {
    if (!(await copyText(`${account.email}\n${DEMO_PASSWORD}`))) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }
  // a logged-in visitor would be bounced away from /login, so end that session first
  const login = async () => {
    if (isAuthenticated) await logout().catch(() => {})
    navigate('/login', { state: { email: account.email } })
  }

  return (
    <div className="mt-4 space-y-3">
      <Field label="Email" value={account.email} />
      <Field label="Password" value={DEMO_PASSWORD} />
      <div className="grid gap-2">
        <Button onClick={login}>Login as {account.label}</Button>
        <Button variant="outline" onClick={copy} aria-live="polite">
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy Credentials'}
        </Button>
      </div>
    </div>
  )
}
