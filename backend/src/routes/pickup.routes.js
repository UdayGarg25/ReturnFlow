import { Router } from 'express'
import * as c from '../controllers/pickup.controller.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authorize, ROLES } from '../middleware/role.middleware.js'

const router = Router()
router.use(authenticate, authorize(ROLES.PICKUP_AGENT))

router.get('/', c.list)
router.get('/:id', c.get)
router.post('/:id/status', c.updateStatus)

export default router
