import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Breadcrumbs from '../../components/Breadcrumbs.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import CustomerInfoCard from '../../components/CustomerInfoCard.jsx'
import InfoRow from '../../components/InfoRow.jsx'
import Notice from '../../components/Notice.jsx'
import AiSummaryCard from '../../components/AiSummaryCard.jsx'
import ProductThumb from '../../components/ProductThumb.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import Timeline from '../../components/Timeline.jsx'
import useApi from '../../hooks/useApi.js'
import { decideSellerReturn, getSellerReturn } from '../../services/sellerService.js'
import { formatDate } from '../../utils/format.js'
import { orderLabel, returnLabel } from '../../utils/labels.js'
import { buildReturnTimeline } from '../../utils/timelines.js'

export default function ReturnDetails() {
  const { id } = useParams()
  const { data: ret, error, loading, reload } = useApi((signal) => getSellerReturn(id, { signal }), [id])
  const [confirming, setConfirming] = useState(null) // 'approve' | 'reject'
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null) // { tone, text }

  if (loading) return <LoadingState label="Loading the return request..." />
  if (error) {
    return <ErrorState error={error} onRetry={reload} notFoundTitle="Return request not found" notFoundText="We couldn't find that return request on your products." backTo={{ to: '/dashboard/returns', label: 'Back to Return Requests' }} />
  }

  const awaitingDecision = ret.status === 'RETURN_REQUESTED'
  const timeline = buildReturnTimeline(ret)

  // The decision is made by the backend (it checks ownership and that the request is still
  // pending). Afterwards the screen re-reads the record, so it always shows the database state.
  const decide = async () => {
    setBusy(true)
    const decision = confirming
    try {
      await decideSellerReturn(ret.id, decision)
      setOutcome({ tone: decision === 'approve' ? 'success' : 'error', text: decision === 'approve' ? 'You approved this return.' : 'You rejected this return.' })
    } catch (err) {
      setOutcome({ tone: 'error', text: err.message })
    } finally {
      setConfirming(null)
      setBusy(false)
      reload()
    }
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'Return Requests', to: '/dashboard/returns' }, { label: `Return #${returnLabel(ret.id)}` }]} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">Return #{returnLabel(ret.id)}</h1>
            <StatusBadge status={ret.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">Requested on {formatDate(ret.requestedAt)}</p>
        </div>
        {awaitingDecision && !confirming && (
          <div className="flex w-full gap-3 sm:w-auto">
            <Button variant="success" size="lg" onClick={() => { setOutcome(null); setConfirming('approve') }} className="flex-1 sm:flex-none">
              <Check size={16} aria-hidden="true" /> Approve
            </Button>
            <Button variant="danger" size="lg" onClick={() => { setOutcome(null); setConfirming('reject') }} className="flex-1 sm:flex-none">
              <X size={16} aria-hidden="true" /> Reject
            </Button>
          </div>
        )}
      </div>

      {outcome && <Notice tone={outcome.tone} className="mb-6">{outcome.text}</Notice>}

      {confirming && (
        <div role="alertdialog" aria-label={confirming === 'approve' ? 'Confirm approval' : 'Confirm rejection'} className={`mb-6 rounded-xl border p-4 ${confirming === 'approve' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <p className={`text-sm font-semibold ${confirming === 'approve' ? 'text-emerald-900' : 'text-red-900'}`}>{confirming === 'approve' ? 'Approve this return?' : 'Reject this return?'}</p>
          <p className={`mt-1 text-sm ${confirming === 'approve' ? 'text-emerald-800' : 'text-red-800'}`}>
            {confirming === 'approve' ? 'The customer will be told the return was approved.' : 'The customer will be told the return was rejected.'} This decision cannot be changed afterwards.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={busy}>Cancel</Button>
            <Button variant={confirming === 'approve' ? 'success' : 'danger'} onClick={decide} disabled={busy}>
              {busy ? 'Saving...' : confirming === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="Product Information">
            <div className="flex items-center gap-4">
              <ProductThumb size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{ret.product.name}</p>
                <p className="text-sm text-slate-500">
                  Order: <Link to={`/dashboard/orders/${ret.orderId}`} className="font-medium text-brand-600 hover:text-brand-700">#{orderLabel(ret.orderId)}</Link>
                </p>
              </div>
            </div>
          </Card>

          <CustomerInfoCard customer={{ name: ret.customerName }} />

          <Card title="Return Information">
            <dl className="divide-y divide-slate-100">
              <InfoRow label="Reason">{ret.reason}</InfoRow>
              <InfoRow label="Description">{ret.description || <span className="text-slate-500">No description provided.</span>}</InfoRow>
            </dl>
          </Card>

          <AiSummaryCard summary={ret.aiSummary} />
        </div>

        <Card title="Return Status Timeline" className="lg:col-span-2 lg:self-start">
          <Timeline items={timeline.items} currentTone={timeline.currentTone} />
        </Card>
      </div>
    </>
  )
}
