import { Truck, Undo2 } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Breadcrumbs from '../../components/Breadcrumbs.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import OrderItemsCard from '../../components/OrderItemsCard.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import Timeline from '../../components/Timeline.jsx'
import useApi from '../../hooks/useApi.js'
import { getCustomerOrder, orderLabel } from '../../services/customerService.js'
import { formatDate } from '../../utils/format.js'
import { buildOrderTimeline } from '../../utils/timelines.js'

export default function OrderDetails() {
  const { id } = useParams()
  const { data: order, error, loading, reload } = useApi((signal) => getCustomerOrder(id, { signal }), [id])

  if (loading) return <LoadingState label="Loading your order..." />
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={reload}
        notFoundTitle="Order not found"
        notFoundText="We couldn't find that order in your account."
        backTo={{ to: '/dashboard/orders', label: 'Back to My Orders' }}
      />
    )
  }

  const timeline = buildOrderTimeline(order)
  const canTrack = order.status === 'SHIPPED' || order.status === 'DELIVERED'

  return (
    <>
      <Breadcrumbs items={[{ label: 'My Orders', to: '/dashboard/orders' }, { label: `Order #${orderLabel(order.id)}` }]} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">Order #{orderLabel(order.id)}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">Placed on {formatDate(order.placedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canTrack && (
            <Button variant="outline">
              <Truck size={16} aria-hidden="true" /> Track Shipment
            </Button>
          )}
          {order.status === 'DELIVERED' && (
            <Button to={`/dashboard/returns/new?order=${order.id}`}>
              <Undo2 size={16} aria-hidden="true" /> Request a Return
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <OrderItemsCard order={order} images className="lg:col-span-3 lg:self-start" />
        <Card title="Order Status Timeline" className="lg:col-span-2 lg:self-start">
          <Timeline items={timeline.items} currentTone={timeline.currentTone} />
        </Card>
      </div>
    </>
  )
}
