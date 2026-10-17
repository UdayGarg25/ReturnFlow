// One label/value row inside a <dl>. Stacks on mobile, 1/3 + 2/3 columns from sm.
export default function InfoRow({ label, children }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-900 sm:col-span-2">{children}</dd>
    </div>
  )
}
