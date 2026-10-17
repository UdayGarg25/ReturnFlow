// Standard white content card with an optional heading row.
export default function Card({ title, action, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-navy-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
