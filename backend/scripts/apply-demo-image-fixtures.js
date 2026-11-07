// Usage: node scripts/apply-demo-image-fixtures.js   (npm run db:demo-images)
// One-time, idempotent data fix for an EXISTING database seeded before the demo fixtures existed: the old seed pointed
// demo images at https://example.com/..., which never served an image. This rewrites ONLY those rows:
//   products.image_url               https://example.com/products/...  ->  demo-fixture:<picture>  (or NULL if the product has no picture)
//   return_requests.customer_image_url  https://example.com/returns/...  ->  the returned product's fixture (or NULL)
// Nothing else is touched: no reset, no reseed, no other columns, no row whose URL is not on example.com. A fresh seed
// (seed-demo.sql) already writes the new values.
import pool from '../src/config/db.js'

const FIXTURE_BY_PRODUCT_NAME = {
  'iPhone 16 128GB': 'iphone-16.jpg',
  'Samsung Galaxy S25': 'samsung-galaxy-s25.jpg',
  'Sony WH-1000XM5': 'sony-wh-1000xm5.jpg',
  'Apple AirPods Pro 2': 'apple-airpods-pro-2.jpg',
  'Apple Watch Series 10': 'apple-watch-series-10.jpg',
  'Logitech MX Master 3S': 'logitech-mx-master-3s.jpg',
  'Mi Smart Band 8': 'xiaomi-mi-smart-band-8.jpg',
}
const ref = (name) => (FIXTURE_BY_PRODUCT_NAME[name] ? `demo-fixture:${FIXTURE_BY_PRODUCT_NAME[name]}` : null)

const client = await pool.connect()
try {
  await client.query('BEGIN')
  const products = (await client.query(`SELECT id, name FROM products WHERE image_url LIKE 'https://example.com/%'`)).rows
  for (const p of products) await client.query('UPDATE products SET image_url = $2 WHERE id = $1', [p.id, ref(p.name)])
  const returns = (await client.query(
    `SELECT rr.id, p.name FROM return_requests rr JOIN products p ON p.id = rr.product_id WHERE rr.customer_image_url LIKE 'https://example.com/%'`,
  )).rows
  for (const r of returns) await client.query('UPDATE return_requests SET customer_image_url = $2 WHERE id = $1', [r.id, ref(r.name)])
  await client.query('COMMIT')
  console.log(`products updated: ${products.length}, return requests updated: ${returns.length}`)
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('failed, nothing changed:', err.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
