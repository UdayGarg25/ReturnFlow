import { PackageOpen } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Logo({ to = '/', dark = false, className = '' }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2.5 rounded-lg text-xl font-bold tracking-tight ${className}`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/30">
        <PackageOpen size={20} aria-hidden="true" />
      </span>
      <span className={dark ? 'text-white' : 'text-navy-900'}>
        Return<span className="text-brand-600">Flow</span>
      </span>
    </Link>
  )
}
