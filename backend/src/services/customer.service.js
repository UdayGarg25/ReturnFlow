import pool from '../config/db.js'
import { conflict, notFound, validationError } from '../utils/http.js'

// Every query here is scoped to the logged-in customer (customerId comes from
// req.user, never from the request). A row that belongs to someone else is
// indistinguishable from one that does not exist: both are "not found".

const PG_UNIQUE_VIOLATION = '23505'
const RETURN_REASONS = ['DAMAGED', 'WRONG_ITEM', 'SIZE_ISSUE', 'NOT_AS_DESCRIBED', 'CHANGED_MIND', 'OTHER']

export async function listOrders(customerId) {
  const { rows } = await pool.query(
    `SELECT id, status, total_amount, created_at
       FROM orders
      WHERE customer_id = $1
      ORDER BY created_at DESC, id DESC`,
    [customerId],
  )
  return rows
}

export async function getOrder(customerId, orderId) {
  const order = await pool.query(
    `SELECT id, status, total_amount, created_at
       FROM orders
      WHERE id = $1 AND customer_id = $2`,
    [orderId, customerId],
  )
  if (order.rowCount === 0) throw notFound('Order')
  // the order is now known to be the customer's, so its items are too
  const items = await pool.query(
    `SELECT oi.id, oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY oi.id`,
    [orderId],
  )
  return { ...order.rows[0], items: items.rows }
}

export async function listReturns(customerId) {
  const { rows } = await pool.query(
    `SELECT rr.id, rr.order_id, rr.order_item_id, rr.product_id, p.name AS product_name,
            rr.reason, rr.status, rr.created_at
       FROM return_requests rr
       JOIN products p ON p.id = rr.product_id
      WHERE rr.customer_id = $1
      ORDER BY rr.created_at DESC, rr.id DESC`,
    [customerId],
  )
  return rows
}

export async function getReturn(customerId, returnId) {
  const result = await pool.query(
    `SELECT rr.id, rr.order_id, rr.order_item_id, rr.product_id, p.name AS product_name,
            rr.reason, rr.description, rr.status, rr.seller_decision_at, rr.created_at,
            (SELECT r.status FROM refunds r WHERE r.return_request_id = rr.id AND r.status <> 'CANCELLED' ORDER BY r.id DESC LIMIT 1) AS refund_status
       FROM return_requests rr
       JOIN products p ON p.id = rr.product_id
      WHERE rr.id = $1 AND rr.customer_id = $2`,
    [returnId, customerId],
  )
  if (result.rowCount === 0) throw notFound('Return request')
  return result.rows[0]
}

export async function listRefunds(customerId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.return_request_id, rr.order_id, p.name AS product_name, r.amount, r.status, r.processed_at, r.created_at
       FROM refunds r
       JOIN return_requests rr ON rr.id = r.return_request_id
       JOIN products p ON p.id = rr.product_id
      WHERE r.customer_id = $1
      ORDER BY r.created_at DESC, r.id DESC`,
    [customerId],
  )
  return rows
}

// Customer asks to return one line of one of THEIR delivered orders. Only the item id,
// reason and description come from the client; order and product ids are read from the
// database, so a customer cannot attach a return to someone else's order.
export async function createReturn(customerId, input) {
  const { orderItemId, reason, description } = input ?? {}
  const fieldErrors = {}
  if (!Number.isInteger(orderItemId) || orderItemId <= 0 || orderItemId > 2147483647) fieldErrors.orderItemId = 'Choose an item to return.'
  if (!RETURN_REASONS.includes(reason)) fieldErrors.reason = 'Choose a valid reason.'
  if (description !== undefined && description !== null && (typeof description !== 'string' || description.length > 1000)) fieldErrors.description = 'Description must be text of at most 1000 characters.'
  if (Object.keys(fieldErrors).length > 0) throw validationError('Invalid return request.', fieldErrors)

  const item = await pool.query(
    `SELECT oi.id, oi.order_id, oi.product_id, o.status AS order_status
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = $1 AND o.customer_id = $2`,
    [orderItemId, customerId],
  )
  if (item.rowCount === 0) throw notFound('Order item')
  const { order_id, product_id, order_status } = item.rows[0]
  if (order_status !== 'DELIVERED') throw conflict('Only delivered orders can be returned.')

  try {
    const result = await pool.query(
      `INSERT INTO return_requests (customer_id, order_id, order_item_id, product_id, reason, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, order_id, order_item_id, product_id, reason, description, status, created_at`,
      [customerId, order_id, orderItemId, product_id, reason, description?.trim() || null],
    )
    return result.rows[0]
  } catch (err) {
    // one open return per order item (partial unique index)
    if (err.code === PG_UNIQUE_VIOLATION) throw conflict('A return has already been requested for this item.')
    throw err
  }
}
