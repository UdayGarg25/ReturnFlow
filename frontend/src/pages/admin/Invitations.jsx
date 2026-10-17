import { Mail, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Card from '../../components/Card.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import InvitationFeedback from '../../components/InvitationFeedback.jsx'
import InvitationsTable from '../../components/InvitationsTable.jsx'
import ListToolbar from '../../components/ListToolbar.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import Pagination from '../../components/Pagination.jsx'
import useApi from '../../hooks/useApi.js'
import useInvitationActions from '../../hooks/useInvitationActions.js'
import { getAdminInvitations, INVITE_ROLES } from '../../services/adminService.js'

const PAGE_SIZE = 10
const statusOptions = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CANCELLED', label: 'Cancelled' },
]
const roleOptions = [{ value: 'ALL', label: 'All Roles' }, ...INVITE_ROLES]

export default function Invitations() {
  const { data, error, loading, reload } = useApi((signal) => getAdminInvitations({ signal }))
  const actions = useInvitationActions(reload)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [role, setRole] = useState('ALL')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? []).filter((i) => (status === 'ALL' || i.status === status) && (role === 'ALL' || i.role === role) && (!q || i.email.includes(q)))
  }, [data, query, status, role])

  const header = <PageHeader title="Invitations" subtitle="Track the invitations you have sent." />
  if (loading) return <>{header}<LoadingState label="Loading invitations..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  const reset = (setter) => (v) => { setter(v); setPage(1) }
  return (
    <>
      {header}
      <Card>
        <InvitationFeedback actions={actions} />
        <ListToolbar
          query={query}
          onQueryChange={reset(setQuery)}
          searchLabel="Search invitations"
          searchPlaceholder="Search by email..."
          filters={[
            { value: status, onChange: reset(setStatus), label: 'Filter invitations by status', options: statusOptions },
            { value: role, onChange: reset(setRole), label: 'Filter invitations by role', options: roleOptions },
          ]}
        />
        {data.length === 0 ? (
          <EmptyState icon={Mail} title="No invitations yet" description="Send invitations from the dashboard to onboard staff." action={null} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX} title="No invitations match your filters" description="Try a different search, status or role." />
        ) : (
          <>
            <InvitationsTable rows={filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} actions={actions} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="invitations" onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
