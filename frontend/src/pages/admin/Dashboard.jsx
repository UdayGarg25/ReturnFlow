import { Store, Truck, Users, Warehouse } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Card from '../../components/Card.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import InviteUsersCard from '../../components/InviteUsersCard.jsx'
import InvitationFeedback from '../../components/InvitationFeedback.jsx'
import InvitationsTable from '../../components/InvitationsTable.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import StatCard from '../../components/StatCard.jsx'
import UsersTable from '../../components/UsersTable.jsx'
import useApi from '../../hooks/useApi.js'
import useInvitationActions from '../../hooks/useInvitationActions.js'
import { getAdminInvitations, getAdminStats, getAdminUsers } from '../../services/adminService.js'

const RECENT = 5
const viewAll = (to) => <Link to={to} className="rounded text-sm font-medium text-brand-600 hover:text-brand-700">View All</Link>

export default function Dashboard() {
  const { data, error, loading, reload } = useApi(async (signal) => {
    const [stats, invitations, users] = await Promise.all([getAdminStats({ signal }), getAdminInvitations({ signal }), getAdminUsers({ signal })])
    return { stats, invitations, users }
  })
  const actions = useInvitationActions(reload)

  const header = <PageHeader title="Admin Dashboard" subtitle="Manage users and send invitations to onboard sellers, pickup agents and warehouse staff." />
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  // The invite card stays mounted while the lists reload, so its result message is not lost.
  const { stats, invitations, users } = data ?? {}
  return (
    <>
      {header}

      {data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Users} label="Total Users" value={stats.totalUsers} tone="bg-blue-100 text-blue-600" trend={{ text: 'All registered users', tone: 'slate' }} />
          <StatCard icon={Store} label="Sellers" value={stats.sellers} tone="bg-emerald-100 text-emerald-600" />
          <StatCard icon={Truck} label="Pickup Agents" value={stats.pickupAgents} tone="bg-orange-100 text-orange-600" />
          <StatCard icon={Warehouse} label="Warehouse Staff" value={stats.warehouseStaff} tone="bg-violet-100 text-violet-600" />
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {loading ? (
            <LoadingState label="Loading the admin dashboard..." />
          ) : (
            <>
              <Card title="Recent Invitations" action={viewAll('/admin/invitations')}>
                <InvitationFeedback actions={actions} />
                {invitations.length === 0 ? (
                  <EmptyState title="No invitations yet" description="Invitations you send will be listed here." />
                ) : (
                  <InvitationsTable rows={invitations.slice(0, RECENT)} actions={actions} />
                )}
              </Card>

              <Card title="Users" action={viewAll('/admin/users')}>
                <UsersTable rows={users.slice(0, 4)} withView />
              </Card>
            </>
          )}
        </div>

        <InviteUsersCard onSent={reload} />
      </div>
    </>
  )
}
