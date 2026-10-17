import { Check, X } from 'lucide-react'
import { formatDateTime } from '../utils/format.js'

const currentTones = {
  amber: { ring: 'border-amber-500', dot: 'bg-amber-500', text: 'text-amber-700' },
  blue: { ring: 'border-brand-600', dot: 'bg-brand-600', text: 'text-brand-700' },
}

const stateLabel = { done: 'Completed', current: 'Current step', pending: 'Not started', rejected: 'Rejected' }

function Marker({ state, tone }) {
  if (state === 'done')
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check size={14} strokeWidth={3} aria-hidden="true" />
      </span>
    )
  if (state === 'rejected')
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white">
        <X size={14} strokeWidth={3} aria-hidden="true" />
      </span>
    )
  if (state === 'current')
    return (
      <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white ${currentTones[tone].ring}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${currentTones[tone].dot}`} />
      </span>
    )
  return <span className="block h-6 w-6 rounded-full border-2 border-slate-200 bg-white" />
}

// items: [{ key, title, description?, date?, state: 'done'|'current'|'pending'|'rejected' }]
export default function Timeline({ items, currentTone = 'blue' }) {
  return (
    <ol>
      {items.map((item, i) => {
        const last = i === items.length - 1
        const titleColor =
          item.state === 'pending'
            ? 'text-slate-500'
            : item.state === 'rejected'
              ? 'text-red-700'
              : item.state === 'current'
                ? currentTones[currentTone].text
                : 'text-slate-900'
        return (
          <li key={item.key} aria-current={item.state === 'current' ? 'step' : undefined} className="relative flex gap-3 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden="true"
                className={`absolute left-3 top-6 -ml-px h-[calc(100%-1.5rem)] w-0.5 ${item.state === 'done' ? 'bg-emerald-300' : 'bg-slate-200'}`}
              />
            )}
            <span className="relative z-10 shrink-0">
              <Marker state={item.state} tone={currentTone} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className={`text-sm font-semibold ${titleColor}`}>
                  {item.title}
                  <span className="sr-only"> ({stateLabel[item.state]})</span>
                </p>
                {item.date && <time dateTime={item.date} className="text-xs text-slate-500">{formatDateTime(item.date)}</time>}
              </div>
              {item.description && <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
