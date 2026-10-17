import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'

const tones = {
  info: { box: 'border-blue-200 bg-blue-50 text-blue-900', icon: Info },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CircleCheck },
  warning: { box: 'border-orange-200 bg-orange-50 text-orange-900', icon: TriangleAlert },
  error: { box: 'border-red-200 bg-red-50 text-red-800', icon: CircleAlert },
}

// Inline status message. `action` is an optional node (e.g. an Undo button).
export default function Notice({ tone = 'info', children, action, className = '' }) {
  const { box, icon: Icon } = tones[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${box} ${className}`}>
      <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}
