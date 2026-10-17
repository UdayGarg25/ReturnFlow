import { Mail, Phone } from 'lucide-react'
import { initials } from '../utils/format.js'
import Card from './Card.jsx'

const link = 'min-w-0 truncate rounded hover:text-brand-700 hover:underline'

// Name, phone and email of a customer. Phone and email are optional (not every role sees them).
export default function CustomerInfoCard({ customer, title = 'Customer', children }) {
  return (
    <Card title={title}>
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
        >
          {initials(customer.name)}
        </span>
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-semibold text-slate-900">{customer.name}</p>
          {customer.phone && (
            <p className="flex items-center gap-2 text-slate-600">
              <Phone size={14} aria-hidden="true" className="shrink-0 text-slate-400" />
              <a href={`tel:${customer.phone.replace(/\s/g, '')}`} className={link}>{customer.phone}</a>
            </p>
          )}
          {customer.email && (
            <p className="flex items-center gap-2 text-slate-600">
              <Mail size={14} aria-hidden="true" className="shrink-0 text-slate-400" />
              <a href={`mailto:${customer.email}`} className={link}>{customer.email}</a>
            </p>
          )}
        </div>
      </div>
      {children}
    </Card>
  )
}
