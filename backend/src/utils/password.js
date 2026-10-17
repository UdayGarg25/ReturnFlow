import bcrypt from 'bcryptjs'

// Work factor: each +1 doubles the time to hash (and to brute-force). 12 is a
// common choice today (~250ms per hash).
const SALT_ROUNDS = 12

// plain password -> bcrypt hash (a random salt is generated and stored in the hash)
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Password must be a non-empty string.')
  }
  return bcrypt.hash(password, SALT_ROUNDS)
}

// plain password + stored hash -> true / false. Hashes cannot be reversed; the
// password is hashed again with the salt inside the stored hash and compared.
export async function comparePassword(password, passwordHash) {
  // A missing password or hash (unknown user, bad data) is simply "no match".
  if (typeof password !== 'string' || typeof passwordHash !== 'string') return false
  return bcrypt.compare(password, passwordHash)
}
