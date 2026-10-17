import { Check, X } from 'lucide-react'
import { useState } from 'react'
import useApi from '../../hooks/useApi.js'
import { createCustomerReturn, getCustomerOrder, getCustomerRefunds, getCustomerReturn } from '../../services/customerService.js'
import { decideSellerReturn, getSellerReturns } from '../../services/sellerService.js'
import { getPickups, updatePickupStatus } from '../../services/pickupService.js'
import { decideInspection, getInspection } from '../../services/warehouseService.js'
import { formatCurrency, formatDate } from '../../utils/format.js'
import { CONDITIONS } from '../../utils/inspection.js'
import { pickupLabel, returnLabel } from '../../utils/labels.js'
import { ErrorState, LoadingState } from '../ApiState.jsx'
import Button from '../Button.jsx'
import { SelectField, TextAreaField } from '../FormField.jsx'
import ProductThumb from '../ProductThumb.jsx'
import StatusBadge from '../StatusBadge.jsx'

// Each panel is the real screen data of one role, loaded with that role's own session and changed through
// that role's own API. `run(action, message)` (from GuidedDemo) performs the action, shows the message and
// re-reads the scenario from the database.

const Box = ({ children }) => <div className="rounded-xl border border-slate-200 bg-white p-4">{children}</div>
const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right font-medium text-slate-900">{children}</dd>
  </div>
)

function Data({ state, children }) {
  if (state.loading) return <LoadingState label="Loading..." />
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />
  return children(state.data)
}

// ------------------------------------------------------------- 1. customer ----
export function CustomerPanel({ scenario, run, busy }) {
  const [description, setDescription] = useState('The left ear cup arrived scratched.')
  const order = useApi((signal) => getCustomerOrder(scenario.order.id, { signal }), [scenario.order.id])
  return (
    <Data state={order}>
      {(o) => {
        const line = o.items.find((i) => i.id === scenario.order.itemId)
        return (
          <div className="space-y-4">
            <Box>
              <div className="mb-2 flex items-center gap-3"><ProductThumb name={line.name} size="lg" /><p className="font-semibold text-navy-900">{line.name}</p></div>
              <dl className="divide-y divide-slate-100">
                <Row label="Product">{line.name}</Row>
                <Row label="Price">{formatCurrency(line.unitPrice * line.quantity)}</Row>
                <Row label="Order status"><StatusBadge status={o.status} /></Row>
                <Row label="Delivered">{formatDate(o.placedAt)}</Row>
              </dl>
            </Box>
            <SelectField label="Reason" options={[{ value: 'DAMAGED', label: 'Damaged' }]} value="DAMAGED" disabled onChange={() => {}} />
            <TextAreaField label="What went wrong?" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            <Button size="lg" disabled={busy} onClick={() => run(() => createCustomerReturn({ orderItemId: scenario.order.itemId, reason: 'DAMAGED', description }), 'Return requested. It is now waiting for the seller.')}>
              Request Return
            </Button>
          </div>
        )
      }}
    </Data>
  )
}

// --------------------------------------------------------------- 2. seller ----
export function SellerPanel({ scenario, run, busy }) {
  const returns = useApi((signal) => getSellerReturns({ signal }), [scenario.returnId])
  return (
    <Data state={returns}>
      {(list) => {
        const r = list.find((x) => x.id === scenario.returnId)
        if (!r) return <p className="text-sm text-slate-600">This return is not in the seller&apos;s list.</p>
        return (
          <div className="space-y-4">
            <Box>
              <p className="text-sm font-semibold text-navy-900">New return request #{returnLabel(r.id)}</p>
              <dl className="mt-2 divide-y divide-slate-100">
                <Row label="Product">{r.product.name}</Row>
                <Row label="Customer">{r.customerName}</Row>
                <Row label="Reason">{r.reason}</Row>
                <Row label="Description">{r.description || '-'}</Row>
                <Row label="Status"><StatusBadge status={r.status} /></Row>
              </dl>
            </Box>
            <Button variant="success" size="lg" disabled={busy} onClick={() => run(() => decideSellerReturn(r.id, 'approve'), 'The seller approved the return.')}>
              <Check size={16} aria-hidden="true" /> Approve Return
            </Button>
          </div>
        )
      }}
    </Data>
  )
}

