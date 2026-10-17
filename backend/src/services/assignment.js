// Who gets the work when a return moves to the next stage. Deliberately simple for this prototype:
// the default pickup agent / warehouse staff member is the oldest account with that role (lowest id).
// There is no dispatch screen and no load balancing yet. Returns null when nobody has that role, in which
// case the caller leaves the return where it is instead of failing.
export async function defaultPickupAgent(client) {
  const { rows } = await client.query(`SELECT id FROM users WHERE role = 'PICKUP_AGENT' ORDER BY id LIMIT 1`)
  return rows[0]?.id ?? null
}

export async function defaultWarehouseStaff(client) {
  const { rows } = await client.query(`SELECT id FROM users WHERE role = 'WAREHOUSE' ORDER BY id LIMIT 1`)
  return rows[0]?.id ?? null
}
