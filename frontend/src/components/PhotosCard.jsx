import { Images, Info } from 'lucide-react'
import { MAX_PHOTOS } from '../services/returnImageService.js'
import Notice from './Notice.jsx'

const TIPS = ['Upload clear photos of the item', 'Show the damage from different angles', 'Maximum 2 photos (JPG, PNG, WEBP)', 'Each photo must be 5 MB or less']

// Frame around the two photo slots: title, "n / 2 photos" counter, a status message and (optionally) tips.
export default function PhotosCard({ title = 'Return Photos', optional = false, count, intro, notice, tips = false, children }) {
  return (
    <section aria-label="Return photos" className="min-w-0 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-navy-900">
          <Images size={18} aria-hidden="true" className="text-brand-600" /> {title}
          {optional && <span className="text-sm font-normal text-slate-500">(Optional)</span>}
        </h2>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700" data-testid="photo-count">{count} / {MAX_PHOTOS} photos</span>
      </div>
      {intro && <p className="mt-2 text-sm text-slate-500">{intro}</p>}
      <div className="mt-4" aria-live="polite">{notice && <Notice tone={notice.tone} className="mb-4">{notice.text}</Notice>}</div>
      {children}
      {tips && (
        <div className="mt-5 rounded-xl bg-blue-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-700"><Info size={16} aria-hidden="true" /> Photo Tips</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
    </section>
  )
}
