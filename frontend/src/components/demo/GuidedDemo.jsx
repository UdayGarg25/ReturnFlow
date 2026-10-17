import { Check, RotateCcw, Store, Truck, User, Warehouse, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/useAuth.js'
import { getScenario, resetScenario, startDemoSession } from '../../services/demoService.js'
import { DEMO_EMAILS } from '../../utils/demoAccounts.js'
import { formatCurrency } from '../../utils/format.js'
import { returnLabel } from '../../utils/labels.js'
import { ErrorState, LoadingState } from '../ApiState.jsx'
import Button from '../Button.jsx'
import Notice from '../Notice.jsx'
import ProductThumb from '../ProductThumb.jsx'
import { CompletedPanel, CustomerPanel, PickupPanel, SellerPanel, WarehousePanel } from './GuidedPanels.jsx'

// The five visible steps, and which one each database state belongs to.
const STEPS = [
  { key: 'customer', icon: User, title: 'Customer', action: 'Request Return', tone: 'emerald', role: 'CUSTOMER', who: 'Alice', says: 'Requests a return' },
  { key: 'seller', icon: Store, title: 'Seller', action: 'Review & Approve', tone: 'blue', role: 'SELLER', who: 'Sam', says: 'Reviews the return' },
  { key: 'pickup', icon: Truck, title: 'Pickup Agent', action: 'Pick Up Item', tone: 'orange', role: 'PICKUP_AGENT', who: 'Pete', says: 'Collects the item' },
  { key: 'warehouse', icon: Warehouse, title: 'Warehouse', action: 'Inspect & Approve', tone: 'violet', role: 'WAREHOUSE', who: 'Wendy', says: 'Inspects the item' },
  { key: 'refund', icon: Wallet, title: 'Refund', action: 'Refund Created', tone: 'rose', role: 'CUSTOMER', who: 'Alice', says: 'Receives the refund', workspace: 'Customer' },
]
const STEP_OF_STAGE = { READY: 0, RETURN_REQUESTED: 1, PICKUP_ASSIGNED: 2, PICKUP_ACCEPTED: 2, AT_WAREHOUSE: 3, REFUND_PENDING: 4, REFUNDED: 4 }
const TONES = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
}

