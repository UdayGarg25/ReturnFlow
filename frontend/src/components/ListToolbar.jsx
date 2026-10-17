import { Search } from 'lucide-react'
import FilterSelect from './FilterSelect.jsx'

// Search box plus any number of filters, shared by every list page.
// filters: [{ value, onChange, label, options }]
export default function ListToolbar({ query, onQueryChange, searchLabel, searchPlaceholder, filters }) {
  // With 3+ filters the single-row layout only fits on wide screens.
  const row = filters.length > 2 ? 'xl:flex-row xl:items-center xl:justify-between' : 'md:flex-row md:items-center md:justify-between'
  const search = filters.length > 2 ? 'xl:max-w-sm' : 'md:max-w-sm'
  return (
    <div className={`mb-5 flex flex-col gap-3 ${row}`}>
      <div className={`relative w-full ${search}`}>
        <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
          className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/25"
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {filters.map((f) => (
          <FilterSelect key={f.label} {...f} className="w-full sm:w-44" />
        ))}
      </div>
    </div>
  )
}
