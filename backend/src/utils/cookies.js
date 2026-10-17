import { authConfig } from '../config/auth.js'
import { verifyToken } from './jwt.js'

// Put the JWT in the HttpOnly auth cookie. The cookie lives exactly as long as the
// token: its lifetime is read from the token's own `exp`, whatever JWT_EXPIRES_IN is.
export function setAuthCookie(res, token) {
  const maxAge = verifyToken(token).exp * 1000 - Date.now()
  res.cookie(authConfig.cookieName, token, { ...authConfig.cookieOptions, maxAge })
}

// Name, path and flags must match the ones used to set the cookie, or browsers keep it.
export function clearAuthCookie(res) {
  res.clearCookie(authConfig.cookieName, authConfig.cookieOptions)
}
