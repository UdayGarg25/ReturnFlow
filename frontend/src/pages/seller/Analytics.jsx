import { IndianRupee, Package, RotateCcw, ShoppingBag, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Card from '../../components/Card.jsx'
import DonutChart from '../../components/DonutChart.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import FilterSelect from '../../components/FilterSelect.jsx'
import LineChart from '../../components/LineChart.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import StatCard from '../../components/StatCard.jsx'
import useApi from '../../hooks/useApi.js'
import { computeAnalytics, getSellerData, RANGE_OPTIONS } from '../../services/sellerService.js'
import { reasonColor } from '../../utils/charts.js'
import { formatCurrency } from '../../utils/format.js'

const SALES_SERIES = [{ key: 'sales', label: 'Sales', color: '#2563eb' }]
const formatTick = (v) => (v >= 1000 ? `₹${v / 1000}k` : `₹${v}`)

export default function Analytics() {
  const { data, error, loading, reload } = useApi((signal) => getSellerData({ signal }))
  const [range, setRange] = useState('30')
  const stats = useMemo(() => (data ? computeAnalytics(data, range) : null), [data, range])
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range).label.toLowerCase()

  const header = (
    <PageHeader
      title="Analytics"
      subtitle="Track your sales, orders and returns."
      action={<FilterSelect value={range} onChange={setRange} label="Date range" options={RANGE_OPTIONS} className="w-44" />}
    />
  )

  if (loading) return <>{header}<LoadingState label="Loading analytics..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={IndianRupee} label="Total Sales" value={formatCurrency(stats.totalSales)} tone="bg-blue-100 text-blue-600" />
        <StatCard icon={ShoppingBag} label="Total Orders" value={stats.totalOrders} tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon={RotateCcw} label="Return Requests" value={stats.returnRequests} tone="bg-orange-100 text-orange-600" trend={{ text: `${stats.pendingReturns} pending`, tone: 'amber' }} note="need your decision" />
        <StatCard icon={Undo2} label="Refunded" value={stats.refunded} tone="bg-violet-100 text-violet-600" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card title="Sales Trend" className="xl:col-span-3">
          <LineChart data={stats.salesTrend} series={SALES_SERIES} area height={280} formatValue={formatCurrency} formatTick={formatTick} ariaLabel={`Sales per period, ${rangeLabel}`} />
        </Card>

        <Card title="Return Reasons" className="xl:col-span-2">
          {stats.reasons.length === 0 ? (
            <EmptyState icon={Package} title="No returns in this period" description="Return reasons will appear here once customers request returns." />
          ) : (
            <DonutChart segments={stats.reasons.map((r) => ({ label: r.reason, value: r.value, color: reasonColor(r.reason) }))} ariaLabel={`Return reasons, ${rangeLabel}`} />
          )}
        </Card>
      </div>
    </>
  )
}
