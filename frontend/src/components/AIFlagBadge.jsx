import { CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react'

const flags = {
  MANUAL: { label: 'Manual review', icon: TriangleAlert, className: 'text-orange-700' },
  CLEAR: { label: 'Clear', icon: CircleCheck, className: 'text-emerald-700' },
  NOT_RUN: { label: 'Not run', icon: CircleDashed, className: 'text-slate-500' },
}

// Did the AI assistant ask for a human look? (It never makes the decision.)
export default function AIFlagBadge({ flag }) {
  const { label, icon: Icon, className } = flags[flag]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${className}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  )
}
