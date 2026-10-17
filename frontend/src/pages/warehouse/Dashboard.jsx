import { CircleCheck, ClipboardList, Hourglass, ScanSearch, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Card from '../../components/Card.jsx'
import DonutChart from '../../components/DonutChart.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import FilterSelect from '../../components/FilterSelect.jsx'
import InspectionTable from '../../components/InspectionTable.jsx'
import LineChart from '../../components/LineChart.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import StatCard from '../../components/StatCard.jsx'
import { useAuth } from '../../context/useAuth.js'
import useApi from '../../hooks/useApi.js'
import { computeWarehouseDashboard, getInspections, TREND_RANGE_OPTIONS } from '../../services/warehouseService.js'
import { greeting } from '../../utils/ranges.js'

const TREND_SERIES = [
  { key: 'inspected', label: 'Inspected', color: '#2563eb' },
  { key: 'approved', label: 'Approved', color: '#10b981' },
  { key: 'rejected', label: 'Rejected', color: '#ef4444' },
]
const BREAKDOWN_COLORS = { PENDING: '#f59e0b', IN_INSPECTION: '#2563eb', APPROVED: '#10b981', REJECTED: '#ef4444' }

export default function Dashboard() {
  const { user } = useAuth()
  const { data: inspections, error, loading, reload } = useApi((signal) => getInspections({ signal }))
  const [range, setRange] = useState('7')
  const data = useMemo(() => (inspections ? computeWarehouseDashboard(inspections, range) : null), [inspections, range])

  const header = (
    <PageHeader
      title={
        <>
          {greeting()}, {user.name.split(' ')[0]}! <span aria-hidden="true">👋</span>
        </>
      }
      subtitle="Here's your warehouse inspection overview."
    />
  )

  if (loading) return <>{header}<LoadingState label="Loading inspections..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  const rangeLabel = TREND_RANGE_OPTIONS.find((r) => r.value === range).label.toLowerCase()
  const trendTotals = TREND_SERIES.map((s) => ({ ...s, total: data.trend.reduce((sum, d) => sum + d[s.key], 0) }))

  return (
    <>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Hourglass} label="Pending Inspections" value={data.stats.pending} tone="bg-amber-100 text-amber-600" />
        <StatCard icon={ScanSearch} label="In Progress" value={data.stats.inProgress} tone="bg-blue-100 text-blue-600" />
        <StatCard icon={ClipboardList} label="Awaiting Decision" value={data.stats.awaitingDecision} tone="bg-orange-100 text-orange-600" />
        <StatCard icon={CircleCheck} label="Approved Today" value={data.stats.approvedToday} tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon={Wallet} label="Refunds Pending" value={data.stats.refundsPending} tone="bg-violet-100 text-violet-600" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card
          title="Inspections Trend"
          className="xl:col-span-3"
          action={<FilterSelect value={range} onChange={setRange} label="Trend range" options={TREND_RANGE_OPTIONS} className="w-40" />}
        >
          <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
            {trendTotals.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label} <span className="font-semibold text-slate-900">{s.total}</span>
              </li>
            ))}
          </ul>
          <LineChart data={data.trend} series={TREND_SERIES} integerTicks height={240} ariaLabel={`Inspections per period, ${rangeLabel}`} />
        </Card>

        <Card title="Inspection Status" className="xl:col-span-2">
          <DonutChart
            segments={data.breakdown.map((b) => ({ label: b.label, value: b.value, color: BREAKDOWN_COLORS[b.key] }))}
            ariaLabel="Inspections by status"
          />
        </Card>
      </div>

      <Card
        title="Recent Inspection Queue"
        className="mt-6"
        action={
          <Link to="/dashboard/inspections" className="rounded text-sm font-medium text-brand-600 hover:text-brand-700">
            View All
          </Link>
        }
      >
        {data.priorityQueue.length === 0 ? (
          <EmptyState title="The queue is clear" description="Returns that arrive at the warehouse will show up here." />
        ) : (
          <InspectionTable rows={data.priorityQueue} compact />
        )}
        <p className="mt-3 text-xs text-slate-500">Items flagged for manual review are listed first, then the oldest.</p>
      </Card>
    </>
  )
}
