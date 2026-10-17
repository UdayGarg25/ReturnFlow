import { X } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import Logo from './Logo.jsx'

const itemClass = (active) =>
  `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    active ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30' : 'text-slate-300 hover:bg-white/10 hover:text-white'
  }`

// Default rule: `end` = exact path only, otherwise the path or anything beneath it.
// An item can take over with its own `isActive(pathname, locationState)` (see routes/navigation.js).
function isActive(pathname, state, { to, end, isActive: custom }) {
  if (custom) return custom(pathname, state)
  return end ? pathname === to : pathname === to || pathname.startsWith(to + '/')
}

function Item({ label, to, icon: Icon, end, isActive: custom, onNavigate }) {
  const { pathname, state } = useLocation()
  const active = isActive(pathname, state, { to, end, isActive: custom })
  return (
    <Link to={to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
      <Icon size={19} aria-hidden="true" />
      {label}
    </Link>
  )
}

// Ends the session through the API (the backend clears the HttpOnly cookie; the
// browser's JavaScript cannot), then returns to the login page.
function LogoutItem({ label, icon: Icon, onNavigate }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await logout()
      onNavigate?.()
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={busy} className={`${itemClass(false)} disabled:opacity-60`}>
        <Icon size={19} aria-hidden="true" />
        {busy ? 'Logging out...' : label}
      </button>
      {error && <p role="alert" className="px-3 pt-1 text-xs text-red-300">{error}</p>}
    </>
  )
}

// Fixed on lg+, slide-over drawer below lg. `nav` = { main: [...], secondary: [...] }.
export default function Sidebar({ nav, open, onClose }) {
  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-navy-950/60 transition-opacity lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        id="dashboard-sidebar"
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-gradient-to-b from-navy-900 to-navy-950 transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <Logo to="/dashboard" dark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 lg:hidden"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 py-5">
          <ul className="space-y-1">
            {nav.main.map((i) => (
              <li key={i.to}><Item {...i} onNavigate={onClose} /></li>
            ))}
          </ul>
          <hr className="my-5 border-white/10" />
          <ul className="space-y-1">
            {nav.secondary.map((i) => (
              <li key={i.to ?? i.action}>
                {i.action === 'logout' ? <LogoutItem {...i} onNavigate={onClose} /> : <Item {...i} onNavigate={onClose} />}
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  )
}