export default function GuidedDemo() {
  const { user, refreshUser, logout } = useAuth()
  const [scenario, setScenario] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { tone, text }

  const refresh = useCallback(() => getScenario().then(setScenario, setLoadError), [])
  useEffect(() => {
    let alive = true
    getScenario().then((s) => alive && setScenario(s), (e) => alive && setLoadError(e))
    return () => { alive = false }
  }, [])

  // Does something through a real API, says what happened, then re-reads the state from the database.
  const run = useCallback(async (action, message) => {
    setBusy(true)
    setNotice(null)
    try {
      await action()
      setNotice({ tone: 'success', text: message })
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
    }
    await refresh()
    setBusy(false)
  }, [refresh])

  const switchTo = (step) => run(async () => { await startDemoSession(step.role); await refreshUser() }, `You are now viewing the ${step.workspace ?? step.title} workspace as ${step.who}.`)
  const endDemo = async () => { await logout().catch(() => {}); setNotice({ tone: 'info', text: 'You are logged out of the demo account.' }) }

  if (loadError) return <ErrorState error={loadError} onRetry={() => { setLoadError(null); refresh() }} />
  if (!scenario) return <LoadingState label="Loading the guided demo..." />

  // a return that left the guided path (a rejection) is shown at the step where it ended
  const current = STEP_OF_STAGE[scenario.stage] ?? ({ INSPECTION_REJECTED: 3, PICKED_UP: 3, SELLER_APPROVED: 2, SELLER_REJECTED: 1 }[scenario.returnStatus] ?? 0)
  const finished = scenario.stage === 'REFUND_PENDING' || scenario.stage === 'REFUNDED'
  const step = STEPS[current]

  // Wraps a role's panel: until the visitor has switched to that role we say so and ask them to continue.
  const gate = (s, children) =>
    user?.role === s.role && DEMO_EMAILS.has(user.email) ? (
      <>
        <p className="mb-3 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white" data-testid="viewing-as">
          You are viewing the {s.workspace ?? s.title} workspace as {user.name}.
        </p>
        {children}
      </>
    ) : (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center">
        <p className="font-semibold text-navy-900">{s.workspace ?? s.title} action required</p>
        <p className="mt-1 text-sm text-slate-600">Next, {s.who} ({s.workspace ?? s.title}) takes part in the same return. You will switch to that account.</p>
        <Button className="mt-4" size="lg" disabled={busy} onClick={() => switchTo(s)}>Continue as {s.workspace ?? s.title}</Button>
      </div>
    )

  const panel = () => {
    const common = { scenario, run, busy }
    switch (scenario.stage) {
      case 'READY': return gate(STEPS[0], <CustomerPanel key="c" {...common} />)
      case 'RETURN_REQUESTED': return gate(STEPS[1], <SellerPanel key="s" {...common} />)
      case 'PICKUP_ASSIGNED':
      case 'PICKUP_ACCEPTED': return gate(STEPS[2], <PickupPanel key={scenario.stage} {...common} />)
      case 'AT_WAREHOUSE': return gate(STEPS[3], <WarehousePanel key="w" {...common} />)
      case 'REFUND_PENDING':
      case 'REFUNDED': return gate(STEPS[4], <CompletedPanel key="r" {...common} />)
      default:
        return (
          <Notice tone="warning">
            This return ended as {scenario.returnStatus?.replaceAll('_', ' ').toLowerCase()}, which closes the guided path
            {scenario.returnStatus === 'INSPECTION_REJECTED' ? ' (the warehouse rejected it, so no refund is issued)' : ''}. Restart the demo to run it again.
          </Notice>
        )
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex items-center gap-3">
        <ProductThumb name={scenario.product.name} size="lg" />
        <div>
          <p className="text-sm text-slate-500">One return, four people: Alice → Sam → Pete → Wendy → Alice</p>
          <p className="text-lg font-bold text-navy-900">{scenario.product.name} <span className="text-slate-400">·</span> {formatCurrency(scenario.product.price)}</p>
          <p className="text-xs text-slate-500">
            {scenario.returnId ? `Return #${returnLabel(scenario.returnId)} for ${scenario.customerName}` : `Delivered to ${scenario.customerName}, not returned yet`}
          </p>
        </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {scenario.stage !== 'READY' && (
            <Button variant="secondary" disabled={busy} onClick={() => run(resetScenario, 'The demo was restarted: the order is delivered and not yet returned.')}>
              <RotateCcw size={16} aria-hidden="true" /> Restart demo
            </Button>
          )}
          {user && <Button variant="secondary" onClick={endDemo}>Log out</Button>}
        </div>
      </div>

      <ol className="mt-5 grid gap-3 lg:grid-cols-5" aria-label="Return lifecycle">
        {STEPS.map((s, i) => {
          const done = finished || i < current
          const active = i === current && !finished
          const Icon = s.icon
          return (
            <li key={s.key} aria-current={active ? 'step' : undefined} className={`rounded-2xl border p-4 transition ${TONES[s.tone]} ${active ? 'ring-2 ring-brand-600 shadow-md' : done ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/80"><Icon size={18} aria-hidden="true" /></span>
                {done ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={14} aria-label="Done" role="img" /></span> : <span className="text-xs font-semibold">{active ? 'Now' : 'Next'}</span>}
              </div>
              <p className="mt-3 text-sm font-bold text-navy-900">{s.who}</p>
              <p className="text-xs font-medium">{s.workspace ?? s.title}</p>
              <p className="mt-1 text-xs">{s.says}</p>
            </li>
          )
        })}
      </ol>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5" aria-label={`Current step: ${step.title}`}>
        <h3 className="text-base font-bold text-navy-900">Step {current + 1}: {step.title} <span className="font-normal text-slate-500">· {step.action}</span></h3>
        {notice && <Notice tone={notice.tone} className="mt-3">{notice.text}</Notice>}
        <div className="mt-4 max-w-2xl">{panel()}</div>
      </section>
    </div>
  )
}
