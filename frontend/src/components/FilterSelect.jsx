import { ChevronDown } from 'lucide-react'

// Compact native select used for filters and date ranges.
export default function FilterSelect({ value, onChange, label, options, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="block w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/25"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  )
}
