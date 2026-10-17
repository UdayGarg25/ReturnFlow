import { Router } from 'express'
import * as c from '../controllers/devAiTest.controller.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { aiAssessmentLimiter } from '../middleware/rateLimit.middleware.js'
import { authorize, ROLES } from '../middleware/role.middleware.js'
import { uploadSingleImage } from '../middleware/upload.middleware.js'

// Mounted by app.js ONLY when AI_TEST_SCENARIO=true and NODE_ENV is not production. Warehouse users only.
const router = Router()
router.use(authenticate, authorize(ROLES.WAREHOUSE))
router.get('/scenarios', c.list)
router.post('/scenarios', aiAssessmentLimiter, uploadSingleImage, c.create)
router.delete('/scenarios', c.remove)

export default router
