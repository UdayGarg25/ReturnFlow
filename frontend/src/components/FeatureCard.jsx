export default function FeatureCard({ icon: Icon, title, description, tone }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon size={22} aria-hidden="true" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </div>
  )
}
