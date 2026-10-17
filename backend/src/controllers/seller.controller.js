import * as seller from '../services/seller.service.js'
import { handle, parseId } from '../utils/http.js'

// The seller's identity is always req.user.id; a sellerId in the body is never read.
export const listProducts = handle(async (req) => ({ body: { products: await seller.listProducts(req.user.id) } }))
export const getProduct = handle(async (req) => ({ body: { product: await seller.getProduct(req.user.id, parseId(req.params.id, 'Product')) } }))
export const createProduct = handle(async (req) => ({ status: 201, body: { product: await seller.createProduct(req.user.id, req.body) } }))
export const updateProduct = handle(async (req) => ({ body: { product: await seller.updateProduct(req.user.id, parseId(req.params.id, 'Product'), req.body) } }))
export const deleteProduct = handle(async (req) => {
  await seller.deleteProduct(req.user.id, parseId(req.params.id, 'Product'))
  return { body: { message: 'Product deleted' } }
})
export const listOrders = handle(async (req) => ({ body: { orders: await seller.listOrders(req.user.id) } }))
export const getOrder = handle(async (req) => ({ body: { order: await seller.getOrder(req.user.id, parseId(req.params.id, 'Order')) } }))
export const listReturns = handle(async (req) => ({ body: { returns: await seller.listReturns(req.user.id) } }))
export const getReturn = handle(async (req) => ({ body: { return: await seller.getReturn(req.user.id, parseId(req.params.id, 'Return request')) } }))
export const decideReturn = handle(async (req) => ({ body: { return: await seller.decideReturn(req.user.id, parseId(req.params.id, 'Return request'), req.body?.decision) } }))
