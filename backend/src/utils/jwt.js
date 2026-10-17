import jwt from 'jsonwebtoken'
import { authConfig } from '../config/auth.js'

// payload (e.g. { userId, role }) -> signed token string.
// The payload is readable by anyone holding the token, so never put secrets in it.
export function generateToken(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Token payload must be a plain object.')
  }
  return jwt.sign(payload, authConfig.jwtSecret, {
    algorithm: authConfig.jwtAlgorithm,
    expiresIn: authConfig.jwtExpiresIn,
  })
}

// token string -> decoded payload (plus the iat / exp claims).
// Throws for anything that is not a valid, unexpired token signed with our secret:
//   TokenExpiredError  - the token's lifetime has passed
//   JsonWebTokenError  - malformed, wrong signature, wrong algorithm...
// Only HS256 is accepted, so a token cannot choose a weaker algorithm for itself.
export function verifyToken(token) {
  return jwt.verify(token, authConfig.jwtSecret, { algorithms: [authConfig.jwtAlgorithm] })
}
