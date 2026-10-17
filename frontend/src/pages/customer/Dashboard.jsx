import { CircleHelp, IndianRupee, Package, RotateCcw, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import DataCard from '../../components/DataCard.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import { ProductCell } from '../../components/ProductThumb.jsx'
import StatCard from '../../components/StatCard.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { useAuth } from '../../context/useAuth.js'
import useApi from '../../hooks/useApi.js'
import { getCustomerDashboard, orderLabel, returnLabel } from '../../services/customerService.js'
import { formatCurrency, formatShortDate } from '../../utils/format.js'

const idLink = 'font-semibold text-brand-600 hover:text-brand-700'

export default function Dashboard() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useApi((signal) => getCustomerDashboard({ signal }))

  const header = (
    <PageHeader
      title={
        <>
          Welcome back, {user.name.split(' ')[0]}! <span aria-hidden="true">👋</span>
        </>
      }
      subtitle="Here's an overview of your orders, returns and refunds."
      action={
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-left transition-colors hover:bg-brand-100"
        >
          <CircleHelp size={22} aria-hidden="true" className="text-brand-600" />
          <span>
            <span className="block text-sm font-semibold text-navy-900">Need help?</span>
            <span className="block text-xs text-brand-700">View our return policy</span>
          </span>
        </button>
      }
    />
  )

  if (loading) return <>{header}<LoadingState label="Loading your overview..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  const { stats, recentOrders, recentReturns } = data

  const orderRows = recentOrders.map((o) => ({
    key: o.id,
    cells: [
      <Link key="id" to={`/dashboard/orders/${o.id}`} className={idLink}>#{orderLabel(o.id)}</Link>,
      formatShortDate(o.placedAt),
      formatCurrency(o.total),
      <StatusBadge key="s" status={o.status} />,
    ],
  }))

  const returnRows = recentReturns.map((r) => ({
    key: r.id,
    cells: [
      <Link key="id" to={`/dashboard/returns/${r.id}`} className={idLink}>#{returnLabel(r.id)}</Link>,
      <ProductCell key="p" name={r.product.name} image />,
      formatShortDate(r.requestedAt),
      <StatusBadge key="s" status={r.status} />,
    ],
  }))

  return (
    <>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Package} label="Total Orders" value={stats.totalOrders} tone="bg-blue-100 text-blue-600" />
        <StatCard icon={RotateCcw} label="Active Returns" value={stats.activeReturns} tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon={Truck} label="Pending Pickups" value={stats.pendingPickups} tone="bg-orange-100 text-orange-600" />
        <StatCard icon={IndianRupee} label="Refunds Completed" value={stats.refundsCompleted} tone="bg-violet-100 text-violet-600" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <DataCard
          title="Recent Orders"
          to="/dashboard/orders"
          columns={['#', 'Date', 'Amount', 'Status']}
          rows={orderRows}
          emptyTitle="No orders yet"
          emptyDescription="Orders you place will show up here."
        />
        <DataCard
          title="Recent Return Requests"
          to="/dashboard/returns"
          columns={['#', 'Product', 'Date', 'Status']}
          rows={returnRows}
          emptyTitle="No returns yet"
          emptyDescription="Return requests you submit will show up here."
        />
      </div>
    </>
  )
}
