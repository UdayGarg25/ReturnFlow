import { CircleAlert, Wallet } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Breadcrumbs from '../../components/Breadcrumbs.jsx'
import Card from '../../components/Card.jsx'
import InfoRow from '../../components/InfoRow.jsx'
import ReturnPhotos from '../../components/ReturnPhotos.jsx'
import ProductThumb from '../../components/ProductThumb.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import Timeline from '../../components/Timeline.jsx'
import useApi from '../../hooks/useApi.js'
import { getCustomerReturn, orderLabel, returnLabel } from '../../services/customerService.js'
import { formatCurrency, formatDate } from '../../utils/format.js'
import { statusMeta } from '../../utils/status.js'
import { buildReturnTimeline } from '../../utils/timelines.js'

// Same rule as the backend: photos can be added or removed only until the item is picked up.
const PHOTO_EDITABLE = ['RETURN_REQUESTED', 'SELLER_APPROVED', 'PICKUP_ASSIGNED']

export default function ReturnDetails() {
  const { id } = useParams()
  const { data: ret, error, loading, reload } = useApi((signal) => getCustomerReturn(id, { signal }), [id])

  if (loading) return <LoadingState label="Loading your return..." />
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={reload}
        notFoundTitle="Return not found"
        notFoundText="We couldn't find that return request in your account."
        backTo={{ to: '/dashboard/returns', label: 'Back to My Returns' }}
      />
    )
  }

  const timeline = buildReturnTimeline(ret)
  const rejected = statusMeta(ret.status).tone === 'red'

  return (
    <>
      <Breadcrumbs items={[{ label: 'My Returns', to: '/dashboard/returns' }, { label: `Return #${returnLabel(ret.id)}` }]} />

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">Return #{returnLabel(ret.id)}</h1>
          <StatusBadge status={ret.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">Requested on {formatDate(ret.requestedAt)}</p>
      </div>

      {rejected && (
        <div role="alert" className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <CircleAlert size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">This return was rejected.</span>
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="Product Details">
            <div className="flex items-center gap-4">
              <ProductThumb size="lg" name={ret.product.name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{ret.product.name}</p>
                {ret.product.quantity && <p className="text-sm text-slate-500">Quantity: {ret.product.quantity}</p>}
                <p className="text-sm text-slate-500">
                  Order:{' '}
                  <Link to={`/dashboard/orders/${ret.orderId}`} className="font-medium text-brand-600 hover:text-brand-700">
                    #{orderLabel(ret.orderId)}
                  </Link>
                </p>
              </div>
              {ret.product.price !== undefined && <p className="font-semibold text-slate-900">{formatCurrency(ret.product.price)}</p>}
            </div>
          </Card>

          <Card title="Return Information">
            <dl className="divide-y divide-slate-100">
              <InfoRow label="Reason">{ret.reason}</InfoRow>
              <InfoRow label="Description">{ret.description || <span className="text-slate-500">No description provided.</span>}</InfoRow>
            </dl>
          </Card>

          <ReturnPhotos returnId={ret.id} editable={PHOTO_EDITABLE.includes(ret.status)} />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Return Status Timeline">
            <Timeline items={timeline.items} currentTone={timeline.currentTone} />
          </Card>

          {ret.refundStatus && (
            <Card title="Refund">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Wallet size={22} aria-hidden="true" />
                </span>
                <div className="text-sm">
                  <p className="text-slate-500">Refund status</p>
                  <StatusBadge status={ret.refundStatus} />
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
