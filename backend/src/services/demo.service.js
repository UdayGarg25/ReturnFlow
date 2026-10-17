// Public demo support. Everything here is deliberately narrow:
//
//  * session(): lets a visitor "continue as" one of FOUR fixed demo accounts (customer, seller,
//    pickup agent, warehouse). The browser sends only a role name from that list; the account is
//    looked up by a hard-coded email, never by an id the browser provides. ADMIN is not in the list.
//    The credentials of these accounts are public on the demo page anyway; this just saves typing
//    them while walking through the guided demo. It issues the same HttpOnly cookie as a normal
//    login and does not touch /api/auth/login. It refuses to replace the session of a real
//    (non-demo) user.
//  * scenario / reset: act on ONE fixed order line
//    (Alice's order 28: Sony WH-1000XM5 sold by Sam). Nothing else can be reached from here.
//    Every step of the story (request, approve, pickup, inspect) is done by the visitor through the normal business
//    APIs: approving assigns the pickup, marking it picked up opens the warehouse inspection, approving the
//    inspection creates the refund. This file only reads the scenario's state and can reset it.
//  * Nothing in this file sends email.
//
// Enabled by DEMO_ENABLED=true; when unset it is on outside production and off in production.
import pool from '../config/db.js'
import { conflict, notFound } from '../utils/http.js'
import { ServiceError } from '../utils/errors.js'
import { verifyToken } from '../utils/jwt.js'
import { deleteImagesOfReturns } from './returnImage.service.js'

export const DEMO_ENABLED = process.env.DEMO_ENABLED ? process.env.DEMO_ENABLED === 'true' : process.env.NODE_ENV !== 'production'

// role -> the one account it maps to
const SESSION_ACCOUNTS = Object.freeze({
  CUSTOMER: 'alice@returnflow.test',
  SELLER: 'sam@returnflow.test',
  PICKUP_AGENT: 'pete@returnflow.test',
  WAREHOUSE: 'wendy@returnflow.test',
})
const ADMIN_DEMO_EMAIL = 'admin@returnflow.test'
// A visitor may switch demo accounts only if they are logged out or already on a demo account.
const REPLACEABLE_EMAILS = new Set([...Object.values(SESSION_ACCOUNTS), ADMIN_DEMO_EMAIL])

const GUIDED_ORDER_ID = 28 // see seed-demo.sql
const DEMO_SKU = 'SNY-WH1000XM5-BLK'

// ----------------------------------------------------------------- session ----
// `currentToken`: the cookie the request already carries (may be absent or invalid).
export async function resolveDemoSession(role, currentToken) {
  const email = SESSION_ACCOUNTS[role]
  if (typeof role !== 'string' || !Object.hasOwn(SESSION_ACCOUNTS, role)) {
    throw new ServiceError('VALIDATION_ERROR', 'Choose Customer, Seller, Pickup Agent or Warehouse.', { fieldErrors: { role: 'Not a demo role.' } })
  }
  if (currentToken) {
    try {
      const { userId } = verifyToken(currentToken)
      const current = (await pool.query('SELECT email FROM users WHERE id = $1', [userId])).rows[0]
      if (current && !REPLACEABLE_EMAILS.has(current.email.toLowerCase())) {
        throw conflict('You are logged in with your own account. Log out first to try the demo.')
      }
    } catch (err) {
      if (err instanceof ServiceError) throw err // a bad/expired token just means "not logged in"
    }
  }
  // The role must really be what the database says for that fixed account.
  const { rows } = await pool.query('SELECT id, name, email, role FROM users WHERE LOWER(email) = $1 AND role = $2', [email, role])
  if (rows.length === 0) throw notFound('Demo account')
  return { id: rows[0].id, name: rows[0].name, role: rows[0].role }
}

