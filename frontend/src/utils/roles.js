// The four application roles (same strings as users.role in the database) and how
// they are shown to people. The authenticated role is always user.role from the API.
export const ROLES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  SELLER: 'SELLER',
  PICKUP_AGENT: 'PICKUP_AGENT',
  WAREHOUSE: 'WAREHOUSE',
  ADMIN: 'ADMIN',
})

export const ROLE_LABELS = Object.freeze({
  CUSTOMER: 'Customer',
  SELLER: 'Seller',
  PICKUP_AGENT: 'Pickup Agent',
  WAREHOUSE: 'Warehouse',
  ADMIN: 'Admin',
})
