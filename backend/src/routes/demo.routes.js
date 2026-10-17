import { Router } from 'express'
import * as c from '../controllers/demo.controller.js'
import { demoLimiter } from '../middleware/rateLimit.middleware.js'

// Public on purpose (the demo page is for visitors who are not logged in). What these can do is
// limited in demo.service.js: four fixed accounts, one fixed order line, nothing else.
const router = Router()
router.get('/status', c.status)
router.use(c.requireDemo, demoLimiter)
router.get('/scenario', c.scenario)
router.post('/session', c.session)
router.post('/reset', c.reset)

export default router
