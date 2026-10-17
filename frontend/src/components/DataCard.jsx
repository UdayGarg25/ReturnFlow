import { Link } from 'react-router-dom'
import EmptyState from './EmptyState.jsx'

// Dashboard summary card: header, "View All" link and a compact table.
// rows: [{ key, cells: [node, ...] }] - one cell per column.
export default function DataCard({ title, to, columns, rows, emptyTitle, emptyDescription }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        <Link to={to} className="rounded text-sm font-medium text-brand-600 hover:text-brand-700">
          View All
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="mt-4 overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {columns.map((c, i) => (
                  <th
                    key={c}
                    scope="col"
                    className={`whitespace-nowrap px-3 py-2.5 ${i === 0 ? 'rounded-l-lg' : ''} ${i === columns.length - 1 ? 'rounded-r-lg' : ''}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100 last:border-0">
                  {row.cells.map((cell, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-3 text-slate-700">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
