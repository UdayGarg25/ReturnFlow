// Pickup agent data, from the real API (/api/pickups). Every call carries the session
// cookie; the backend returns only pickups assigned to the logged-in agent. There is no
// mock fallback: a failed call throws an ApiError for the screen to show.
//
// The API provides: id, return id, status, assigned time, picked-up time, product name,
// customer name and return reason. It has no address, phone, schedule or photos.
import { request } from './authApi.js'
import { reasonLabel } from '../utils/returnReasons.js'

const mapPickup = (p) => ({
  id: p.id,
  returnId: p.return_request_id,
  status: p.status,
  assignedAt: p.assigned_at,
  pickedUpAt: p.picked_up_at,
  product: { name: p.product_name },
  customerName: p.customer_name,
  reasonCode: p.reason,
  reason: reasonLabel(p.reason),
})

export const OPEN_STATUSES = ['ASSIGNED', 'ACCEPTED']
export const isOpenPickup = (p) => OPEN_STATUSES.includes(p.status)

export async function getPickups({ signal } = {}) {
  const { pickups } = await request('/api/pickups', { signal })
  return pickups.map(mapPickup)
}

export async function getPickup(id, { signal } = {}) {
  const { pickup } = await request(`/api/pickups/${encodeURIComponent(id)}`, { signal })
  return mapPickup(pickup)
}

// status: 'ACCEPTED' | 'PICKED_UP' | 'FAILED'. The backend checks the pickup is assigned to this
// agent and that the move is allowed (ASSIGNED -> ACCEPTED/FAILED, ACCEPTED -> PICKED_UP/FAILED).
export async function updatePickupStatus(id, status, { signal } = {}) {
  const { pickup } = await request(`/api/pickups/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status }, signal })
  return mapPickup(pickup)
}

// The overview is computed from the agent's own pickup list (there is no dashboard endpoint).
export async function getPickupDashboard({ signal } = {}) {
  const pickups = await getPickups({ signal })
  const count = (status) => pickups.filter((p) => p.status === status).length
  return {
    stats: { open: pickups.filter(isOpenPickup).length, pending: count('ASSIGNED'), accepted: count('ACCEPTED'), completed: count('PICKED_UP'), failed: count('FAILED') },
    open: pickups.filter(isOpenPickup).sort((a, b) => new Date(a.assignedAt) - new Date(b.assignedAt)),
  }
}
