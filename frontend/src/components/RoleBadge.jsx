import { ROLE_LABELS } from '../utils/roles.js'

const tones = {
  CUSTOMER: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  SELLER: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  PICKUP_AGENT: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  WAREHOUSE: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  ADMIN: 'bg-slate-100 text-slate-700 ring-slate-500/20',
}

// Small uppercase chip with the role's colour.
export default function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-0.5 text-xs font-semibold uppercase ring-1 ring-inset ${tones[role] ?? tones.ADMIN}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}
