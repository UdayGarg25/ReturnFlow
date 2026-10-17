import { randomUUID } from 'node:crypto'
import pool from '../config/db.js'
import { conflict, notFound, validationError } from '../utils/http.js'
import { MAX_IMAGE_BYTES } from '../middleware/upload.middleware.js'

// Customer evidence photos. The S3 side is loaded lazily, so the rest of the API still starts on a machine
// without AWS configuration (only these endpoints need it).
const storage = () => import('./storage.service.js')

export const MAX_IMAGES_PER_RETURN = 2
// Photos can be added or removed only until the item is collected: after that the warehouse is judging it.
const EDITABLE_STATUSES = ['RETURN_REQUESTED', 'SELLER_APPROVED', 'PICKUP_ASSIGNED']

// What the file really is, from its first bytes (the client-sent type is not trusted). SVG, PDF, text etc. match nothing.
const SIGNATURES = [
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', ext: 'webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
]

export function checkImageFile(file) {
  if (!file?.buffer || file.buffer.length === 0) throw validationError('Choose an image to upload.', { image: 'No image received.' })
  if (file.size > MAX_IMAGE_BYTES) throw validationError('The image is larger than 5 MB.', { image: 'At most 5 MB.' })
  const real = SIGNATURES.find((s) => s.test(file.buffer))
  if (!real || file.mimetype !== real.type) throw validationError('Only JPEG, PNG or WebP images are accepted.', { image: 'Unsupported image type.' })
  return real
}

const toImage = (r) => ({ id: r.id, returnRequestId: r.return_request_id, imageType: r.image_type, createdAt: r.created_at })

// Locks the customer's own return row (404 if it is not theirs) so uploads/deletes for one return take turns.
async function lockOwnReturn(client, customerId, returnId, { editable }) {
  const { rows } = await client.query('SELECT status FROM return_requests WHERE id = $1 AND customer_id = $2 FOR UPDATE', [returnId, customerId])
  if (rows.length === 0) throw notFound('Return request')
  if (editable && !EDITABLE_STATUSES.includes(rows[0].status)) throw conflict('Photos can no longer be changed for this return.')
}

async function inTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function listImages(customerId, returnId) {
  const { rows } = await pool.query(
    `SELECT i.id, i.return_request_id, i.image_type, i.created_at
       FROM return_images i JOIN return_requests rr ON rr.id = i.return_request_id
      WHERE i.return_request_id = $1 AND rr.customer_id = $2 ORDER BY i.id`,
    [returnId, customerId],
  )
  if (rows.length === 0) await inTransaction((c) => lockOwnReturn(c, customerId, returnId, { editable: false })) // 404 unless it is theirs
  return rows.map(toImage)
}

// Order: ownership (404) -> status (409) -> count (409) -> file (400) -> S3 -> row. The return row stays locked until
// COMMIT, so two simultaneous uploads cannot both see "1 image" and create a third. If the row cannot be saved after
// the object reached S3, the object is deleted again.
export async function addImage(customerId, returnId, file) {
  return inTransaction(async (client) => {
    await lockOwnReturn(client, customerId, returnId, { editable: true })
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM return_images WHERE return_request_id = $1', [returnId])
    if (rows[0].n >= MAX_IMAGES_PER_RETURN) throw conflict(`Maximum ${MAX_IMAGES_PER_RETURN} images allowed per return request.`)
    const real = checkImageFile(file)

    const key = `returns/${returnId}/${randomUUID()}.${real.ext}` // generated here; the client never supplies a key
    const { uploadObject, deleteObject } = await storage()
    await uploadObject({ key, body: file.buffer, contentType: real.type })
    try {
      const saved = await client.query('INSERT INTO return_images (return_request_id, image_key, image_type) VALUES ($1, $2, $3) RETURNING id, return_request_id, image_type, created_at', [returnId, key, real.type])
      return toImage(saved.rows[0])
    } catch (err) {
      await deleteObject(key).catch((e) => console.error(`[images] could not remove S3 object after a failed insert (${e.name})`))
      throw err
    }
  })
}

// The S3 key is read from our own row, never from the request.
export async function deleteImage(customerId, returnId, imageId) {
  const { deleteObject } = await storage()
  await inTransaction(async (client) => {
    await lockOwnReturn(client, customerId, returnId, { editable: true })
    const { rows } = await client.query('DELETE FROM return_images WHERE id = $1 AND return_request_id = $2 RETURNING image_key', [imageId, returnId])
    if (rows.length === 0) throw notFound('Image')
    await deleteObject(rows[0].image_key) // S3 deletes of a missing key succeed; a real failure rolls the row delete back
  })
}

// The image itself, for the customer who owns the return. The bucket is private: the backend reads the object with its
// own credentials and streams it, so the browser never sees a bucket URL or a key. Allowed at any status (it is the
// customer's own photo). Content type comes from our row, not from S3.
export async function getImageFile(customerId, returnId, imageId) {
  const { rows } = await pool.query(
    `SELECT i.image_key, i.image_type
       FROM return_images i JOIN return_requests rr ON rr.id = i.return_request_id
      WHERE i.id = $1 AND i.return_request_id = $2 AND rr.customer_id = $3`,
    [imageId, returnId, customerId],
  )
  if (rows.length === 0) throw notFound('Image')
  const { getObject } = await storage()
  let object
  try {
    object = await getObject(rows[0].image_key)
  } catch (err) {
    if (err.name === 'NoSuchKey') throw notFound('Image')
    throw err
  }
  return { type: rows[0].image_type, body: object.body }
}

// For demo reset: remove the S3 objects of returns that are about to be deleted (their rows go with them by cascade).
export async function deleteImagesOfReturns(client, returnIds) {
  const { rows } = await client.query('SELECT image_key FROM return_images WHERE return_request_id = ANY($1)', [returnIds])
  if (rows.length === 0) return
  const { deleteObject } = await storage()
  for (const r of rows) await deleteObject(r.image_key).catch((e) => console.error(`[images] could not remove S3 object during reset (${e.name})`))
}
