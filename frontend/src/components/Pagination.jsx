import { ChevronLeft, ChevronRight } from 'lucide-react'

const btn =
  'flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'

// 1 ... 4 5 6 ... 12 - always the first and last page plus a window around the current one.
function pageItems(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const items = [1]
  const from = Math.max(2, page - 1)
  const to = Math.min(pageCount - 1, page + 1)
  if (from > 2) items.push('gap-start')
  for (let n = from; n <= to; n++) items.push(n)
  if (to < pageCount - 1) items.push('gap-end')
  items.push(pageCount)
  return items
}

export default function Pagination({ page, pageSize, total, label, onChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row">
      <p className="text-sm text-slate-500">
        Showing {from} to {to} of {total} {label}
      </p>
      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
            className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50`}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          {pageItems(page, pageCount).map((n) =>
            typeof n === 'string' ? (
              <span key={n} aria-hidden="true" className="px-1 text-slate-400">&hellip;</span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                aria-label={`Page ${n}`}
                aria-current={n === page ? 'page' : undefined}
                className={`${btn} ${n === page ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => onChange(page + 1)}
            disabled={page === pageCount}
            aria-label="Next page"
            className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50`}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  )
}
