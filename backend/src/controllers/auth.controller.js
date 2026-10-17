import { AUTH_ERRORS, login as loginService, registerCustomer } from '../services/auth.service.js'
import { clearAuthCookie, setAuthCookie } from '../utils/cookies.js'
import { ServiceError } from '../utils/errors.js'

// ServiceError code -> HTTP response. Anything else is unexpected: it goes to the
// global error handler (500) and its details never reach the client.
const HTTP_ERRORS = {
  [AUTH_ERRORS.VALIDATION]: (err) => ({ status: 400, body: { message: err.message, errors: err.details?.fieldErrors } }),
  [AUTH_ERRORS.EMAIL_TAKEN]: (err) => ({ status: 409, body: { message: err.message } }),
  [AUTH_ERRORS.INVALID_CREDENTIALS]: (err) => ({ status: 401, body: { message: err.message } }),
  [AUTH_ERRORS.USER_NOT_FOUND]: () => ({ status: 401, body: { message: 'Authentication required' } }),
}

function sendError(err, res, next) {
  const mapper = err instanceof ServiceError ? HTTP_ERRORS[err.code] : undefined
  if (!mapper) return next(err)
  const { status, body } = mapper(err)
  return res.status(status).json(body)
}

// POST /api/auth/register  { name, email, password }
// Only those three fields are passed on; the service always creates a CUSTOMER.
export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body ?? {}
    const { user, token } = await registerCustomer({ name, email, password })
    setAuthCookie(res, token) // the token travels only in the HttpOnly cookie, never in the body
    return res.status(201).json({ user })
  } catch (err) {
    return sendError(err, res, next)
  }
}

// POST /api/auth/login  { email, password }
export async function login(req, res, next) {
  try {
    const { email, password } = req.body ?? {}
    const { user, token } = await loginService(email, password)
    setAuthCookie(res, token)
    return res.status(200).json({ user })
  } catch (err) {
    return sendError(err, res, next)
  }
}

// GET /api/auth/me  (behind `authenticate`, which loaded req.user from PostgreSQL)
export function me(req, res) {
  return res.status(200).json({ user: req.user })
}

// POST /api/auth/logout  Nothing is stored server-side, so clearing the cookie is the logout.
export function logout(req, res) {
  clearAuthCookie(res)
  return res.status(200).json({ message: 'Logged out successfully' })
}
