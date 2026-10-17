import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCurrentUser, loginRequest, logoutRequest, registerRequest } from '../services/authApi.js'
import { AuthContext } from './useAuth.js'

const SERVER_ERROR = 'We could not reach the server. Please try again.'

// Real authentication state, owned by the backend: the browser holds an HttpOnly
// cookie, and GET /api/auth/me says who it belongs to. The role is simply user.role.
//   loading         true only until the FIRST /me answer arrives, so route guards never
//                   redirect to /login while the session is still being checked
//   user            the current user, or null (logged out or unknown)
//   isAuthenticated user !== null
//   error           set only when /me could not be answered (server / network); a plain
//                   401 is a normal logged-out state, not an error
//   login / register / logout   call the API, then re-read /me (state is never built by hand)
export default function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, loading: true, error: null })
  const latest = useRef(0) // only the most recent /me call may update the state

  const onUser = useCallback((call, user) => {
    if (call === latest.current) setState({ user, loading: false, error: null })
    return user
  }, [])

  const onFailure = useCallback((call, err) => {
    if (err.name === 'AbortError' || call !== latest.current) return null
    // Never pretend to be logged in; keep a generic message (no backend details) for the UI.
    setState({ user: null, loading: false, error: SERVER_ERROR })
    return null
  }, [])

  // On startup (the state already starts as loading: true).
  useEffect(() => {
    const controller = new AbortController()
    const call = ++latest.current
    fetchCurrentUser({ signal: controller.signal }).then((user) => onUser(call, user), (err) => onFailure(call, err))
    return () => controller.abort()
  }, [onUser, onFailure])

  // Ask again and resolve with the user, or null. Silent: it does not flip `loading`
  // back on, so a screen that is already showing is not replaced by a spinner.
  const refreshUser = useCallback(() => {
    const call = ++latest.current
    return fetchCurrentUser().then((user) => onUser(call, user), (err) => onFailure(call, err))
  }, [onUser, onFailure])

  // Each of these throws an ApiError for the form to display; on success the session
  // cookie was set/cleared by the backend and /me has been re-read.
  const login = useCallback(
    async (email, password) => {
      await loginRequest(email, password)
      return confirmSession(await refreshUser())
    },
    [refreshUser],
  )

  const register = useCallback(
    async (name, email, password) => {
      await registerRequest(name, email, password)
      return confirmSession(await refreshUser())
    },
    [refreshUser],
  )

  const logout = useCallback(async () => {
    await logoutRequest()
    await refreshUser() // /me now answers 401, which clears the user
  }, [refreshUser])

  const value = useMemo(
    () => ({ user: state.user, loading: state.loading, isAuthenticated: state.user !== null, error: state.error, refreshUser, login, register, logout }),
    [state, refreshUser, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// A 200 from login/register but no user from /me means the browser refused the cookie.
function confirmSession(user) {
  if (!user) throw new Error('Your session could not be started. Check that cookies are enabled and try again.')
  return user
}
