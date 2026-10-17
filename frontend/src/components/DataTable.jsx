// Table on wide screens, stacked cards below (no horizontal scrolling on phones or
// tablets). Tables with 7+ columns need xl width, narrower ones fit from md.
// columns: [{ header, render(row), align?, action? }]
//   - the first column becomes the card title on mobile
//   - `action` columns are rendered as the card footer on mobile
export default function DataTable({ columns, rows, getKey }) {
  const [primary, ...rest] = columns
  const view = columns.length >= 7 ? { table: 'hidden overflow-x-auto xl:block', cards: 'grid gap-3 sm:grid-cols-2 xl:hidden' } : { table: 'hidden overflow-x-auto md:block', cards: 'grid gap-3 sm:grid-cols-2 md:hidden' }
  const fields = rest.filter((c) => !c.action)
  const actions = rest.filter((c) => c.action)

  return (
    <>
      <div className={view.table}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {columns.map((c, i) => (
                <th
                  key={c.header}
                  scope="col"
                  className={`px-4 py-3 ${i === 0 ? 'rounded-l-lg' : ''} ${i === columns.length - 1 ? 'rounded-r-lg' : ''} ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getKey(row)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                {columns.map((c) => (
                  <td key={c.header} className={`px-4 py-3.5 text-slate-700 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={view.cards}>
        {rows.map((row) => (
          <li key={getKey(row)} className="min-w-0 rounded-xl border border-slate-200 p-4">
            <div className="font-semibold text-navy-900">{primary.render(row)}</div>
            <dl className="mt-3 space-y-2 text-sm">
              {fields.map((c) => (
                <div key={c.header} className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">{c.header}</dt>
                  <dd className="text-right text-slate-800">{c.render(row)}</dd>
                </div>
              ))}
            </dl>
            {actions.length > 0 && (
              <div className="mt-4 flex gap-2">{actions.map((c) => <div key={c.header} className="flex-1 [&>*]:w-full">{c.render(row)}</div>)}</div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
