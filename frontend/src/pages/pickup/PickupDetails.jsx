import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Breadcrumbs from '../../components/Breadcrumbs.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import CustomerInfoCard from '../../components/CustomerInfoCard.jsx'
import InfoRow from '../../components/InfoRow.jsx'
import Notice from '../../components/Notice.jsx'
import ProductThumb from '../../components/ProductThumb.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import Timeline from '../../components/Timeline.jsx'
import useApi from '../../hooks/useApi.js'
import { getPickup, isOpenPickup, updatePickupStatus } from '../../services/pickupService.js'
import { formatDateTime } from '../../utils/format.js'
import { pickupLabel, returnLabel } from '../../utils/labels.js'
import { buildPickupTimeline } from '../../utils/timelines.js'

// What the agent can do from each state (the backend enforces the same rules).
const ACTIONS = {
  ASSIGNED: [{ to: 'ACCEPTED', label: 'Accept Pickup' }, { to: 'FAILED', label: 'Mark as Failed', danger: true }],
  ACCEPTED: [{ to: 'PICKED_UP', label: 'Mark as Picked Up' }, { to: 'FAILED', label: 'Mark as Failed', danger: true }],
}
const DONE = { ACCEPTED: 'You accepted this pickup.', PICKED_UP: 'Marked as picked up.', FAILED: 'Marked as failed.' }

export default function PickupDetails() {
  const { id } = useParams()
  const fromHistory = useLocation().state?.section === 'history'
  const { data: pickup, error, loading, reload } = useApi((signal) => getPickup(id, { signal }), [id])
  const [confirmFail, setConfirmFail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null)

  if (loading) return <LoadingState label="Loading the pickup..." />
  if (error) {
    return <ErrorState error={error} onRetry={reload} notFoundTitle="Pickup not found" notFoundText="We couldn't find that pickup among the pickups assigned to you." backTo={{ to: '/dashboard/pickups', label: 'Back to Assigned Pickups' }} />
  }

  const timeline = buildPickupTimeline(pickup)
  const actions = ACTIONS[pickup.status] ?? []
  const backTo = fromHistory || !isOpenPickup(pickup) ? { label: 'Pickup History', to: '/dashboard/history' } : { label: 'Assigned Pickups', to: '/dashboard/pickups' }

  // The backend validates ownership and the move; afterwards the screen re-reads the record.
  const apply = async (status) => {
    setBusy(true)
    setOutcome(null)
    try {
      await updatePickupStatus(pickup.id, status)
      setOutcome({ tone: status === 'FAILED' ? 'error' : 'success', text: DONE[status] })
    } catch (err) {
      setOutcome({ tone: 'error', text: err.message })
    } finally {
      setConfirmFail(false)
      setBusy(false)
      reload()
    }
  }

  return (
    <>
      <Breadcrumbs items={[{ ...backTo }, { label: `Pickup #${pickupLabel(pickup.id)}` }]} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">Pickup #{pickupLabel(pickup.id)}</h1>
            <StatusBadge status={pickup.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">Assigned {formatDateTime(pickup.assignedAt)}</p>
        </div>

        {actions.length > 0 && !confirmFail && (
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {actions.map((a) =>
              a.danger ? (
                <Button key={a.to} variant="dangerOutline" size="lg" disabled={busy} onClick={() => setConfirmFail(true)}>{a.label}</Button>
              ) : (
                <Button key={a.to} size="lg" disabled={busy} onClick={() => apply(a.to)}>{busy ? 'Saving...' : a.label}</Button>
              ),
            )}
          </div>
        )}
      </div>

      {outcome && <Notice tone={outcome.tone} className="mb-6">{outcome.text}</Notice>}

      {confirmFail && (
        <div role="alertdialog" aria-label="Confirm failed pickup" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">Mark this pickup as failed?</p>
          <p className="mt-1 text-sm text-red-800">The pickup will be closed. This cannot be undone.</p>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirmFail(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={() => apply('FAILED')} disabled={busy}>{busy ? 'Saving...' : 'Confirm Failed Pickup'}</Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <CustomerInfoCard customer={{ name: pickup.customerName }} title="Customer" />

          <Card title="Product Information">
            <div className="flex items-center gap-4">
              <ProductThumb size="lg" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-slate-900">{pickup.product.name}</p>
                <p className="text-slate-500">Return: <span className="text-slate-900">#{returnLabel(pickup.returnId)}</span></p>
              </div>
            </div>
          </Card>

          <Card title="Return Details">
            <dl className="divide-y divide-slate-100">
              <InfoRow label="Reason">{pickup.reason}</InfoRow>
              {pickup.pickedUpAt && <InfoRow label="Picked up">{formatDateTime(pickup.pickedUpAt)}</InfoRow>}
            </dl>
          </Card>
        </div>

        <Card title="Pickup Status" className="lg:col-span-2 lg:self-start">
          <Timeline items={timeline.items} currentTone={timeline.currentTone} />
        </Card>
      </div>
    </>
  )
}
