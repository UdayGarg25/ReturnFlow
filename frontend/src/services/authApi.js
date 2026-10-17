// Backend base URL. Set VITE_API_URL for another environment (see .env.example).
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:5000').replace(/\/$/, '')

const NETWORK_MESSAGE = 'We could not reach the server. Please try again.'
const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

// A failed API call, reduced to what a screen may show: the HTTP status (0 = no
// response at all), a safe message, and per-field messages for form validation.
export class ApiError extends Error {
  constructor(status, message, fieldErrors) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors ?? {}
  }
}

// fetch with the session cookie. The cookie is HttpOnly: the browser sends it,
// and this code never sees or stores the JWT.
export async function request(path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(0, NETWORK_MESSAGE)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // Only the backend's own short messages are shown; anything unexpected becomes generic.
    const message = res.status < 500 && typeof data?.message === 'string' ? data.message : GENERIC_MESSAGE
    throw new ApiError(res.status, message, res.status === 400 ? data?.errors : undefined)
  }
  return data
}

// GET /api/auth/me
//   200 -> the user;  401 -> null (just "not logged in");  anything else -> throws
export async function fetchCurrentUser({ signal } = {}) {
  try {
    const data = await request('/api/auth/me', { signal })
    return data?.user ?? null
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

// The session cookie is set (or cleared) by the backend; these return nothing useful on purpose.
export const loginRequest = (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } })
// Registration sends ONLY these three fields. The backend always creates a CUSTOMER.
export const registerRequest = (name, email, password) => request('/api/auth/register', { method: 'POST', body: { name, email, password } })
export const logoutRequest = () => request('/api/auth/logout', { method: 'POST' })
