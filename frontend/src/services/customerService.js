// Customer data, from the real API (/api/customer/*). Every call carries the session
// cookie (credentials: 'include', see request() in authApi.js); the backend decides
// which customer is asking and which rows they may see. Nothing here falls back to
// mock data: a failed call throws an ApiError for the screen to show.
//
// API rows use snake_case and string amounts; the mapping to the shape the screens
// use happens ONLY in this file.
import { request } from './authApi.js'
import { reasonLabel } from '../utils/returnReasons.js'

// Display ids (ORD-001, RET-001) live in utils/labels.js.
export { orderLabel, returnLabel } from '../utils/labels.js'

const mapItem = (i) => ({
  id: i.id,
  productId: i.product_id,
  name: i.product_name,
  quantity: i.quantity,
  unitPrice: Number(i.unit_price), // NUMERIC arrives as a string
})

const mapOrder = (o) => ({
  id: o.id,
  status: o.status,
  total: Number(o.total_amount),
  placedAt: o.created_at,
  ...(o.items && { items: o.items.map(mapItem) }),
})

const mapReturn = (r) => ({
  id: r.id,
  orderId: r.order_id,
  orderItemId: r.order_item_id,
  product: { id: r.product_id, name: r.product_name },
  reasonCode: r.reason,
  reason: reasonLabel(r.reason),
  description: r.description ?? '',
  status: r.status,
  requestedAt: r.created_at,
  refundStatus: r.refund_status ?? null,
  // the only lifecycle timestamps the API provides, in the shape the timeline expects
  history: {
    requested: { at: r.created_at },
    ...(r.seller_decision_at && { sellerReview: { at: r.seller_decision_at } }),
  },
})

const mapRefund = (r) => ({
  id: r.id,
  returnId: r.return_request_id,
  orderId: r.order_id,
  productName: r.product_name,
  amount: Number(r.amount),
  status: r.status,
  processedAt: r.processed_at,
  createdAt: r.created_at,
})

// ---- orders
export async function getCustomerOrders({ signal } = {}) {
  const { orders } = await request('/api/customer/orders', { signal })
  return orders.map(mapOrder)
}

export async function getCustomerOrder(id, { signal } = {}) {
  const { order } = await request(`/api/customer/orders/${encodeURIComponent(id)}`, { signal })
  return mapOrder(order)
}

// ---- returns
export async function getCustomerReturns({ signal } = {}) {
  const { returns } = await request('/api/customer/returns', { signal })
  return returns.map(mapReturn)
}

// The return plus the price of the returned line, which the return itself does not
// carry. The price comes from the customer's own order (same API). If that extra
// lookup fails the return still shows, just without a price.
export async function getCustomerReturn(id, { signal } = {}) {
  const { return: row } = await request(`/api/customer/returns/${encodeURIComponent(id)}`, { signal })
  const ret = mapReturn(row)
  try {
    const order = await getCustomerOrder(ret.orderId, { signal })
    const line = order.items.find((i) => i.id === ret.orderItemId)
    if (line) ret.product = { ...ret.product, price: line.unitPrice, quantity: line.quantity }
  } catch (err) {
    if (err.name === 'AbortError') throw err
  }
  return ret
}

// Only these three fields are sent. Customer, order, product and status are decided by the backend.
export async function createCustomerReturn({ orderItemId, reason, description }, { signal } = {}) {
  const body = { orderItemId, reason, ...(description?.trim() && { description: description.trim() }) }
  const { return: row } = await request('/api/customer/returns', { method: 'POST', body, signal })
  return mapReturn(row)
}

// ---- refunds
export async function getCustomerRefunds({ signal } = {}) {
  const { refunds } = await request('/api/customer/refunds', { signal })
  return refunds.map(mapRefund)
}

// ---- dashboard: the API has no dashboard endpoint, so the overview is derived from the
// three list endpoints (the customer's own orders, returns and refunds).
const FINISHED_RETURNS = ['SELLER_REJECTED', 'INSPECTION_REJECTED', 'REFUNDED', 'COMPLETED']
const RECENT = 3

export async function getCustomerDashboard({ signal } = {}) {
  const [orders, returns, refunds] = await Promise.all([getCustomerOrders({ signal }), getCustomerReturns({ signal }), getCustomerRefunds({ signal })])
  return {
    stats: {
      totalOrders: orders.length,
      activeReturns: returns.filter((r) => !FINISHED_RETURNS.includes(r.status)).length,
      pendingPickups: returns.filter((r) => r.status === 'PICKUP_ASSIGNED').length,
      refundsCompleted: refunds.filter((r) => r.status === 'COMPLETED').length,
    },
    recentOrders: orders.slice(0, RECENT),
    recentReturns: returns.slice(0, RECENT),
  }
}
