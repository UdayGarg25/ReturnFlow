import { IndianRupee, Package, RotateCcw, ShoppingBag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Card from '../../components/Card.jsx'
import DataCard from '../../components/DataCard.jsx'
import FilterSelect from '../../components/FilterSelect.jsx'
import LineChart from '../../components/LineChart.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import { ProductCell } from '../../components/ProductThumb.jsx'
import StatCard from '../../components/StatCard.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { useAuth } from '../../context/useAuth.js'
import useApi from '../../hooks/useApi.js'
import { computeOverview, getSellerData, RANGE_OPTIONS } from '../../services/sellerService.js'
import { ORDER_SERIES } from '../../utils/charts.js'
import { formatCurrency, formatShortDate } from '../../utils/format.js'
import { returnLabel } from '../../utils/labels.js'

const idLink = 'font-semibold text-brand-600 hover:text-brand-700'

export default function Dashboard() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useApi((signal) => getSellerData({ signal }))
  const [range, setRange] = useState('30')
  const overview = useMemo(() => (data ? computeOverview(data, range) : null), [data, range])
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range).label.toLowerCase()

  const header = (
    <PageHeader
      title={
        <>
          Welcome back, {user.name.split(' ')[0]}! <span aria-hidden="true">👋</span>
        </>
      }
      subtitle="Here's what's happening with your business today."
      action={<FilterSelect value={range} onChange={setRange} label="Date range" options={RANGE_OPTIONS} className="w-44" />}
    />
  )

  if (loading) return <>{header}<LoadingState label="Loading your overview..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  const returnRows = overview.recentReturns.map((r) => ({
    key: r.id,
    cells: [
      <Link key="id" to={`/dashboard/returns/${r.id}`} className={idLink}>#{returnLabel(r.id)}</Link>,
      <ProductCell key="p" name={r.product.name} />,
      formatShortDate(r.requestedAt),
      <StatusBadge key="s" status={r.status} />,
    ],
  }))

  return (
    <>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Package} label="Total Products" value={overview.totalProducts} tone="bg-blue-100 text-blue-600" />
        <StatCard icon={ShoppingBag} label="Total Orders" value={overview.totalOrders} tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon={RotateCcw} label="Return Requests" value={overview.returnRequests} tone="bg-orange-100 text-orange-600" trend={{ text: `${overview.pendingReturns} pending`, tone: 'amber' }} note="need your decision" />
        <StatCard icon={IndianRupee} label="Total Sales" value={formatCurrency(overview.totalSales)} tone="bg-violet-100 text-violet-600" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card
          title="Orders Overview"
          action={
            <ul className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-slate-600">
              {ORDER_SERIES.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label} <span className="font-semibold text-slate-900">{overview.chartTotals[s.key]}</span>
                </li>
              ))}
            </ul>
          }
        >
          <LineChart data={overview.chart} series={ORDER_SERIES} integerTicks ariaLabel={`Orders per period, ${rangeLabel}`} />
        </Card>

        <div className="min-w-0">
          <DataCard
            title="Recent Return Requests"
            to="/dashboard/returns"
            columns={['#', 'Product', 'Date', 'Status']}
            rows={returnRows}
            emptyTitle="No return requests"
            emptyDescription="Customer return requests will show up here."
          />
        </div>
      </div>
    </>
  )
}
