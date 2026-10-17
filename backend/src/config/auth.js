import dotenv from 'dotenv'

// Loaded here too, so this module works no matter which file is imported first.
dotenv.config()

const MIN_SECRET_LENGTH = 32
// The value shipped in .env.example; running with it would be as bad as no secret.
const PLACEHOLDER_SECRET = 'replace-with-a-strong-secret'

const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret) {
  throw new Error('JWT_SECRET is not set. Add it to backend/.env (see .env.example).')
}
if (jwtSecret === PLACEHOLDER_SECRET || jwtSecret.length < MIN_SECRET_LENGTH) {
  throw new Error(`JWT_SECRET is too weak. Use a random value of at least ${MIN_SECRET_LENGTH} characters.`)
}

const cookieSameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase()
if (!['lax', 'strict', 'none'].includes(cookieSameSite)) {
  throw new Error('COOKIE_SAMESITE must be lax, strict or none.')
}
if (cookieSameSite === 'none' && process.env.NODE_ENV !== 'production') {
  console.warn('COOKIE_SAMESITE=none needs the Secure flag, which is only set in production; browsers will drop the cookie over HTTP.')
}

export const authConfig = Object.freeze({
  jwtSecret,
  // Token lifetime in jsonwebtoken format ("1d", "2h", "900"...). A short default is fine for local dev.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  jwtAlgorithm: 'HS256',
  // Name of the HttpOnly cookie that carries the JWT. Shared by the middleware that
  // reads it and (later) the login / logout code that sets and clears it.
  cookieName: 'access_token',
  // CSRF: the cookie is SameSite=Lax, so browsers do not attach it to cross-site POST/PUT/DELETE
  // requests, and CORS only lists our own frontend origin. That is the CSRF defence here and it
  // is sufficient while the frontend and API share a site. Do NOT switch to SameSite=None (a
  // frontend on another site) without first adding CSRF tokens, and it also requires HTTPS.
  // Attributes for that cookie (maxAge is added per login, from the token's own expiry).
  //  - httpOnly: JavaScript in the page can never read the token.
  //  - secure: HTTPS only in production; plain HTTP is allowed for local development.
  //  - sameSite: 'lax' suits a frontend and API on the same site (localhost in dev).
  //    A frontend on a different site needs COOKIE_SAMESITE=none (requires HTTPS).
  cookieOptions: Object.freeze({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: cookieSameSite,
    path: '/',
  }),
})
