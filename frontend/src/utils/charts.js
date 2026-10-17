// Chart colours. Order series match the status colours used by badges
// (green = delivered, blue = in progress, red = cancelled).
export const ORDER_SERIES = [
  { key: 'delivered', label: 'Delivered', color: '#10b981' },
  { key: 'processing', label: 'Processing', color: '#2563eb' },
  { key: 'cancelled', label: 'Cancelled', color: '#ef4444' },
]

const REASON_COLORS = {
  'Wrong size': '#2563eb',
  'Not as described': '#f59e0b',
  Damaged: '#ef4444',
  Defective: '#8b5cf6',
}
export const reasonColor = (reason) => REASON_COLORS[reason] ?? '#64748b'
