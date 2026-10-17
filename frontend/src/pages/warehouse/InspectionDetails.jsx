import { useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import AiAssessmentPanel from '../../components/AiAssessmentPanel.jsx'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Breadcrumbs from '../../components/Breadcrumbs.jsx'
import Card from '../../components/Card.jsx'
import CustomerInfoCard from '../../components/CustomerInfoCard.jsx'
import InfoRow from '../../components/InfoRow.jsx'
import InspectionDecisionCard from '../../components/InspectionDecisionCard.jsx'
import Notice from '../../components/Notice.jsx'
import ProductThumb from '../../components/ProductThumb.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import Timeline from '../../components/Timeline.jsx'
import { useAuth } from '../../context/useAuth.js'
import useApi from '../../hooks/useApi.js'
import { decideInspection, getInspection } from '../../services/warehouseService.js'
import { formatDateTime } from '../../utils/format.js'
import { isOpen } from '../../utils/inspection.js'
import { returnLabel } from '../../utils/labels.js'
import { buildInspectionTimeline } from '../../utils/timelines.js'

function validate(type, draft) {
  const errors = {}
  if (!draft.condition) errors.condition = 'Select the condition of the returned item.'
  if (type === 'reject' && draft.notes.trim().length < 5) errors.notes = 'Add a short note explaining why the return is rejected.'
  return errors
}

function InspectionView({ id, fromHistory }) {
  const { user } = useAuth()
  const { data: inspection, error, loading, reload } = useApi((signal) => getInspection(id, { signal }), [id])
  const [draft, setDraft] = useState({ condition: '', notes: '' })
  const [attempt, setAttempt] = useState(null) // which action was last tried, for validation messages
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const decisionRef = useRef(null)

  if (loading) return <LoadingState label="Loading the inspection..." />
  if (error) {
    return <ErrorState error={error} onRetry={reload} notFoundTitle="Inspection not found" notFoundText="We couldn't find that inspection." backTo={{ to: '/dashboard/inspections', label: 'Back to Inspection Queue' }} />
  }

  const open = isOpen(inspection)
  const canDecide = inspection.staffId === user.id
  const errors = attempt ? validate(attempt, draft) : {}
  const timeline = buildInspectionTimeline(inspection)
  const backTo = open && !fromHistory
    ? { label: 'Inspection Queue', to: '/dashboard/inspections' }
    : { label: 'Completed Inspections', to: '/dashboard/inspections/history' }

  const request = (type) => {
    setAttempt(type)
    if (Object.keys(validate(type, draft)).length > 0) {
      decisionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => decisionRef.current?.querySelector('[aria-invalid="true"]')?.focus({ preventScroll: true }), 0)
      return
    }
    setConfirming(type)
  }

  // The backend checks the assignment, validates the input, creates the refund on approval and
  // answers with the saved inspection; afterwards the screen re-reads the record.
  const confirm = async () => {
    const type = confirming
    setBusy(true)
    setOutcome(null)
    try {
      await decideInspection(inspection.id, { decision: type, condition: draft.condition, notes: draft.notes })
      setOutcome({ tone: type === 'approve' ? 'success' : 'error', title: type === 'approve' ? 'Inspection approved.' : 'Inspection rejected.', text: type === 'approve' ? 'A refund was created for this return.' : 'No refund will be issued for this return.' })
    } catch (err) {
      setOutcome({ tone: 'error', title: 'The decision was not saved.', text: err.message })
    } finally {
      setConfirming(null)
      setAttempt(null)
      setBusy(false)
      reload()
    }
  }

  return (
    <>
      <Breadcrumbs items={[{ ...backTo }, { label: `Inspection #${returnLabel(inspection.returnId)}` }]} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">Inspection #{returnLabel(inspection.returnId)}</h1>
            <StatusBadge status={inspection.displayStatus} />
          </div>
          <p className="mt-1 text-sm text-slate-500">Opened {formatDateTime(inspection.createdAt)}</p>
        </div>
      </div>

      {outcome && (
        <Notice tone={outcome.tone} className="mb-6">
          <p className="font-semibold">{outcome.title}</p>
          <p>{outcome.text}</p>
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="min-w-0 space-y-6 xl:col-span-3">
          <AiAssessmentPanel inspectionId={inspection.id} canAct={canDecide && open} />

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Product Information">
              <div className="flex items-start gap-4">
                <ProductThumb size="md" />
                <dl className="min-w-0 space-y-1 text-sm">
                  <dt className="sr-only">Product</dt>
                  <dd className="font-semibold text-slate-900">{inspection.product.name}</dd>
                </dl>
              </div>
            </Card>

            <CustomerInfoCard customer={{ name: inspection.customerName }} title="Customer Information">
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
                Return ID: <span className="text-slate-900">#{returnLabel(inspection.returnId)}</span>
              </p>
            </CustomerInfoCard>
          </div>

          <Card title="Return Information">
            <dl className="divide-y divide-slate-100">
              <InfoRow label="Reason">{inspection.reason}</InfoRow>
            </dl>
          </Card>
        </div>

        <div className="min-w-0 space-y-6 xl:col-span-2">
          <div ref={decisionRef}>
            <InspectionDecisionCard
              inspection={inspection}
              canDecide={canDecide}
              busy={busy}
              draft={draft}
              errors={errors}
              confirming={confirming}
              onDraftChange={(field, value) => setDraft((d) => ({ ...d, [field]: value }))}
              onRequest={request}
              onConfirm={confirm}
              onCancelConfirm={() => setConfirming(null)}
            />
          </div>

          <Card title="Inspection Status Timeline">
            <Timeline items={timeline.items} currentTone={timeline.currentTone} />
          </Card>
        </div>
      </div>
    </>
  )
}

export default function InspectionDetails() {
  const { id } = useParams()
  const fromHistory = useLocation().state?.section === 'history'
  // key: opening another inspection starts from a clean form
  return <InspectionView key={id} id={id} fromHistory={fromHistory} />
}
