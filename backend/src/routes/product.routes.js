import { Router } from 'express';
import * as c from '../controllers/product.controller.js';

const router = Router();

// Public product catalog endpoints (read-heavy, safe to cache, no private data)
router.get('/', c.listProducts);
router.get('/:id', c.getProduct);

export default router;