// ---------------------------------------------------------------- scenario ----
async function loadScenario(db = pool, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT oi.id AS item_id, oi.quantity, oi.unit_price, o.id AS order_id, o.created_at AS ordered_at, o.status AS order_status,
            p.name AS product_name, p.description, c.name AS customer_name, s.name AS seller_name
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       JOIN users c ON c.id = o.customer_id AND LOWER(c.email) = $2
       JOIN users s ON s.id = p.seller_id AND LOWER(s.email) = $3
      WHERE o.id = $1 AND p.description LIKE $4`,
    [GUIDED_ORDER_ID, SESSION_ACCOUNTS.CUSTOMER, SESSION_ACCOUNTS.SELLER, `SKU ${DEMO_SKU}%`],
  )
  if (rows.length !== 1) throw notFound('Demo scenario')
  const item = rows[0]
  const ret = (await db.query(`SELECT id, status FROM return_requests WHERE order_item_id = $1 ORDER BY id DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [item.item_id])).rows[0]
  return { item, ret }
}

// Where the guided demo currently is, computed from the database rows.
export async function getScenario() {
  const { item, ret } = await loadScenario()
  let stage = 'READY', pickup, inspection, refund
  if (ret) {
    pickup = (await pool.query(`SELECT id, status FROM pickup_assignments WHERE return_request_id = $1 ORDER BY id DESC LIMIT 1`, [ret.id])).rows[0]
    inspection = (await pool.query(`SELECT id, status FROM inspections WHERE return_request_id = $1`, [ret.id])).rows[0]
    refund = (await pool.query(`SELECT id, amount, status FROM refunds WHERE return_request_id = $1 ORDER BY id DESC LIMIT 1`, [ret.id])).rows[0]
    const byReturn = {
      RETURN_REQUESTED: 'RETURN_REQUESTED',
      PICKUP_ASSIGNED: pickup?.status === 'ACCEPTED' ? 'PICKUP_ACCEPTED' : 'PICKUP_ASSIGNED',
      WAREHOUSE_RECEIVED: 'AT_WAREHOUSE',
      INSPECTION: 'AT_WAREHOUSE',
      REFUND_PENDING: 'REFUND_PENDING',
      REFUNDED: 'REFUNDED',
      COMPLETED: 'REFUNDED',
    }
    stage = byReturn[ret.status] ?? 'NEEDS_RESET' // e.g. seller rejected, or a state the guided demo does not cover
  }
  return {
    stage,
    product: { name: item.product_name, price: Number(item.unit_price) * item.quantity },
    order: { id: item.order_id, itemId: item.item_id, orderedAt: item.ordered_at, status: item.order_status },
    customerName: item.customer_name,
    sellerName: item.seller_name,
    returnId: ret?.id ?? null,
    returnStatus: ret?.status ?? null,
    pickupId: pickup?.id ?? null,
    inspectionId: inspection?.id ?? null,
    refund: refund ? { amount: Number(refund.amount), status: refund.status } : null,
  }
}

// Runs fn(client, { item, ret }) in one transaction with the scenario's return row locked.
async function inTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ctx = await loadScenario(client, { lock: true })
    const result = await fn(client, ctx)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
// Back to "delivered, not returned": removes ONLY the rows of the guided scenario's return. Safe to repeat.
export const reset = () => inTransaction(async (client, { item }) => {
  const ids = (await client.query('SELECT id FROM return_requests WHERE order_item_id = $1', [item.item_id])).rows.map((r) => r.id)
  if (ids.length === 0) return
  await deleteImagesOfReturns(client, ids) // S3 objects first; the return_images rows go with the return (cascade)
  await client.query('DELETE FROM refunds WHERE return_request_id = ANY($1)', [ids])
  await client.query('DELETE FROM inspections WHERE return_request_id = ANY($1)', [ids])
  await client.query('DELETE FROM pickup_assignments WHERE return_request_id = ANY($1)', [ids])
  await client.query('DELETE FROM return_requests WHERE id = ANY($1)', [ids])
})
