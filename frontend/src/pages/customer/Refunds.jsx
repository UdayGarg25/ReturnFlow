import { CircleCheck, Clock, Wallet, XCircle } from 'lucide-react'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import useApi from '../../hooks/useApi.js'
import { getCustomerRefunds, orderLabel, returnLabel } from '../../services/customerService.js'
import { formatCurrency, formatDate } from '../../utils/format.js'

// How each refund status reads. This prototype tracks the refund's status; it does not move money.
const STATUS = {
  PENDING: { label: 'Refund Pending', icon: Clock, tone: 'text-amber-700' },
  PROCESSING: { label: 'Refund Processing', icon: Clock, tone: 'text-blue-700' },
  COMPLETED: { label: 'Refund Completed', icon: CircleCheck, tone: 'text-emerald-700' },
  FAILED: { label: 'Refund Failed', icon: XCircle, tone: 'text-red-700' },
  CANCELLED: { label: 'Refund Cancelled', icon: XCircle, tone: 'text-slate-600' },
}

function RefundCard({ refund }) {
  const s = STATUS[refund.status] ?? STATUS.PENDING
  const Icon = s.icon
  const date = refund.status === 'COMPLETED' && refund.processedAt ? refund.processedAt : refund.createdAt
  return (
    <li className="flex flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <p className="text-2xl font-bold text-navy-900">{formatCurrency(refund.amount)}</p>
      <p className="mt-1 font-medium text-slate-800">{refund.productName}</p>
      <p className="mt-1 text-sm text-slate-500">Return #{returnLabel(refund.returnId)} &middot; Order #{orderLabel(refund.orderId)}</p>
      <p className={`mt-4 flex items-center gap-2 text-sm font-semibold ${s.tone}`}>
        <Icon size={18} aria-hidden="true" /> {s.label}
      </p>
      <p className="mt-1 text-xs text-slate-500">{refund.status === 'COMPLETED' ? 'Completed' : 'Started'} {formatDate(date)}</p>
      <Button to={`/dashboard/returns/${refund.returnId}`} variant="outline" size="sm" className="mt-4 self-start">View Return</Button>
    </li>
  )
}

export default function Refunds() {
  const { data: refunds, error, loading, reload } = useApi((signal) => getCustomerRefunds({ signal }))
  const header = <PageHeader title="My Refunds" subtitle="Track the refunds for your approved returns." />

  if (loading) return <>{header}<LoadingState label="Loading your refunds..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}
      {refunds.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="No refunds yet"
            description="Your refunds will appear here once a return has been approved and processed."
            action={<Button to="/dashboard/returns">My Returns</Button>}
          />
        </Card>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{refunds.map((r) => <RefundCard key={r.id} refund={r} />)}</ul>
          <p className="mt-6 text-xs text-slate-500">
            ReturnFlow tracks the status of each refund. Moving the money would be handled by a payment provider in a production deployment.
          </p>
        </>
      )}
    </>
  )
}
