// Date-range helpers shared by the dashboards, using the real current time.
export const DAY = 24 * 60 * 60 * 1000

export const endOfToday = () => {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

export const startOfDay = (offsetDays = 0) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return new Date(d.getTime() + offsetDays * DAY)
}

// First instant of a "last N days" window (today counts as day 1).
export const rangeStart = (days) => startOfDay(-(days - 1))

// range: 'all' or a number of days as a string ('7', '30', '90')
export function isInRange(iso, range) {
  if (range === 'all') return true
  const t = new Date(iso)
  return t >= rangeStart(Number(range)) && t <= endOfToday()
}

// 'all' | 'today' | 'N' (days)
export function matchesDateFilter(iso, filter) {
  if (filter === 'today') {
    const t = new Date(iso).getTime()
    return t >= startOfDay(0).getTime() && t <= endOfToday().getTime()
  }
  return isInRange(iso, filter)
}

const labelFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

// Splits a range into chart buckets: 7 daily, 30 -> 6 x 5 days, 90 -> 6 x 15 days.
export function buildBuckets(range) {
  const days = range === 'all' ? 90 : Number(range)
  const count = days === 7 ? 7 : 6
  const size = days / count
  const start = rangeStart(days).getTime()
  return Array.from({ length: count }, (_, i) => {
    const from = start + i * size * DAY
    return { from, to: from + size * DAY, label: labelFormat.format(new Date(from)) }
  })
}

export const inBucket = (iso, b) => {
  const t = new Date(iso).getTime()
  return t >= b.from && t < b.to
}

// "Good morning" / "Good afternoon" / "Good evening"
export function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
