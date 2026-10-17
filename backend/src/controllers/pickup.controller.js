import * as pickups from '../services/pickup.service.js'
import { handle, parseId } from '../utils/http.js'

// The agent's identity is always req.user.id; a pickup is only reachable if it is assigned to them.
export const list = handle(async (req) => ({ body: { pickups: await pickups.listAssignments(req.user.id) } }))
export const get = handle(async (req) => ({ body: { pickup: await pickups.getAssignment(req.user.id, parseId(req.params.id, 'Pickup')) } }))
export const updateStatus = handle(async (req) => ({ body: { pickup: await pickups.updateStatus(req.user.id, parseId(req.params.id, 'Pickup'), req.body?.status) } }))
