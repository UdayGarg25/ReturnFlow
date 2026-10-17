import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'

// Login / register are for logged-out visitors. A logged-in user is sent on to where
// they were heading (only ever an app path), otherwise to their dashboard. While the
// session is still being checked the page simply shows, so there is no flash or loop.
export default function GuestRoute({ children }) {
  const { isAuthenticated } = useAuth()
  const from = useLocation().state?.from?.pathname
  if (isAuthenticated) return <Navigate to={typeof from === 'string' && (from.startsWith('/dashboard') || from.startsWith('/admin')) ? from : '/dashboard'} replace />
  return children
}
