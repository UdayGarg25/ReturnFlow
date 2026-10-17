import { statusMeta } from './status.js'

// Builders that turn a record + its status into the steps <Timeline /> draws:
// items: [{ key, title, description?, date?, state: 'done'|'current'|'pending'|'rejected' }]
// Dates are only shown when the real API provides them.

// ---------------------------------------------------------------------------
// Return lifecycle (customer + seller views)
// ---------------------------------------------------------------------------
const RETURN_STEPS = [
  { key: 'requested', title: 'Return Requested', done: 'Your return request has been submitted.' },
  { key: 'sellerReview', title: 'Seller Review', done: 'The seller approved your return.', waiting: 'Waiting for seller approval.' },
  { key: 'pickupAssignment', title: 'Pickup Assignment', done: 'A pickup agent has been assigned.', waiting: 'A pickup agent will be assigned.' },
  { key: 'pickupCompleted', title: 'Pickup Completed', done: 'The item was collected from you.', waiting: 'The agent will collect the item.' },
  { key: 'inspection', title: 'Warehouse Inspection', done: 'The warehouse inspected the item.', waiting: 'The warehouse is inspecting the item.' },
  { key: 'refund', title: 'Refund Processing', done: 'Your refund has been issued.', waiting: 'Your refund is being processed.' },
  { key: 'completed', title: 'Completed', done: 'Your return is complete.' },
]

// current:  index of the step that is happening now (steps before it are done)
// failedAt: index of the step where the return was rejected
const RETURN_PROGRESS = {
  RETURN_REQUESTED: { current: 1 },
  SELLER_APPROVED: { current: 2 },
  PICKUP_ASSIGNED: { current: 3 },
  PICKED_UP: { current: 4 },
  WAREHOUSE_RECEIVED: { current: 4 },
  INSPECTION: { current: 4 },
  INSPECTION_APPROVED: { current: 5 },
  REFUND_PENDING: { current: 5 },
  REFUNDED: { current: 6 },
  COMPLETED: { current: RETURN_STEPS.length },
  SELLER_REJECTED: { failedAt: 1 },
  INSPECTION_REJECTED: { failedAt: 4 },
}

// -> { items, currentTone } for <Timeline />
export function buildReturnTimeline(ret) {
  const progress = RETURN_PROGRESS[ret.status] ?? { current: 0 }
  const items = RETURN_STEPS.map((step, i) => {
    const event = ret.history?.[step.key]
    let state
    if (progress.failedAt !== undefined) {
      state = i < progress.failedAt ? 'done' : i === progress.failedAt ? 'rejected' : 'pending'
    } else {
      state = i < progress.current ? 'done' : i === progress.current ? 'current' : 'pending'
    }

    let title = step.title
    let description = ''
    if (state === 'done') description = event?.note ?? step.done
    if (state === 'current') description = event?.note ?? step.waiting
    if (state === 'rejected') {
      title = `${step.title} - Rejected`
      description = ret.rejectionNote ?? 'This return was rejected.'
    }
    return { key: step.key, title, description, date: event?.at, state }
  })
  return { items, currentTone: statusMeta(ret.status).tone === 'amber' ? 'amber' : 'blue' }
}

// ---------------------------------------------------------------------------
// Order status
// ---------------------------------------------------------------------------
// With per-step dates (`order.events`) a step is done when it has a date. Without them (the
// real APIs only have the order date) the steps follow the order status.
export function buildOrderTimeline(order) {
  const { orderedAt = order.placedAt, shippedAt, deliveredAt, cancelledAt } = order.events ?? {}
  const shippedByStatus = order.status === 'SHIPPED' || order.status === 'DELIVERED'
  const deliveredByStatus = order.status === 'DELIVERED'
  const items = [{ key: 'ordered', title: 'Order Placed', description: 'Your order has been placed.', date: orderedAt, state: 'done' }]

  if (order.status === 'CANCELLED') {
    items.push({ key: 'cancelled', title: 'Cancelled', description: 'This order was cancelled.', date: cancelledAt, state: 'rejected' })
    return { items, currentTone: 'blue' }
  }

  const steps = [
    { key: 'shipped', title: 'Shipped', done: 'Your order is on its way.', waiting: 'Your order is being prepared.', date: shippedAt, reached: shippedByStatus },
    { key: 'delivered', title: 'Delivered', done: 'Your order was delivered.', waiting: 'Your order will arrive soon.', date: deliveredAt, reached: deliveredByStatus },
  ]
  let currentAssigned = false
  for (const s of steps) {
    let state = 'pending'
    if (s.date || s.reached) state = 'done'
    else if (!currentAssigned) {
      state = 'current'
      currentAssigned = true
    }
    items.push({ key: s.key, title: s.title, description: state === 'done' ? s.done : state === 'current' ? s.waiting : '', date: s.date, state })
  }
  return { items, currentTone: 'blue' }
}

