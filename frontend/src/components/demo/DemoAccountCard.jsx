import CredentialsBox from './CredentialsBox.jsx'

// One pre-configured demo account (also used, with a different tone, for the admin).
export default function DemoAccountCard({ account }) {
  const Icon = account.icon
  return (
    <article className={`flex flex-col rounded-2xl border p-5 shadow-card ${account.card}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${account.badge}`}>
          <Icon size={22} aria-hidden="true" />
        </span>
        <h3 className="text-lg font-bold text-navy-900">{account.label}{account.role === 'ADMIN' ? '' : ` - ${account.name}`}</h3>
      </div>
      <p className="mt-3 text-sm text-slate-600">{account.description}</p>
      <CredentialsBox account={account} />
    </article>
  )
}
