import { authConfig } from '../config/auth.js'
import { AUTH_ERRORS, getCurrentUser } from '../services/auth.service.js'
import { ServiceError } from '../utils/errors.js'
import { verifyToken } from '../utils/jwt.js'

// jsonwebtoken error names for "this token is not acceptable" (bad, forged, expired).
const BAD_TOKEN_ERRORS = ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError']

// One response for every failure: the client must not learn whether the token was
// missing, forged, expired, or belonged to a deleted user.
const reject = (res) => res.status(401).json({ message: 'Authentication required' })

// Establishes WHO is calling (not what they may do; that is authorization, a later step).
//   cookie -> verifyToken -> userId -> user row from PostgreSQL -> req.user -> next()
// Needs cookie-parser mounted before it (that is what fills req.cookies).
export async function authenticate(req, res, next) {
  const token = req.cookies?.[authConfig.cookieName]
  if (typeof token !== 'string' || token === '') return reject(res)

  try {
    const { userId } = verifyToken(token)
    // Only the id is taken from the token. role / name / email in it (if anyone
    // crafted such claims) are never read.
    if (!Number.isSafeInteger(userId) || userId <= 0) return reject(res)

    // The database stays the source of truth, so a role change or a deleted
    // account applies on the very next request.
    req.user = await getCurrentUser(userId)
    return next()
  } catch (err) {
    const isAuthFailure =
      BAD_TOKEN_ERRORS.includes(err.name) || (err instanceof ServiceError && err.code === AUTH_ERRORS.USER_NOT_FOUND)
    if (isAuthFailure) return reject(res)
    // Anything else (database down, a bug) is a server problem, not "unauthenticated".
    return next(err)
  }
}
