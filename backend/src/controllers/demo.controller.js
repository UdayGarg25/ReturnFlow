import { authConfig } from '../config/auth.js'
import * as demo from '../services/demo.service.js'
import { setAuthCookie } from '../utils/cookies.js'
import { handle } from '../utils/http.js'
import { generateToken } from '../utils/jwt.js'

// 404 for everything but /status when the demo is switched off (production default)
export function requireDemo(req, res, next) {
  return demo.DEMO_ENABLED ? next() : res.status(404).json({ message: 'Not found' })
}

export const status = (req, res) => res.json({ enabled: demo.DEMO_ENABLED })

export const scenario = handle(async () => ({ body: { scenario: await demo.getScenario() } }))

// POST /api/demo/session { role }  ->  the same session cookie a normal login sets, for a FIXED demo account.
export const session = handle(async (req) => {
  const user = await demo.resolveDemoSession(req.body?.role, req.cookies?.[authConfig.cookieName])
  setAuthCookie(req.res, generateToken({ userId: user.id }))
  return { body: { user: { name: user.name, role: user.role } } }
})

const step = (fn) => handle(async () => {
  await fn()
  return { body: { scenario: await demo.getScenario() } }
})
export const reset = step(demo.reset)
