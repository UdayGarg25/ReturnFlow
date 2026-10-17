import { ArrowDown, ArrowUp } from 'lucide-react'

const trendTones = {
  green: 'text-emerald-600',
  red: 'text-red-600',
  amber: 'text-amber-600',
  slate: 'text-slate-500',
}

// Optional `trend`: { text, direction?: 'up' | 'down', tone?: keyof trendTones }, `note` is muted text after it.
export default function StatCard({ icon: Icon, label, value, tone, trend, note }) {
  const trendTone = trendTones[trend?.tone ?? (trend?.direction === 'down' ? 'red' : 'green')]
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <div className="flex items-center gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="truncate text-3xl font-bold text-navy-900">{value}</p>
        </div>
      </div>
      {trend && (
        <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
          <span className={`flex items-center gap-0.5 font-medium ${trendTone}`}>
            {trend.direction === 'up' && <ArrowUp size={14} aria-hidden="true" />}
            {trend.direction === 'down' && <ArrowDown size={14} aria-hidden="true" />}
            {trend.text}
          </span>
          {note}
        </p>
      )}
    </div>
  )
}
