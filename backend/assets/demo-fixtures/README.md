# Demo image fixtures

Local copies of the demo product pictures (same files and licenses as `frontend/public/products`, see `SOURCES.md` there).
Demo rows refer to them as `demo-fixture:<file name>` (for example `demo-fixture:iphone-16.jpg`) instead of an
`https://` URL. The backend reads them straight from this folder (`src/utils/demoFixtures.js`): no network request is
made, so they always load. Demo "customer return photos" reuse the product picture of the returned item; they are
sample data, not photographs of damage.
