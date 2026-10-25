import pool from '../config/db.js'
import { getSellerSummary } from './aiInspection.service.js'
import { defaultPickupAgent } from './assignment.js'
import { conflict, notFound, validationError } from '../utils/http.js'
import { cacheService } from './cache.service.js'
import { invalidateCatalogCache } from './product.service.js'

// Every query is scoped to the logged-in seller (sellerId comes from req.user).
// A product, order or return that belongs to another seller is "not found". A
// sellerId in a request body is never read.

// ON DELETE RESTRICT reports 23001 (restrict_violation); other referencing FKs report 23503
const PG_REFERENCED = ['23001', '23503']

// ------------------------------------------------------------------ products ----
const PRODUCT_COLUMNS = 'id, name, description, price, image_url, created_at, updated_at'

function validateProduct(input) {
  const { name, description, price, imageUrl } = input ?? {}
  const fieldErrors = {}

  const cleanName = typeof name === 'string' ? name.trim() : ''
  if (cleanName.length < 2 || cleanName.length > 200) fieldErrors.name = 'Name must be 2 to 200 characters.'

  if (description !== undefined && description !== null && (typeof description !== 'string' || description.length > 2000)) fieldErrors.description = 'Description must be text of at most 2000 characters.'

  const priceText = typeof price === 'number' ? String(price) : price
  if (typeof priceText !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(priceText.trim())) fieldErrors.price = 'Enter a valid price, e.g. 120 or 99.50.'

  if (imageUrl !== undefined && imageUrl !== null && imageUrl !== '') {
    let ok = typeof imageUrl === 'string' && imageUrl.length <= 500
    if (ok) {
      try {
        ok = ['http:', 'https:'].includes(new URL(imageUrl).protocol)
      } catch {
        ok = false
      }
    }
    if (!ok) fieldErrors.imageUrl = 'Image URL must be a valid http(s) address.'
  }

  if (Object.keys(fieldErrors).length > 0) throw validationError('Invalid product.', fieldErrors)
  return { name: cleanName, description: description?.trim() || null, price: priceText.trim(), imageUrl: imageUrl || null }
}

export async function listProducts(sellerId) {
  return cacheService.remember(`rf:seller:${sellerId}:products`, 60, async () => {
    const { rows } = await pool.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE seller_id = $1 ORDER BY id`, [sellerId])
    return rows
  })
}

export async function getProduct(sellerId, productId) {
  const { rows } = await pool.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 AND seller_id = $2`, [productId, sellerId])
  if (rows.length === 0) throw notFound('Product')
  return rows[0]
}

// The product always belongs to the authenticated seller.
export async function createProduct(sellerId, input) {
  const p = validateProduct(input)
  const { rows } = await pool.query(
    `INSERT INTO products (seller_id, name, description, price, image_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PRODUCT_COLUMNS}`,
    [sellerId, p.name, p.description, p.price, p.imageUrl],
  )
  const product = rows[0]
  await Promise.allSettled([
    invalidateCatalogCache(product.id),
    cacheService.del(`rf:seller:${sellerId}:products`),
  ])
  return product
}

// Ownership is part of the UPDATE itself, so there is no gap between "check" and "change".
export async function updateProduct(sellerId, productId, input) {
  const p = validateProduct(input)
  const { rows } = await pool.query(
    `UPDATE products
        SET name = $3, description = $4, price = $5, image_url = $6
      WHERE id = $1 AND seller_id = $2
      RETURNING ${PRODUCT_COLUMNS}`,
    [productId, sellerId, p.name, p.description, p.price, p.imageUrl],
  )
  if (rows.length === 0) throw notFound('Product')
  const product = rows[0]
  await Promise.allSettled([
    invalidateCatalogCache(productId),
    cacheService.del(`rf:seller:${sellerId}:products`),
  ])
  return product
}

export async function deleteProduct(sellerId, productId) {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 AND seller_id = $2', [productId, sellerId])
    if (result.rowCount === 0) throw notFound('Product')
    await Promise.allSettled([
      invalidateCatalogCache(productId),
      cacheService.del(`rf:seller:${sellerId}:products`),
    ])
  } catch (err) {
    // order history references the product (ON DELETE RESTRICT): keep the record
    if (PG_REFERENCED.includes(err.code)) throw conflict('This product has orders or returns and cannot be deleted.')
    throw err
  }
}

