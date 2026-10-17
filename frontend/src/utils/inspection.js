// Inspection vocabulary shared by the warehouse screens.

// inspections.condition values (the human assessment)
export const CONDITIONS = [
  { value: 'UNOPENED', label: 'Unopened' },
  { value: 'LIKE_NEW', label: 'Like New' },
  { value: 'USED', label: 'Used' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'WRONG_ITEM', label: 'Wrong Item' },
]
export const conditionLabel = (value) => CONDITIONS.find((c) => c.value === value)?.label ?? '—'

// inspections.status -> key used by StatusBadge (see utils/status.js)
const DISPLAY = {
  PENDING: 'INSPECTION_QUEUED',
  IN_PROGRESS: 'INSPECTION',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  APPROVED: 'INSPECTION_APPROVED',
  REJECTED: 'INSPECTION_REJECTED',
}
export const inspectionDisplayStatus = (status) => DISPLAY[status]

export const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS', 'MANUAL_REVIEW']
export const isOpen = (i) => OPEN_STATUSES.includes(i.status)

// "AI flag" shown in lists: did the assistant ask for a human look?
export const AI_FLAGS = { MANUAL: 'MANUAL', CLEAR: 'CLEAR', NOT_RUN: 'NOT_RUN' }
// from the saved assessment: not completed = not run; completed and flagged for review = MANUAL
export const aiFlagOf = (status, manualReview) => (status !== 'COMPLETED' ? AI_FLAGS.NOT_RUN : manualReview ? AI_FLAGS.MANUAL : AI_FLAGS.CLEAR)
