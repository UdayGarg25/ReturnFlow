import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatSlot } from '../utils/format.js'
import { pickupLabel } from '../utils/labels.js'
import { statusMeta } from '../utils/status.js'
import StatusBadge from './StatusBadge.jsx'

const dotTones = { amber: 'bg-amber-500', green: 'bg-emerald-500', red: 'bg-red-500', blue: 'bg-brand-600', slate: 'bg-slate-400' }

// One open pickup: id, when it was assigned, customer, product, reason and status. The whole
// card links to the pickup. Meant to sit inside a <ul>.
export default function PickupCard({ pickup }) {
  const dot = dotTones[statusMeta(pickup.status).tone]
  return (
    <li className="group relative flex gap-3 pb-4 last:pb-0">
      <span aria-hidden="true" className="absolute left-[5px] top-4 -ml-px h-full w-0.5 bg-slate-200 group-last:hidden" />
      <span aria-hidden="true" className={`relative z-10 mt-4 h-3 w-3 shrink-0 rounded-full ring-4 ring-white ${dot}`} />
      <Link
        to={`/dashboard/pickups/${pickup.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-brand-600/40 hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold text-slate-900">{pickupLabel(pickup.id)}</span>
            <time dateTime={pickup.assignedAt} className="text-xs text-slate-500">Assigned {formatSlot(pickup.assignedAt)}</time>
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-800">{pickup.customerName}</p>
          <p className="truncate text-xs text-slate-500">{pickup.product.name} &middot; {pickup.reason}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={pickup.status} />
          <span className="flex items-center text-xs font-medium text-brand-600">
            View <ChevronRight size={14} aria-hidden="true" />
          </span>
        </div>
      </Link>
    </li>
  )
}
