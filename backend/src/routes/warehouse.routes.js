import { Router } from 'express'
import * as c from '../controllers/warehouse.controller.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { aiAssessmentLimiter } from '../middleware/rateLimit.middleware.js'
import { authorize, ROLES } from '../middleware/role.middleware.js'

const router = Router()
router.use(authenticate, authorize(ROLES.WAREHOUSE))

router.get('/inspections', c.list)
router.get('/inspections/:id', c.get)
router.post('/inspections/:id/decision', c.decide)

router.get('/inspections/:id/ai-assessment', c.getAiAssessment)
router.post('/inspections/:id/ai-assessment', aiAssessmentLimiter, c.startAiAssessment)
router.post('/inspections/:id/ai-assessment/retry', aiAssessmentLimiter, c.retryAiAssessment)
router.get('/inspections/:id/evidence/reference', c.referenceImage)
router.get('/inspections/:id/evidence/photos/:imageId', c.returnPhoto)

export default router
