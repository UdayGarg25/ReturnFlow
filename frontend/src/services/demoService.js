// Public demo helpers (/api/demo/*). The guided demo does all of its real work (request, approve, pickup,
// inspect) through the normal business APIs; these calls only read the scenario, switch to a fixed demo
// account and reset the guided order. The backend limits them to four fixed demo accounts and one fixed order line.
import { request } from './authApi.js'

export async function getDemoEnabled({ signal } = {}) {
  const { enabled } = await request('/api/demo/status', { signal })
  return enabled
}

export async function getScenario({ signal } = {}) {
  const { scenario } = await request('/api/demo/scenario', { signal })
  return scenario
}

// role: CUSTOMER | SELLER | PICKUP_AGENT | WAREHOUSE. Sets the normal session cookie for the fixed demo account.
export const startDemoSession = (role) => request('/api/demo/session', { method: 'POST', body: { role } })

// Puts the guided order back to "delivered, not yet returned" (removes only that order's return chain).
export const resetScenario = () => request('/api/demo/reset', { method: 'POST' })
