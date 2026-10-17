// Display ids. The numeric database id is what URLs and API calls use.
const pad = (id) => String(id).padStart(3, '0')
export const orderLabel = (id) => `ORD-${pad(id)}`
export const returnLabel = (id) => `RET-${pad(id)}`
export const productLabel = (id) => `PROD-${pad(id)}`
export const pickupLabel = (id) => `PICK-${pad(id)}`
export const inspectionLabel = (id) => `INS-${pad(id)}`
