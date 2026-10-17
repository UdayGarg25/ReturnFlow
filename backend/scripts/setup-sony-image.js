// Usage: npm run setup:sony-image
// Puts the demo product's original image in the private S3 bucket and records its object key on the one verified
// product: Sam's Sony WH-1000XM5 that Alice's guided-demo order (order 28) contains. Safe to run again: the key is
// fixed, so a rerun overwrites the same object with the same bytes. Changes nothing else; prints no credentials.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import pool from '../src/config/db.js'
import { S3_BUCKET, s3 } from '../src/config/s3.js'
import { deleteObject, getObject, uploadObject } from '../src/services/storage.service.js'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'demo-products', 'sony-wh1000xm5.png')
const KEY = 'products/demo/sony-wh1000xm5.png'
const CONTENT_TYPE = 'image/png'
const MAX_BYTES = 2 * 1024 * 1024 // a product picture, not a poster
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const fail = (message) => { throw new Error(message) }

// 1. the local file: real PNG signature (not just the extension), dimensions from the IHDR chunk, sane size
async function validateLocalImage() {
  let bytes
  try { bytes = await readFile(FILE) } catch { fail(`Image not found at backend/assets/demo-products/sony-wh1000xm5.png`) }
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('ascii', 12, 16) !== 'IHDR') fail('The file is not a valid PNG.')
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (width < 100 || height < 100 || width > 6000 || height > 6000) fail(`Unreasonable dimensions: ${width}x${height}.`)
  if (bytes.length > MAX_BYTES) fail(`The file is ${bytes.length} bytes; the limit for a product image is ${MAX_BYTES}.`)
  console.log(`local image: PNG ${width}x${height}, ${bytes.length} bytes - valid`)
  return bytes
}

// 2. the product: Sam's Sony WH-1000XM5 on Alice's guided order (order 28), found through the real relationships
async function findProduct() {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.image_url, p.image_key
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       JOIN users c ON c.id = o.customer_id AND LOWER(c.email) = 'alice@returnflow.test'
       JOIN users s ON s.id = p.seller_id AND LOWER(s.email) = 'sam@returnflow.test' AND s.role = 'SELLER'
      WHERE o.id = 28 AND p.name = 'Sony WH-1000XM5' AND p.description LIKE 'SKU SNY-WH1000XM5-BLK%'`,
  )
  if (rows.length !== 1) fail(`Expected exactly one matching product, found ${rows.length}. Nothing was changed.`)
  console.log(`product: id ${rows[0].id} "${rows[0].name}" (Sam's, on Alice's order 28)`)
  return rows[0]
}

const objectExists = async () => {
  try { await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: KEY })); return true } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound') return false
    throw e
  }
}

try {
  const bytes = await validateLocalImage()
  const product = await findProduct()
  const existedBefore = await objectExists()

  await uploadObject({ key: KEY, body: bytes, contentType: CONTENT_TYPE }) // private: no ACL is ever set
  console.log(`upload: ok (${existedBefore ? 'same key reused' : 'new object'})`)
  try {
    const back = await getObject(KEY)
    if (!back.body.equals(bytes) || back.contentType !== CONTENT_TYPE) fail('Read-back does not match the uploaded file.')
    console.log(`read back: ok (${back.body.length} bytes, ${back.contentType})`)

    const { rowCount } = await pool.query('UPDATE products SET image_key = $1 WHERE id = $2', [KEY, product.id])
    if (rowCount !== 1) fail('The product row was not updated.')
    console.log('database: image_key saved (image_url left as it was)')
  } catch (err) {
    // Remove the object only if THIS run created it; an object that already existed may be in use.
    if (!existedBefore) await deleteObject(KEY).then(() => console.error('cleanup: the new object was removed'), (e) => console.error(`cleanup FAILED, remove ${KEY} by hand (${e.name})`))
    throw err
  }
  console.log('RESULT: done')
} catch (err) {
  console.error('setup failed:', err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
