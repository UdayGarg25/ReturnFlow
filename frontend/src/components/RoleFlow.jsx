import { PackageOpen, Store, Truck, User, Warehouse } from 'lucide-react'

const roles = [
  { icon: User, title: 'Customer', hint: 'Request Return', tone: 'bg-blue-100 text-blue-600', pos: 'left-0 top-0' },
  { icon: Store, title: 'Seller', hint: 'Approve Return', tone: 'bg-emerald-100 text-emerald-600', pos: 'right-0 top-0' },
  { icon: Truck, title: 'Pickup Agent', hint: 'Collect Item', tone: 'bg-orange-100 text-orange-600', pos: 'bottom-0 left-0' },
  { icon: Warehouse, title: 'Warehouse', hint: 'Inspect & Process', tone: 'bg-violet-100 text-violet-600', pos: 'bottom-0 right-0' },
]

// Decorative diagram of the return lifecycle: Customer → Seller → Pickup Agent → Warehouse.
export default function RoleFlow() {
  return (
    <figure
      aria-label="Return flow: Customer, then Seller, then Pickup Agent, then Warehouse"
      className="relative mx-auto aspect-square w-full max-w-md"
    >
      <div aria-hidden="true" className="absolute inset-[12%] rounded-full border-2 border-dashed border-brand-100" />
      <div aria-hidden="true" className="absolute inset-[22%] rounded-full bg-gradient-to-br from-brand-100/70 to-indigo-100/40" />

      <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-200 to-amber-400 text-amber-900/80 shadow-xl shadow-amber-500/20 sm:h-32 sm:w-32">
        <PackageOpen size={56} strokeWidth={1.5} aria-hidden="true" />
      </div>

      {roles.map(({ icon: Icon, title, hint, tone, pos }, i) => (
        <div
          key={title}
          className={`absolute ${pos} flex w-[38%] flex-col items-center rounded-2xl border border-slate-200/70 bg-white p-3 text-center shadow-card`}
        >
          <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-navy-900 text-[10px] font-bold text-white">
            {i + 1}
          </span>
          <span className={`flex h-11 w-11 items-center justify-center rounded-full ${tone}`}>
            <Icon size={22} aria-hidden="true" />
          </span>
          <span className="mt-2 text-xs font-bold text-navy-900 sm:text-sm">{title}</span>
          <span className="text-[11px] text-slate-500 sm:text-xs">{hint}</span>
        </div>
      ))}
    </figure>
  )
}
