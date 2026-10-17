// The only roles that exist (users.role CHECK constraint in schema.sql).
export const ROLES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  SELLER: 'SELLER',
  PICKUP_AGENT: 'PICKUP_AGENT',
  WAREHOUSE: 'WAREHOUSE',
  ADMIN: 'ADMIN', // never created through registration or invitations (see seedAdmin.js)
})
const VALID_ROLES = new Set(Object.values(ROLES))

// Role-based access control. Use AFTER `authenticate`:
//   router.get('/inspections', authenticate, authorize('WAREHOUSE'), controller)
//   router.get('/orders', authenticate, authorize('SELLER', 'WAREHOUSE'), controller)
//
// It answers only "is this user's role allowed on this endpoint?". It reads the
// role from req.user (loaded from PostgreSQL by `authenticate`), never from the
// body, query, params or headers, so a client cannot choose its own role.
// Ownership ("is this MY order?") is a separate check in the service layer.
export function authorize(...allowedRoles) {
  // A typo here ("WAREHOSE") would silently lock everyone out, so fail at startup.
  if (allowedRoles.length === 0) throw new Error('authorize() needs at least one role.')
  for (const role of allowedRoles) {
    if (!VALID_ROLES.has(role)) throw new Error(`authorize(): "${String(role)}" is not a valid role.`)
  }
  const allowed = new Set(allowedRoles)

  return function authorizeRole(req, res, next) {
    // Defensive: `authenticate` should already have rejected this request.
    if (!req.user) return res.status(401).json({ message: 'Authentication required' })

    // Unknown role values (bad data, a future role) get no access by default.
    if (!VALID_ROLES.has(req.user.role) || !allowed.has(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' })
    }
    return next()
  }
}
