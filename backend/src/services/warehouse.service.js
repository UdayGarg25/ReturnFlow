import pool from '../config/db.js'
import { conflict, forbidden, notFound, validationError } from '../utils/http.js'

const PG_UNIQUE_VIOLATION = '23505'
const CONDITIONS = ['UNOPENED', 'LIKE_NEW', 'USED', 'DAMAGED', 'WRONG_ITEM']
const OPEN_INSPECTION = ['PENDING', 'IN_PROGRESS', 'MANUAL_REVIEW']
const AT_WAREHOUSE = ['WAREHOUSE_RECEIVED', 'INSPECTION'] // return statuses that may be decided

// The inspection queue is shared by all warehouse staff (they can all see it), but a
// decision can only be made by the staff member the inspection is assigned to, and
// only while the inspection and its return are in the right state.
const SELECT = `
  SELECT i.id, i.return_request_id, i.status, i.condition, i.notes, i.warehouse_staff_id,
         i.ai_product_match, i.ai_damage_detected, i.ai_damage_type, i.ai_confidence, i.ai_result,
         i.created_at, i.updated_at,
         a.status AS ai_status, (a.result->>'manualReviewRequired')::boolean AS ai_manual_review,
         rr.status AS return_status, rr.reason, p.name AS product_name, u.name AS customer_name
    FROM inspections i
    JOIN return_requests rr ON rr.id = i.return_request_id
    JOIN products p ON p.id = rr.product_id
    JOIN users u ON u.id = rr.customer_id
    LEFT JOIN ai_assessments a ON a.inspection_id = i.id`

export async function listInspections() {
  const { rows } = await pool.query(`${SELECT} ORDER BY i.created_at DESC, i.id DESC`)
  return rows
}

export async function getInspection(inspectionId) {
  const { rows } = await pool.query(`${SELECT} WHERE i.id = $1`, [inspectionId])
  if (rows.length === 0) throw notFound('Inspection')
  return rows[0]
}

// decision: { decision: 'approve' | 'reject', condition, notes }
export async function decideInspection(staffId, inspectionId, input) {
  const { decision, condition, notes } = input ?? {}
  const fieldErrors = {}
  if (decision !== 'approve' && decision !== 'reject') fieldErrors.decision = 'Choose approve or reject.'
  if (!CONDITIONS.includes(condition)) fieldErrors.condition = 'Choose the condition of the item.'
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 2000)) fieldErrors.notes = 'Notes must be text of at most 2000 characters.'
  else if (decision === 'reject' && (typeof notes !== 'string' || notes.trim().length < 5)) fieldErrors.notes = 'Explain why the return is rejected.'
  if (Object.keys(fieldErrors).length > 0) throw validationError('Invalid inspection decision.', fieldErrors)

  const approved = decision === 'approve'
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Lock the inspection and its return so two decisions cannot interleave.
    const found = await client.query(
      `SELECT i.status, i.warehouse_staff_id, i.return_request_id, rr.status AS return_status,
              rr.customer_id, oi.unit_price, oi.quantity
         FROM inspections i
         JOIN return_requests rr ON rr.id = i.return_request_id
         JOIN order_items oi ON oi.id = rr.order_item_id
        WHERE i.id = $1
          FOR UPDATE OF i, rr`,
      [inspectionId],
    )
    if (found.rowCount === 0) throw notFound('Inspection')
    const row = found.rows[0]
    if (row.warehouse_staff_id !== staffId) throw forbidden('This inspection is assigned to another staff member.')
    if (!OPEN_INSPECTION.includes(row.status) || !AT_WAREHOUSE.includes(row.return_status)) {
      throw conflict('This inspection has already been decided or is not ready to decide.')
    }

    await client.query(
      `UPDATE inspections SET status = $1, condition = $2, notes = $3 WHERE id = $4`,
      [approved ? 'APPROVED' : 'REJECTED', condition, notes?.trim() || null, inspectionId],
    )
    await client.query(`UPDATE return_requests SET status = $1 WHERE id = $2`, [approved ? 'REFUND_PENDING' : 'INSPECTION_REJECTED', row.return_request_id])
    if (approved) {
      // the refund amount and customer come from the database (the order line), never from the client
      await client.query(
        `INSERT INTO refunds (return_request_id, customer_id, amount, status) VALUES ($1, $2, $3, 'PENDING')`,
        [row.return_request_id, row.customer_id, Number(row.unit_price) * row.quantity],
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === PG_UNIQUE_VIOLATION) throw conflict('A refund already exists for this return.')
    throw err
  } finally {
    client.release()
  }
  return getInspection(inspectionId)
}
