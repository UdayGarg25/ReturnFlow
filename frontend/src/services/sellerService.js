// Seller data, from the real API (/api/seller/*). Every call carries the session cookie
// (credentials: 'include', see request() in authApi.js); the backend decides which seller
// is asking and returns only that seller's products, orders and returns. There is no
// mock fallback: a failed call throws an ApiError for the screen to show.
//
// API rows use snake_case; the mapping to the shape the screens use happens ONLY here.
import { request } from './authApi.js'
import { buildBuckets, inBucket, isInRange } from '../utils/ranges.js'
import { reasonLabel } from '../utils/returnReasons.js'

// ---------------------------------------------------------------- mapping ----
const mapProduct = (p) => ({
  id: p.id,
  name: p.name,
  description: p.description ?? '',
  price: Number(p.price), // NUMERIC arrives as a string
  imageUrl: p.image_url ?? '',
  createdAt: p.created_at,
  updatedAt: p.updated_at,
})

// The API returns only THIS seller's lines of an order, so `total` is the seller's share.
const mapOrder = (o) => {
  const items = o.items.map((i) => ({ id: i.id, productId: i.productId, name: i.productName, quantity: i.quantity, unitPrice: Number(i.unitPrice) }))
  return {
    id: o.id,
    status: o.status,
    placedAt: o.created_at,
    customerName: o.customer_name,
    items,
    total: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
  }
}

const mapReturn = (r) => ({
  id: r.id,
  orderId: r.order_id,
  product: { id: r.product_id, name: r.product_name },
  customerName: r.customer_name,
  reasonCode: r.reason,
  reason: reasonLabel(r.reason),
  description: r.description ?? '',
  status: r.status,
  requestedAt: r.created_at,
  aiSummary: r.ai_summary ?? null, // advisory AI summary from the warehouse, only on the detail view
  // the only lifecycle timestamps the API provides, in the shape the timeline expects
  history: {
    requested: { at: r.created_at },
    ...(r.seller_decision_at && { sellerReview: { at: r.seller_decision_at } }),
  },
})

// -------------------------------------------------------------- products ----
export async function getSellerProducts({ signal } = {}) {
  const { products } = await request('/api/seller/products', { signal })
  return products.map(mapProduct)
}

export async function getSellerProduct(id, { signal } = {}) {
  const { product } = await request(`/api/seller/products/${encodeURIComponent(id)}`, { signal })
  return mapProduct(product)
}

// Only these fields are sent. The owner is always the logged-in seller (the backend ignores any other).
const productBody = ({ name, description, price, imageUrl }) => ({ name, description: description || null, price, imageUrl: imageUrl || null })

export async function createSellerProduct(values, { signal } = {}) {
  const { product } = await request('/api/seller/products', { method: 'POST', body: productBody(values), signal })
  return mapProduct(product)
}

export async function updateSellerProduct(id, values, { signal } = {}) {
  const { product } = await request(`/api/seller/products/${encodeURIComponent(id)}`, { method: 'PUT', body: productBody(values), signal })
  return mapProduct(product)
}

export async function deleteSellerProduct(id, { signal } = {}) {
  await request(`/api/seller/products/${encodeURIComponent(id)}`, { method: 'DELETE', signal })
}

// ---------------------------------------------------------------- orders ----
export async function getSellerOrders({ signal } = {}) {
  const { orders } = await request('/api/seller/orders', { signal })
  return orders.map(mapOrder)
}

export async function getSellerOrder(id, { signal } = {}) {
  const { order } = await request(`/api/seller/orders/${encodeURIComponent(id)}`, { signal })
  return mapOrder(order)
}

// ---------------------------------------------------------------- returns ----
export async function getSellerReturns({ signal } = {}) {
  const { returns } = await request('/api/seller/returns', { signal })
  return returns.map(mapReturn)
}

export async function getSellerReturn(id, { signal } = {}) {
  const { return: row } = await request(`/api/seller/returns/${encodeURIComponent(id)}`, { signal })
  return mapReturn(row)
}

// decision: 'approve' | 'reject'. The backend checks the return is on this seller's product and still pending.
export async function decideSellerReturn(id, decision, { signal } = {}) {
  const { return: row } = await request(`/api/seller/returns/${encodeURIComponent(id)}/decision`, { method: 'POST', body: { decision }, signal })
  return mapReturn(row)
}

// ------------------------------------------------------------ dashboard ----
// There is no dashboard endpoint: the overview and analytics are computed from the
// three real lists, so every number traces back to the database.
export async function getSellerData({ signal } = {}) {
  const [products, orders, returns] = await Promise.all([getSellerProducts({ signal }), getSellerOrders({ signal }), getSellerReturns({ signal })])
  return { products, orders, returns }
}

export const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]
export const ORDER_RANGE_OPTIONS = [{ value: 'all', label: 'All time' }, ...RANGE_OPTIONS]

const PROCESSING = ['PENDING', 'CONFIRMED', 'SHIPPED']
const FINISHED_RETURNS = ['REFUNDED', 'COMPLETED']
const sales = (orders) => orders.filter((o) => o.status !== 'CANCELLED').reduce((sum, o) => sum + o.total, 0)

function figures({ products, orders, returns }, range) {
  const o = orders.filter((x) => isInRange(x.placedAt, range))
  const r = returns.filter((x) => isInRange(x.requestedAt, range))
  return {
    orders: o,
    returns: r,
    totalProducts: products.length,
    totalOrders: o.length,
    totalSales: sales(o),
    returnRequests: r.length,
    pendingReturns: r.filter((x) => x.status === 'RETURN_REQUESTED').length,
    refunded: r.filter((x) => FINISHED_RETURNS.includes(x.status)).length,
  }
}

export function computeOverview(data, range) {
  const f = figures(data, range)
  const chart = buildBuckets(range).map((b) => {
    const inB = f.orders.filter((x) => inBucket(x.placedAt, b))
    return {
      label: b.label,
      delivered: inB.filter((x) => x.status === 'DELIVERED').length,
      processing: inB.filter((x) => PROCESSING.includes(x.status)).length,
      cancelled: inB.filter((x) => x.status === 'CANCELLED').length,
    }
  })
  const total = (key) => chart.reduce((sum, d) => sum + d[key], 0)
  return {
    ...f,
    chart,
    chartTotals: { delivered: total('delivered'), processing: total('processing'), cancelled: total('cancelled') },
    recentReturns: [...data.returns].sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)).slice(0, 3),
  }
}

export function computeAnalytics(data, range) {
  const f = figures(data, range)
  const salesTrend = buildBuckets(range).map((b) => ({ label: b.label, sales: sales(f.orders.filter((x) => inBucket(x.placedAt, b))) }))
  const counts = new Map()
  for (const x of f.returns) counts.set(x.reason, (counts.get(x.reason) ?? 0) + 1)
  const reasons = [...counts.entries()].map(([reason, value]) => ({ reason, value })).sort((a, b) => b.value - a.value)
  return { ...f, salesTrend, reasons }
}
