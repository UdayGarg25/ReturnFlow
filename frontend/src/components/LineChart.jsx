import { useState } from 'react'
import useElementWidth from '../hooks/useElementWidth.js'

const M = { top: 12, right: 12, bottom: 28 }

// Rounds the axis maximum up to a "nice" number so ticks land on clean values.
function niceMax(max) {
  if (max <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(max))
  const n = max / pow
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return nice * pow
}

// Smooth path with horizontal control points (never overshoots the data).
function smoothPath(points) {
  return points.reduce((d, [x, y], i) => {
    if (i === 0) return `M${x},${y}`
    const [px, py] = points[i - 1]
    const mx = (px + x) / 2
    return `${d} C${mx},${py} ${mx},${y} ${x},${y}`
  }, '')
}

// data:   [{ label, [series.key]: number }]
// series: [{ key, label, color }]
export default function LineChart({ data, series, height = 260, formatValue = (v) => v, formatTick = formatValue, integerTicks = false, area = false, ariaLabel }) {
  const [ref, width] = useElementWidth()
  const [hover, setHover] = useState(null)

  const dataMax = Math.max(...data.flatMap((d) => series.map((s) => d[s.key])))
  // counts need whole-number ticks: round the top up to a multiple of the 4 intervals
  const yMax = integerTicks ? Math.max(4, Math.ceil(dataMax / 4) * 4) : niceMax(dataMax)
  const ticks = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i)
  const left = Math.max(...ticks.map((t) => String(formatTick(t)).length)) * 7 + 14
  const innerW = Math.max(width - left - M.right, 10)
  const innerH = height - M.top - M.bottom

  const x = (i) => left + (data.length === 1 ? innerW / 2 : (i * innerW) / (data.length - 1))
  const y = (v) => M.top + innerH - (v / yMax) * innerH
  const step = data.length > 1 ? innerW / (data.length - 1) : innerW
  const labelEvery = Math.max(1, Math.ceil(56 / step))

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - rect.left - left) / innerW) * (data.length - 1))
    setHover(Math.min(data.length - 1, Math.max(0, i)))
  }

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block max-w-full touch-pan-y">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={left + innerW} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{formatTick(t)}</text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.label} x={x(i)} y={height - 8} textAnchor={i === data.length - 1 && data.length > 1 ? 'end' : 'middle'} className="fill-slate-400 text-[11px]">{d.label}</text>
          ) : null,
        )}

        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + innerH} stroke="#cbd5e1" />}

        {series.map((s) => {
          const pts = data.map((d, i) => [x(i), y(d[s.key])])
          return (
            <g key={s.key}>
              {area && (
                <path d={`${smoothPath(pts)} L${pts.at(-1)[0]},${y(0)} L${pts[0][0]},${y(0)} Z`} fill={s.color} opacity="0.1" />
              )}
              <path d={smoothPath(pts)} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
              {hover !== null && <circle cx={pts[hover][0]} cy={pts[hover][1]} r="4.5" fill="#fff" stroke={s.color} strokeWidth="2.25" />}
            </g>
          )
        })}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-card"
          style={{ left: Math.min(Math.max(x(hover) + 12, 0), Math.max(width - 140, 0)) }}
        >
          <p className="mb-1 font-semibold text-slate-900">{data[hover].label}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4 text-slate-600">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold text-slate-900">{formatValue(data[hover][s.key])}</span>
            </p>
          ))}
        </div>
      )}

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr><th>Period</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}><th>{d.label}</th>{series.map((s) => <td key={s.key}>{formatValue(d[s.key])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
