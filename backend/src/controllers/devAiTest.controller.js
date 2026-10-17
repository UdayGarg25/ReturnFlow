import * as scenario from '../services/aiTestScenario.service.js'
import { handle } from '../utils/http.js'

// Development-only (see aiTestScenario.service.js). The caller is an authenticated WAREHOUSE user; what gets created
// belongs to a dedicated test customer, never to a real one.
export const list = handle(async () => ({ body: { enabled: true, customerName: scenario.TEST_CUSTOMER_NAME, scenarios: await scenario.listScenarios() } }))
export const create = handle(async (req) => ({ status: 201, body: await scenario.createScenario(req.file) }))
export const remove = handle(async () => ({ body: await scenario.removeScenarios() }))
