import { CircleCheck, ClipboardList, Clock, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Card from '../../components/Card.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import PickupCard from '../../components/PickupCard.jsx'
import StatCard from '../../components/StatCard.jsx'
import { useAuth } from '../../context/useAuth.js'
import useApi from '../../hooks/useApi.js'
import { getPickupDashboard } from '../../services/pickupService.js'
import { greeting } from '../../utils/ranges.js'

export default function Dashboard() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useApi((signal) => getPickupDashboard({ signal }))

  const header = (
    <PageHeader
      title={
        <>
          {greeting()}, {user.name.split(' ')[0]}! <span aria-hidden="true">👋</span>
        </>
      }
      subtitle="Here's your pickup overview."
    />
  )

  if (loading) return <>{header}<LoadingState label="Loading your pickups..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  const { stats, open } = data
  return (
    <>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ClipboardList} label="Open Pickups" value={stats.open} tone="bg-blue-100 text-blue-600" />
        <StatCard icon={Clock} label="Pending" value={stats.pending} tone="bg-amber-100 text-amber-600" />
        <StatCard icon={CircleCheck} label="Accepted" value={stats.accepted} tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon={PackageCheck} label="Picked Up" value={stats.completed} tone="bg-violet-100 text-violet-600" />
      </div>

      <Card
        title="Open Pickups"
        className="mt-6"
        action={<Link to="/dashboard/pickups" className="rounded text-sm font-medium text-brand-600 hover:text-brand-700">View All</Link>}
      >
        {open.length === 0 ? (
          <EmptyState title="No open pickups" description="Pickups assigned to you will show up here." />
        ) : (
          <ul>{open.map((p) => <PickupCard key={p.id} pickup={p} />)}</ul>
        )}
      </Card>
    </>
  )
}