// -------------------------------------------------------------------- orders ----
// Orders that contain at least one of this seller's products, showing ONLY this seller's lines.
const ORDER_SELECT = `
  SELECT o.id, o.status, o.created_at, u.name AS customer_name,
         json_agg(json_build_object('id', oi.id, 'productId', p.id, 'productName', p.name,
                                    'quantity', oi.quantity, 'unitPrice', oi.unit_price) ORDER BY oi.id) AS items
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id AND p.seller_id = $1
    JOIN users u ON u.id = o.customer_id`

export async function listOrders(sellerId) {
  const { rows } = await pool.query(`${ORDER_SELECT} GROUP BY o.id, u.name ORDER BY o.created_at DESC, o.id DESC`, [sellerId])
  return rows
}

export async function getOrder(sellerId, orderId) {
  const { rows } = await pool.query(`${ORDER_SELECT} WHERE o.id = $2 GROUP BY o.id, u.name`, [sellerId, orderId])
  if (rows.length === 0) throw notFound('Order')
  return rows[0]
}

// ------------------------------------------------------------------- returns ----
const RETURN_SELECT = `
  SELECT rr.id, rr.order_id, rr.product_id, p.name AS product_name, u.name AS customer_name,
         rr.reason, rr.description, rr.status, rr.seller_decision_at, rr.created_at
    FROM return_requests rr
    JOIN products p ON p.id = rr.product_id AND p.seller_id = $1
    JOIN users u ON u.id = rr.customer_id`

export async function listReturns(sellerId) {
  const { rows } = await pool.query(`${RETURN_SELECT} ORDER BY rr.created_at DESC, rr.id DESC`, [sellerId])
  return rows
}

export async function getReturn(sellerId, returnId) {
  const { rows } = await pool.query(`${RETURN_SELECT} WHERE rr.id = $2`, [sellerId, returnId])
  if (rows.length === 0) throw notFound('Return request')
  // the short, advisory AI summary (ownership was just checked by the query above)
  return { ...rows[0], ai_summary: await getSellerSummary(returnId) }
}

// Seller approves or rejects a return on one of THEIR products. Only a pending request
// can be decided, and the status guard in the UPDATE makes a double click or a race harmless.
// Approving also hands the return to a pickup agent (a pickup_assignments row, return -> PICKUP_ASSIGNED)
// in the same transaction. If no pickup agent exists the return simply stays SELLER_APPROVED.
export async function decideReturn(sellerId, returnId, decision) {
  if (decision !== 'approve' && decision !== 'reject') throw validationError('Decision must be "approve" or "reject".', { decision: 'Choose approve or reject.' })
  const next = decision === 'approve' ? 'SELLER_APPROVED' : 'SELLER_REJECTED'

  const current = await getReturn(sellerId, returnId) // 404 unless it is on this seller's product
  if (current.status !== 'RETURN_REQUESTED') throw conflict('This return request has already been decided.')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE return_requests
          SET status = $1, seller_decision_at = NOW()
        WHERE id = $2 AND status = 'RETURN_REQUESTED'
          AND product_id IN (SELECT id FROM products WHERE seller_id = $3)
        RETURNING id`,
      [next, returnId, sellerId],
    )
    if (rows.length === 0) throw conflict('This return request has already been decided.')
    if (decision === 'approve') {
      const agentId = await defaultPickupAgent(client)
      if (agentId) {
        await client.query(`INSERT INTO pickup_assignments (return_request_id, agent_id, status) VALUES ($1, $2, 'ASSIGNED')`, [returnId, agentId])
        await client.query(`UPDATE return_requests SET status = 'PICKUP_ASSIGNED' WHERE id = $1`, [returnId])
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  return getReturn(sellerId, returnId)
}
