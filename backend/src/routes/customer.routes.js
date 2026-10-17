import { Router } from 'express'
import * as c from '../controllers/customer.controller.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authorize, ROLES } from '../middleware/role.middleware.js'
import { uploadSingleImage } from '../middleware/upload.middleware.js'

const router = Router()
// authenticate FIRST (401 if not logged in), then the role check (403 if not a customer).
// Applied to the whole router, so no route in this file can be added unprotected.
router.use(authenticate, authorize(ROLES.CUSTOMER))

router.get('/orders', c.listOrders)
router.get('/orders/:id', c.getOrder)
router.get('/returns', c.listReturns)
router.post('/returns', c.createReturn)
router.get('/returns/:id', c.getReturn)
router.get('/refunds', c.listRefunds)

// Evidence photos for a return (max 2 per return). Same router guard as above: customers only.
router.get('/returns/:returnId/images', c.listReturnImages)
router.get('/returns/:returnId/images/:imageId/view', c.viewReturnImage)
router.post('/returns/:returnId/images', uploadSingleImage, c.addReturnImage)
router.delete('/returns/:returnId/images/:imageId', c.deleteReturnImage)

export default router