// ---------------------------------------------------------- 3. pickup agent ----
export function PickupPanel({ scenario, run, busy }) {
  const pickups = useApi((signal) => getPickups({ signal }), [scenario.stage])
  const accepted = scenario.stage === 'PICKUP_ACCEPTED'
  return (
    <Data state={pickups}>
      {(list) => {
        const p = list.find((x) => x.id === scenario.pickupId)
        if (!p) return <p className="text-sm text-slate-600">This pickup is not assigned to the agent.</p>
        return (
          <div className="space-y-4">
            <Box>
              <p className="text-sm font-semibold text-navy-900">Assigned pickup {pickupLabel(p.id)}</p>
              <dl className="mt-2 divide-y divide-slate-100">
                <Row label="Item">{p.product.name}</Row>
                <Row label="Customer">{p.customerName}</Row>
                <Row label="Reason">{p.reason}</Row>
                <Row label="Status"><StatusBadge status={p.status} /></Row>
              </dl>
            </Box>
            {accepted ? (
              <Button size="lg" disabled={busy} onClick={() => run(() => updatePickupStatus(p.id, 'PICKED_UP'), 'The agent picked up the item.')}>Mark Picked Up</Button>
            ) : (
              <Button size="lg" disabled={busy} onClick={() => run(() => updatePickupStatus(p.id, 'ACCEPTED'), 'The agent accepted the pickup.')}>Accept Pickup</Button>
            )}
          </div>
        )
      }}
    </Data>
  )
}

// ------------------------------------------------------------ 4. warehouse ----
export function WarehousePanel({ scenario, run, busy }) {
  const inspection = useApi((signal) => getInspection(scenario.inspectionId, { signal }), [scenario.inspectionId])
  const [condition, setCondition] = useState('DAMAGED')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  return (
    <Data state={inspection}>
      {(i) => (
        <div className="space-y-4">
          <Box>
            <p className="text-sm font-semibold text-navy-900">Inspection ready for #{returnLabel(i.returnId)}</p>
            <dl className="mt-2 divide-y divide-slate-100">
              <Row label="Product">{i.product.name}</Row>
              <Row label="Customer">{i.customerName}</Row>
              <Row label="Reason">{i.reason}</Row>
              <Row label="Status"><StatusBadge status={i.displayStatus} /></Row>
            </dl>
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">An AI assessment is available on the full inspection screen when the item has a reference image and customer photos; it is advisory only. The warehouse staff member makes the final decision.</p>
          </Box>
          <SelectField label="Condition" options={CONDITIONS} value={condition} onChange={(e) => setCondition(e.target.value)} />
          <TextAreaField label="Inspection notes" rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); setError(null) }} error={error} hint={error ? undefined : 'Required when rejecting.'} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="success" size="lg" disabled={busy} onClick={() => run(() => decideInspection(i.id, { decision: 'approve', condition, notes }), 'The warehouse approved the return. A refund was created for the customer.')}>
              <Check size={16} aria-hidden="true" /> Approve Return
            </Button>
            <Button variant="danger" size="lg" disabled={busy} onClick={() => {
              if (notes.trim().length < 5) return setError('Add a short note explaining why the return is rejected.')
              run(() => decideInspection(i.id, { decision: 'reject', condition, notes }), 'The warehouse rejected the return. No refund will be issued.')
            }}>
              <X size={16} aria-hidden="true" /> Reject Return
            </Button>
          </div>
        </div>
      )}
    </Data>
  )
}

// ------------------------------------------------------- 5. refund / result ----
export function CompletedPanel({ scenario }) {
  const result = useApi(async (signal) => {
    const [ret, refunds] = await Promise.all([getCustomerReturn(scenario.returnId, { signal }), getCustomerRefunds({ signal })])
    return { ret, refund: refunds.find((r) => r.returnId === scenario.returnId) }
  }, [scenario.returnId])
  return (
    <Data state={result}>
      {({ ret, refund }) => (
        <div className="space-y-4">
          <Box>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={26} aria-hidden="true" /></span>
              <div>
                <p className="text-lg font-bold text-navy-900" data-testid="refund-title">{refund?.status === 'COMPLETED' ? 'Refund Completed' : 'Refund Pending'}</p>
                <p className="text-2xl font-extrabold text-emerald-700">{formatCurrency(refund?.amount ?? 0)}</p>
              </div>
            </div>
            <dl className="mt-3 divide-y divide-slate-100">
              <Row label="Customer sees"><span className="inline-flex items-center gap-2"><ProductThumb name={ret.product.name} />{ret.product.name}</span></Row>
              <Row label="Return status"><StatusBadge status={ret.status} /></Row>
            </dl>
          </Box>
          <p className="text-xs text-slate-500">This prototype tracks the refund status. Actual payment settlement would be handled by a payment provider in production.</p>
          <div className="flex flex-wrap gap-3">
            <Button to={`/dashboard/returns/${ret.id}`} variant="outline" size="lg">View Customer Return</Button>
            <Button to="/dashboard/refunds" variant="outline" size="lg">My Refunds</Button>
          </div>
        </div>
      )}
    </Data>
  )
}
