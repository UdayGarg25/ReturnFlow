import * as customer from '../services/customer.service.js'
import * as images from '../services/returnImage.service.js'
import { handle, handleFile, parseId } from '../utils/http.js'

// The customer's identity is always req.user.id (set by `authenticate`), never a request value.
export const listOrders = handle(async (req) => ({ body: { orders: await customer.listOrders(req.user.id) } }))
export const getOrder = handle(async (req) => ({ body: { order: await customer.getOrder(req.user.id, parseId(req.params.id, 'Order')) } }))
export const listReturns = handle(async (req) => ({ body: { returns: await customer.listReturns(req.user.id) } }))
export const getReturn = handle(async (req) => ({ body: { return: await customer.getReturn(req.user.id, parseId(req.params.id, 'Return request')) } }))
export const createReturn = handle(async (req) => ({ status: 201, body: { return: await customer.createReturn(req.user.id, req.body) } }))
export const listRefunds = handle(async (req) => ({ body: { refunds: await customer.listRefunds(req.user.id) } }))

// Return images: the return id and image id come from the URL and are checked against req.user.id in the service.
export const listReturnImages = handle(async (req) => ({ body: { images: await images.listImages(req.user.id, parseId(req.params.returnId, 'Return request')) } }))
export const viewReturnImage = handleFile(async (req) => {
  const file = await images.getImageFile(req.user.id, parseId(req.params.returnId, 'Return request'), parseId(req.params.imageId, 'Image'))
  return {
    body: file.body,
    headers: { 'Content-Type': file.type, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300', Vary: 'Cookie' },
  }
})
export const addReturnImage = handle(async (req) => ({ status: 201, body: await images.addImage(req.user.id, parseId(req.params.returnId, 'Return request'), req.file) }))
export const deleteReturnImage = handle(async (req) => {
  await images.deleteImage(req.user.id, parseId(req.params.returnId, 'Return request'), parseId(req.params.imageId, 'Image'))
  return { body: { message: 'Image deleted.' } }
})
