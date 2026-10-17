import { Sparkles } from 'lucide-react'
import { formatDateTime } from '../utils/format.js'
import Card from './Card.jsx'

const MATCH = { likely_match: 'Likely a match to the reference', possible_mismatch: 'Possible mismatch with the reference', inconclusive: 'Inconclusive' }
const DAMAGE = { visible_damage: 'Visible damage', no_visible_damage: 'No visible damage', inconclusive: 'Inconclusive' }

// What a seller may see of the AI assessment: a concise, persisted summary, or an honest "not available yet".
// Read-only. The seller cannot start or change it, and the warehouse still makes the final decision.
export default function AiSummaryCard({ summary }) {
  return (
    <Card title={<span className="flex items-center gap-2"><Sparkles size={18} aria-hidden="true" className="text-brand-600" /> AI Assessment</span>}>
      {summary?.status === 'COMPLETED' ? (
        <div className="space-y-3 text-sm">
          <dl className="divide-y divide-slate-100">
            <div className="flex justify-between gap-4 py-2"><dt className="text-slate-500">Product match</dt><dd className="text-right font-medium text-slate-900">{MATCH[summary.productMatch]}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-slate-500">Visible damage</dt><dd className="text-right font-medium text-slate-900">{DAMAGE[summary.damage]}{summary.damageTypes.length > 0 && ` (${summary.damageTypes.join(', ').replaceAll('_', ' ')})`}</dd></div>
          </dl>
          <p className="rounded-lg bg-slate-50 p-3 text-slate-700">{summary.summary}</p>
          {summary.limitations.length > 0 && <ul className="list-disc space-y-1 pl-5 text-slate-600">{summary.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          <p className="text-xs text-slate-500">Advisory only, generated {formatDateTime(summary.completedAt)}. {summary.manualReviewRequired ? 'The warehouse was advised to review the item manually. ' : ''}The warehouse makes the final decision.</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {summary?.status === 'RUNNING'
            ? 'The warehouse is running an AI assessment on this return. It will appear here when it is done.'
            : 'No AI assessment is available yet. It can appear after the item reaches the warehouse and staff run it. The warehouse makes the final decision either way.'}
        </p>
      )}
    </Card>
  )
}
