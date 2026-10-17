import pool from '../config/db.js'
import { conflict, notFound, validationError } from '../utils/http.js'
import { defaultWarehouseStaff } from './assignment.js'

// A pickup agent only ever sees and changes pickups assigned to THEM
// (pickup_assignments.agent_id = req.user.id). Someone else's pickup is "not found".

// What an agent may do, from each state. ASSIGNED/ACCEPTED are the only open states.
const TRANSITIONS = {
  ASSIGNED: ['ACCEPTED', 'FAILED'],
  ACCEPTED: ['PICKED_UP', 'FAILED'],
}

const SELECT = `
  SELECT pa.id, pa.return_request_id, pa.status, pa.assigned_at, pa.picked_up_at,
         p.name AS product_name, u.name AS customer_name, rr.reason
    FROM pickup_assignments pa
    JOIN return_requests rr ON rr.id = pa.return_request_id
    JOIN products p ON p.id = rr.product_id
    JOIN users u ON u.id = rr.customer_id`

export async function listAssignments(agentId) {
  const { rows } = await pool.query(`${SELECT} WHERE pa.agent_id = $1 ORDER BY pa.assigned_at DESC, pa.id DESC`, [agentId])
  return rows
}

export async function getAssignment(agentId, pickupId) {
  const { rows } = await pool.query(`${SELECT} WHERE pa.id = $1 AND pa.agent_id = $2`, [pickupId, agentId])
  if (rows.length === 0) throw notFound('Pickup')
  return rows[0]
}

// Moves one of the agent's own pickups forward. Marking it PICKED_UP also hands the item to the warehouse in the
// same transaction, so the tables can never disagree: the return becomes WAREHOUSE_RECEIVED and a PENDING
// inspection is opened for a warehouse staff member. (If no warehouse staff exist the return stays PICKED_UP.)
export async function updateStatus(agentId, pickupId, next) {
  if (!['ACCEPTED', 'PICKED_UP', 'FAILED'].includes(next)) {
    throw validationError('Status must be ACCEPTED, PICKED_UP or FAILED.', { status: 'Choose a valid status.' })
  }

  const current = await getAssignment(agentId, pickupId) // 404 unless assigned to this agent
  if (!TRANSITIONS[current.status]?.includes(next)) {
    throw conflict(`A pickup that is ${current.status} cannot be changed to ${next}.`)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // agent_id and the old status are part of the UPDATE: no gap between check and change
    const updated = await client.query(
      `UPDATE pickup_assignments
          SET status = $1::text,
              picked_up_at = CASE WHEN $1::text = 'PICKED_UP' THEN NOW() ELSE picked_up_at END
        WHERE id = $2 AND agent_id = $3 AND status = $4
        RETURNING return_request_id`,
      [next, pickupId, agentId, current.status],
    )
    if (updated.rowCount === 0) throw conflict('This pickup was just changed. Reload and try again.')
    if (next === 'PICKED_UP') {
      const returnId = updated.rows[0].return_request_id
      const staffId = await defaultWarehouseStaff(client)
      if (staffId) {
        await client.query(`INSERT INTO inspections (return_request_id, warehouse_staff_id, status) VALUES ($1, $2, 'PENDING') ON CONFLICT (return_request_id) DO NOTHING`, [returnId, staffId])
      }
      await client.query(`UPDATE return_requests SET status = $2 WHERE id = $1 AND status = 'PICKUP_ASSIGNED'`, [returnId, staffId ? 'WAREHOUSE_RECEIVED' : 'PICKED_UP'])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return getAssignment(agentId, pickupId)
}
