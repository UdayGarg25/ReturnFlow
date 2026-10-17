// Display metadata for every order / return status. Keys match the backend
// status values, so API responses can be rendered as-is later.
// tone: amber = pending, blue = in progress, green = approved/completed, red = rejected/cancelled
export const STATUS = {
  // orders
  PENDING: { label: 'Pending', tone: 'amber' },
  CONFIRMED: { label: 'Processing', tone: 'blue' },
  SHIPPED: { label: 'Shipped', tone: 'blue' },
  DELIVERED: { label: 'Delivered', tone: 'green' },
  CANCELLED: { label: 'Cancelled', tone: 'red' },
  // invitations (PENDING, CANCELLED above; ACCEPTED below)
  EXPIRED: { label: 'Expired', tone: 'red' },
  // returns
  RETURN_REQUESTED: { label: 'Pending', tone: 'amber' },
  SELLER_APPROVED: { label: 'Approved', tone: 'green' },
  SELLER_REJECTED: { label: 'Rejected', tone: 'red' },
  PICKUP_ASSIGNED: { label: 'Pickup Assigned', tone: 'blue' },
  PICKED_UP: { label: 'Picked Up', tone: 'blue' },
  WAREHOUSE_RECEIVED: { label: 'At Warehouse', tone: 'blue' },
  INSPECTION: { label: 'In Inspection', tone: 'blue' },
  INSPECTION_APPROVED: { label: 'Approved', tone: 'green' },
  INSPECTION_REJECTED: { label: 'Rejected', tone: 'red' },
  REFUND_PENDING: { label: 'Refund Pending', tone: 'blue' },
  REFUNDED: { label: 'Refunded', tone: 'green' },
  COMPLETED: { label: 'Completed', tone: 'green' },
  // pickups (PICKED_UP and CANCELLED above are shared; COMPLETED = delivered to the warehouse)
  ASSIGNED: { label: 'Pending', tone: 'amber' },
  ACCEPTED: { label: 'Accepted', tone: 'green' },
  FAILED: { label: 'Failed', tone: 'red' },
  // inspections (warehouse). APPROVED / REJECTED reuse INSPECTION_APPROVED / INSPECTION_REJECTED above.
  INSPECTION_QUEUED: { label: 'Pending Inspection', tone: 'amber' },
  MANUAL_REVIEW: { label: 'Awaiting Decision', tone: 'orange' },
  // refunds
  PROCESSING: { label: 'Processing', tone: 'blue' },
  // products
  ACTIVE: { label: 'Active', tone: 'green' },
  INACTIVE: { label: 'Inactive', tone: 'slate' },
  OUT_OF_STOCK: { label: 'Out of Stock', tone: 'red' },
}

export const statusMeta = (status) =>
  STATUS[status] ?? { label: status, tone: 'blue' }

// Coarse groups used by the returns list filter.
export const TONE_GROUPS = {
  amber: 'Pending',
  blue: 'In Progress',
  green: 'Approved / Completed',
  red: 'Rejected / Cancelled',
}
