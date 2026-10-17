const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const shortDateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const slotFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const currencyFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

export const formatDate = (iso) => (iso ? dateFormat.format(new Date(iso)) : '')
export const formatShortDate = (iso) => (iso ? shortDateFormat.format(new Date(iso)) : '')
// "Apr 18, 10:00 AM" - year omitted for near-term schedules
export const formatSlot = (iso) => (iso ? slotFormat.format(new Date(iso)) : '')
export const formatDateTime = (iso) => (iso ? dateTimeFormat.format(new Date(iso)) : '')
// "Rohan Kumar" -> "RK"
export const initials = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
export const formatCurrency = (amount) => currencyFormat.format(amount)