// ---------------------------------------------------------------------------
// Pickup (agent view). The API only knows the assigned and picked-up times, so only those are dated.
// ---------------------------------------------------------------------------
export function buildPickupTimeline(p) {
  const assigned = { key: 'assigned', title: 'Assigned', description: 'This pickup was assigned to you.', date: p.assignedAt, state: 'done' }

  if (p.status === 'FAILED' || p.status === 'CANCELLED') {
    const failed = p.status === 'FAILED'
    return {
      items: [
        assigned,
        { key: 'stopped', title: failed ? 'Pickup Failed' : 'Pickup Cancelled', description: failed ? 'The pickup could not be completed.' : 'This pickup was cancelled.', state: 'rejected' },
        { key: 'pickedUp', title: 'Picked Up', state: 'pending' },
      ],
      currentTone: 'blue',
    }
  }

  const accepted = p.status === 'ACCEPTED' || p.status === 'PICKED_UP'
  const picked = p.status === 'PICKED_UP'
  return {
    items: [
      assigned,
      { key: 'accepted', title: 'Accepted', description: accepted ? 'You accepted this pickup.' : 'Accept the pickup to confirm it.', state: accepted ? 'done' : 'current' },
      {
        key: 'pickedUp',
        title: 'Picked Up',
        description: picked ? 'The item was collected from the customer.' : accepted ? 'Collect the item from the customer.' : '',
        date: p.pickedUpAt,
        state: picked ? 'done' : accepted ? 'current' : 'pending',
      },
    ],
    currentTone: p.status === 'ASSIGNED' ? 'amber' : 'blue',
  }
}

// ---------------------------------------------------------------------------
// Inspection (warehouse view). The API dates the record's creation and, once decided, the decision.
// ---------------------------------------------------------------------------
export function buildInspectionTimeline(i) {
  const items = [{ key: 'received', title: 'Received at Warehouse', description: 'An inspection was opened for this return.', date: i.createdAt, state: 'done' }]

  if (i.status === 'APPROVED' || i.status === 'REJECTED') {
    const approved = i.status === 'APPROVED'
    items.push(
      { key: 'inspection', title: 'In Inspection', description: 'Inspected by warehouse staff.', state: 'done' },
      approved
        ? { key: 'completed', title: 'Inspection Completed', description: 'The return was approved.', date: i.updatedAt, state: 'done' }
        : { key: 'completed', title: 'Inspection Rejected', description: 'The return did not pass inspection.', date: i.updatedAt, state: 'rejected' },
      approved
        ? { key: 'refund', title: 'Refund Initiated', description: i.refundStatus === 'COMPLETED' ? 'The refund was completed.' : 'A refund was created and is pending.', state: 'done' }
        : { key: 'refund', title: 'Refund Initiated', description: 'No refund. The return was rejected.', state: 'pending' },
    )
    return { items, currentTone: 'blue' }
  }

  const waiting = i.status === 'PENDING'
  items.push(
    {
      key: 'inspection',
      title: 'In Inspection',
      description: waiting ? 'Waiting for inspection.' : i.status === 'MANUAL_REVIEW' ? 'Waiting for a staff decision.' : 'Current step.',
      state: 'current',
    },
    { key: 'completed', title: 'Inspection Completed', state: 'pending' },
    { key: 'refund', title: 'Refund Initiated', state: 'pending' },
  )
  return { items, currentTone: waiting || i.status === 'MANUAL_REVIEW' ? 'amber' : 'blue' }
}
