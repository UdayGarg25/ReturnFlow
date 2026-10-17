import { Check, X } from 'lucide-react'
import { CONDITIONS, conditionLabel, isOpen } from '../utils/inspection.js'
import { formatDateTime } from '../utils/format.js'
import Button from './Button.jsx'
import Card from './Card.jsx'
import { SelectField, TextAreaField } from './FormField.jsx'
import StatusBadge from './StatusBadge.jsx'

// The human decision: condition + notes, then approve or reject (with a confirmation step).
// Presentational: the page owns the state. Only the assigned staff member can decide
// (`canDecide`); the backend enforces it as well.
//   draft:      { condition, notes }
//   errors:     { condition?, notes? }
//   confirming: null | 'approve' | 'reject'
export default function InspectionDecisionCard({ inspection, canDecide, busy, draft, errors, confirming, onDraftChange, onRequest, onConfirm, onCancelConfirm }) {
  // finished: read-only summary of what was decided
  if (!isOpen(inspection)) {
    return (
      <Card title="Inspection Decision">
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Result</dt>
            <dd><StatusBadge status={inspection.displayStatus} /></dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Condition</dt>
            <dd className="font-medium text-slate-900">{conditionLabel(inspection.condition)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Inspector</dt>
            <dd className="text-slate-900">{canDecide ? 'You' : `Staff #${inspection.staffId}`}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Completed</dt>
            <dd className="text-slate-900">{formatDateTime(inspection.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Notes</dt>
            <dd className="mt-1 rounded-lg bg-slate-50 p-3 text-slate-700">{inspection.notes || 'No notes.'}</dd>
          </div>
        </dl>
      </Card>
    )
  }

  if (!canDecide) {
    return (
      <Card title="Inspection Decision">
        <p className="text-sm text-slate-500">This inspection is assigned to another staff member, so only they can record the decision.</p>
      </Card>
    )
  }

  const approving = confirming === 'approve'
  const locked = Boolean(confirming) || busy
  return (
    <Card title="Inspection Decision">
      <div className="space-y-4">
        <SelectField
          label="Condition"
          required
          placeholder="Select condition"
          options={CONDITIONS}
          value={draft.condition}
          onChange={(e) => onDraftChange('condition', e.target.value)}
          error={errors.condition}
          disabled={locked}
        />
        <TextAreaField
          label="Inspection Notes"
          rows={4}
          placeholder="What did you find? Notes are required when rejecting."
          value={draft.notes}
          onChange={(e) => onDraftChange('notes', e.target.value)}
          error={errors.notes}
          hint={errors.notes ? undefined : 'Visible to the seller. Required when rejecting.'}
          disabled={locked}
        />
      </div>

      {confirming ? (
        <div
          role="alertdialog"
          aria-label={approving ? 'Confirm approval' : 'Confirm rejection'}
          className={`mt-5 rounded-xl border p-4 ${approving ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}
        >
          <p className={`text-sm font-semibold ${approving ? 'text-emerald-900' : 'text-red-900'}`}>
            {approving ? 'Approve this return?' : 'Reject this return?'}
          </p>
          <p className={`mt-1 text-sm ${approving ? 'text-emerald-800' : 'text-red-800'}`}>
            {approving
              ? `A refund will be created for ${inspection.customerName}. This cannot be undone.`
              : `${inspection.customerName} will be told the return failed inspection, and no refund will be issued. This cannot be undone.`}
          </p>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onCancelConfirm} disabled={busy}>Cancel</Button>
            <Button variant={approving ? 'success' : 'danger'} onClick={onConfirm} disabled={busy} autoFocus>
              {busy ? 'Saving...' : approving ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="success" size="lg" onClick={() => onRequest('approve')}>
            <Check size={16} aria-hidden="true" /> Approve Return
          </Button>
          <Button variant="danger" size="lg" onClick={() => onRequest('reject')}>
            <X size={16} aria-hidden="true" /> Reject Return
          </Button>
        </div>
      )}
    </Card>
  )
}
