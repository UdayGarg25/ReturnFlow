import { statusMeta } from '../utils/status.js'

const tones = {
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

export default function StatusBadge({ status, className = '' }) {
  const { label, tone } = statusMeta(status)
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {label}
    </span>
  )
}
