const R = 46
const C = 2 * Math.PI * R

// segments: [{ label, value, color }]
export default function DonutChart({ segments, centerLabel = 'Total', ariaLabel }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  // each segment starts where the previous one ended
  const arcs = segments.map((s, i) => {
    const before = segments.slice(0, i).reduce((sum, p) => sum + p.value, 0)
    return { ...s, length: (s.value / total) * C, offset: (before / total) * C }
  })

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
      <svg viewBox="0 0 120 120" role="img" aria-label={ariaLabel} className="h-40 w-40 shrink-0">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
        {arcs.map(({ length, offset, ...s }) => (
            <circle
              key={s.label}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${Math.max(length - 2, 0)} ${C - Math.max(length - 2, 0)}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
        ))}
        <text x="60" y="58" textAnchor="middle" className="fill-navy-900 text-[22px] font-bold">{total}</text>
        <text x="60" y="73" textAnchor="middle" className="fill-slate-500 text-[9px]">{centerLabel}</text>
      </svg>

      <ul className="w-full max-w-xs space-y-2.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-slate-700">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="text-slate-500">
              <span className="font-semibold text-slate-900">{s.value}</span> ({Math.round((s.value / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
