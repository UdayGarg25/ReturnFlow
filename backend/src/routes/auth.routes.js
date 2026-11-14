import { Router } from 'express'
import * as authController from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { changePasswordLimiter, loginFailureLimiter, loginIpLimiter, registerLimiter } from '../middleware/rateLimit.middleware.js'

const router = Router()

router.post('/register', registerLimiter, authController.register)
router.post('/login', loginIpLimiter, loginFailureLimiter, authController.login)
router.get('/me', authenticate, authController.me)
router.post('/logout', authController.logout)
router.post('/change-password', authenticate, changePasswordLimiter, authController.changePassword)

export default router
