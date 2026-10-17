import { User } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Breadcrumbs from '../../components/Breadcrumbs.jsx'
import Card from '../../components/Card.jsx'
import OrderItemsCard from '../../components/OrderItemsCard.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import Timeline from '../../components/Timeline.jsx'
import useApi from '../../hooks/useApi.js'
import { getSellerOrder } from '../../services/sellerService.js'
import { formatDate } from '../../utils/format.js'
import { orderLabel } from '../../utils/labels.js'
import { buildOrderTimeline } from '../../utils/timelines.js'

export default function OrderDetails() {
  const { id } = useParams()
  const { data: order, error, loading, reload } = useApi((signal) => getSellerOrder(id, { signal }), [id])

  if (loading) return <LoadingState label="Loading the order..." />
  if (error) {
    return <ErrorState error={error} onRetry={reload} notFoundTitle="Order not found" notFoundText="We couldn't find that order among orders for your products." backTo={{ to: '/dashboard/orders', label: 'Back to Orders' }} />
  }

  const timeline = buildOrderTimeline(order)

  return (
    <>
      <Breadcrumbs items={[{ label: 'Orders', to: '/dashboard/orders' }, { label: `Order #${orderLabel(order.id)}` }]} />

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">Order #{orderLabel(order.id)}</h1>
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">Placed on {formatDate(order.placedAt)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-2 lg:col-span-3 lg:self-start">
          <OrderItemsCard order={order} />
          <p className="px-1 text-xs text-slate-500">Shows only the items from your catalog; the total is your share of this order.</p>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Customer">
            <p className="flex items-center gap-3 text-sm">
              <User size={18} aria-hidden="true" className="shrink-0 text-slate-400" />
              <span className="font-medium text-slate-900">{order.customerName}</span>
            </p>
          </Card>
          <Card title="Order Status Timeline">
            <Timeline items={timeline.items} currentTone={timeline.currentTone} />
          </Card>
        </div>
      </div>
    </>
  )
}
