import { Router } from 'express'
import * as c from '../controllers/admin.controller.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authorize, ROLES } from '../middleware/role.middleware.js'

const router = Router()
router.use(authenticate, authorize(ROLES.ADMIN))

router.get('/stats', c.stats)
router.get('/users', c.users)
router.get('/invitations', c.invitations)
router.post('/invitations', c.invite)
router.post('/invitations/:id/resend', c.resend)
router.post('/invitations/:id/cancel', c.cancel)

export default router
