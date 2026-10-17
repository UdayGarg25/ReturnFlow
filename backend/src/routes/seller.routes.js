import { Router } from 'express'
import * as c from '../controllers/seller.controller.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authorize, ROLES } from '../middleware/role.middleware.js'

const router = Router()
router.use(authenticate, authorize(ROLES.SELLER))

router.get('/products', c.listProducts)
router.post('/products', c.createProduct)
router.get('/products/:id', c.getProduct)
router.put('/products/:id', c.updateProduct)
router.delete('/products/:id', c.deleteProduct)
router.get('/orders', c.listOrders)
router.get('/orders/:id', c.getOrder)
router.get('/returns', c.listReturns)
router.get('/returns/:id', c.getReturn)
router.post('/returns/:id/decision', c.decideReturn)

export default router
