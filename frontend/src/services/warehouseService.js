// Warehouse data, from the real API (/api/warehouse/inspections). Every call carries the
// session cookie. The queue is shared by all warehouse staff; a decision is only accepted
// from the staff member the inspection is assigned to (the backend enforces it). There is
// no mock fallback: a failed call throws an ApiError for the screen to show.
//
// The API provides the inspection (status, condition, notes, assigned staff id, AI fields)
// joined with the return reason, product name, customer name and the return's status.
// It has no images, received date, refund amounts or "start inspection" action.
import { API_URL, ApiError, request } from './authApi.js'
import { aiFlagOf, inspectionDisplayStatus, isOpen } from '../utils/inspection.js'
import { buildBuckets, endOfToday, inBucket, matchesDateFilter, startOfDay } from '../utils/ranges.js'
import { reasonLabel } from '../utils/returnReasons.js'

// A decided inspection's refund state, read from the return's own status.
const refundStatusOf = (inspectionStatus, returnStatus) => {
  if (inspectionStatus !== 'APPROVED') return null
  if (returnStatus === 'REFUND_PENDING') return 'PENDING'
  if (returnStatus === 'REFUNDED' || returnStatus === 'COMPLETED') return 'COMPLETED'
  return null
}

const mapInspection = (i) => {
  return {
    id: i.id,
    returnId: i.return_request_id,
    status: i.status,
    displayStatus: inspectionDisplayStatus(i.status),
    condition: i.condition,
    notes: i.notes ?? '',
    staffId: i.warehouse_staff_id,
    aiStatus: i.ai_status ?? null, // the saved AI assessment's status, or null if none was started
    aiFlag: aiFlagOf(i.ai_status, i.ai_manual_review),
    returnStatus: i.return_status,
    reason: reasonLabel(i.reason),
    product: { name: i.product_name },
    customerName: i.customer_name,
    createdAt: i.created_at, // when the inspection record was opened
    updatedAt: i.updated_at, // for a decided inspection: when it was decided
    refundStatus: refundStatusOf(i.status, i.return_status),
  }
}

export async function getInspections({ signal } = {}) {
  const { inspections } = await request('/api/warehouse/inspections', { signal })
  return inspections.map(mapInspection)
}

export async function getInspection(id, { signal } = {}) {
  const { inspection } = await request(`/api/warehouse/inspections/${encodeURIComponent(id)}`, { signal })
  return mapInspection(inspection)
}

// decision: { decision: 'approve' | 'reject', condition, notes }. The backend decides the status
// changes, creates the refund (amount and customer come from the order line) and rejects anyone
// but the assigned staff member.
export async function decideInspection(id, { decision, condition, notes }, { signal } = {}) {
  const { inspection } = await request(`/api/warehouse/inspections/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: { decision, condition, ...(notes?.trim() && { notes: notes.trim() }) },
    signal,
  })
  return mapInspection(inspection)
}

// ----------------------------------------------------------------- filters ----
export const QUEUE_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending Inspection' },
  { value: 'IN_PROGRESS', label: 'In Inspection' },
  { value: 'MANUAL_REVIEW', label: 'Awaiting Decision' },
]
export const AI_FLAG_OPTIONS = [
  { value: 'ALL', label: 'All AI Results' },
  { value: 'MANUAL', label: 'Manual review' },
  { value: 'CLEAR', label: 'AI clear' },
  { value: 'NOT_RUN', label: 'AI not run' },
]
export const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Dates' },
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]
export const HISTORY_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Results' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]
export const REFUND_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'COMPLETED', label: 'Completed' },
]
export const TREND_RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]
export { matchesDateFilter }

// ------------------------------------------------------------- dashboard ----
// Computed from the real inspection list (there is no dashboard endpoint).
export function computeWarehouseDashboard(inspections, range = '7') {
  const queue = inspections.filter((i) => isOpen(i))
  const done = inspections.filter((i) => !isOpen(i))
  const count = (status) => inspections.filter((i) => i.status === status).length
  const today = (iso) => new Date(iso) >= startOfDay(0) && new Date(iso) <= endOfToday()

  const trend = buildBuckets(range).map((b) => {
    const inB = done.filter((i) => inBucket(i.updatedAt, b))
    return { label: b.label, inspected: inB.length, approved: inB.filter((i) => i.status === 'APPROVED').length, rejected: inB.filter((i) => i.status === 'REJECTED').length }
  })

  // needs a human first, then the oldest
  const priorityQueue = [...queue]
    .sort((a, b) => (b.aiFlag === 'MANUAL') - (a.aiFlag === 'MANUAL') || new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, 5)

  return {
    stats: {
      pending: count('PENDING'),
      inProgress: count('IN_PROGRESS'),
      awaitingDecision: count('MANUAL_REVIEW'),
      approvedToday: done.filter((i) => i.status === 'APPROVED' && today(i.updatedAt)).length,
      refundsPending: done.filter((i) => i.refundStatus === 'PENDING').length,
    },
    trend,
    breakdown: [
      { key: 'PENDING', label: 'Pending', value: count('PENDING') },
      { key: 'IN_INSPECTION', label: 'In Inspection', value: queue.filter((i) => i.status !== 'PENDING').length },
      { key: 'APPROVED', label: 'Approved', value: count('APPROVED') },
      { key: 'REJECTED', label: 'Rejected', value: count('REJECTED') },
    ],
    priorityQueue,
  }
}

// ------------------------------------------------------- AI-assisted assessment (advisory only)
// The assessment is made on the backend (OpenRouter + the private S3 images). Nothing here decides anything.
export async function getAiAssessment(inspectionId, { signal } = {}) {
  const { assessment } = await request(`/api/warehouse/inspections/${encodeURIComponent(inspectionId)}/ai-assessment`, { signal })
  return assessment
}
export async function startAiAssessment(inspectionId) {
  const { assessment } = await request(`/api/warehouse/inspections/${encodeURIComponent(inspectionId)}/ai-assessment`, { method: 'POST' })
  return assessment
}
export async function retryAiAssessment(inspectionId) {
  const { assessment } = await request(`/api/warehouse/inspections/${encodeURIComponent(inspectionId)}/ai-assessment/retry`, { method: 'POST' })
  return assessment
}

// An evidence image (product reference or a customer photo), streamed by the backend with the session cookie.
export async function fetchEvidenceBlob(inspectionId, kind, { signal, imageId } = {}) {
  const path = kind === 'reference' ? 'reference' : `photos/${encodeURIComponent(imageId)}`
  let res
  try {
    res = await fetch(`${API_URL}/api/warehouse/inspections/${encodeURIComponent(inspectionId)}/evidence/${path}`, { credentials: 'include', signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(0, 'We could not reach the server.')
  }
  if (!res.ok) throw new ApiError(res.status, 'The image could not be loaded.')
  return res.blob()
}
