import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

// items: [{ label, to? }]; the last item is the current page.
export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {item.to && !last ? (
                <Link to={item.to} className="rounded font-medium text-brand-600 hover:text-brand-700">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={last ? 'font-semibold text-slate-900' : ''}>
                  {item.label}
                </span>
              )}
              {!last && <ChevronRight size={14} aria-hidden="true" className="text-slate-400" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
