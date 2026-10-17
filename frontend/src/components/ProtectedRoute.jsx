import { Loader2, ServerCrash } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import Button from './Button.jsx'

function Screen({ children }) {
  return <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">{children}</main>
}

// Wraps pages that need a logged-in user. This is a convenience for the person using
// the app, NOT the security boundary: the backend authenticates and authorizes every API call.
//   still checking the session -> a small loading state (never a redirect)
//   /me could not be answered  -> "server unavailable" with retry (not a misleading login page)
//   logged out                 -> /login, remembering where the user was heading
//   logged in                  -> the page
export default function ProtectedRoute({ children }) {
  const { loading, isAuthenticated, error, refreshUser } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <Screen>
        <Loader2 size={28} aria-hidden="true" className="animate-spin text-brand-600" />
        <p role="status" className="text-sm text-slate-600">Checking your session...</p>
      </Screen>
    )
  }

  if (!isAuthenticated) {
    if (error) {
      return (
        <Screen>
          <ServerCrash size={32} aria-hidden="true" className="text-slate-400" />
          <h1 className="text-lg font-semibold text-navy-900">We can&apos;t reach ReturnFlow right now</h1>
          <p className="max-w-sm text-sm text-slate-500">{error}</p>
          <Button onClick={refreshUser}>Try again</Button>
        </Screen>
      )
    }
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}
