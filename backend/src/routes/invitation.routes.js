import { Router } from 'express'
import * as c from '../controllers/invitation.controller.js'
import { invitationLimiter } from '../middleware/rateLimit.middleware.js'

// Public on purpose: the unguessable one-time token in the URL is the credential.
const router = Router()
router.use(invitationLimiter)
router.get('/:token', c.show)
router.post('/:token/accept', c.accept)

export default router
