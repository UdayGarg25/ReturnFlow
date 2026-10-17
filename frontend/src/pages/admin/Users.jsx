import { SearchX, Users as UsersIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Card from '../../components/Card.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ListToolbar from '../../components/ListToolbar.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import Pagination from '../../components/Pagination.jsx'
import UsersTable from '../../components/UsersTable.jsx'
import useApi from '../../hooks/useApi.js'
import { getAdminUsers } from '../../services/adminService.js'
import { ROLE_LABELS } from '../../utils/roles.js'

const PAGE_SIZE = 10
const roleOptions = [{ value: 'ALL', label: 'All Roles' }, ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))]

export default function Users() {
  const { data, error, loading, reload } = useApi((signal) => getAdminUsers({ signal }))
  const [params] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const [role, setRole] = useState('ALL')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? []).filter((u) => (role === 'ALL' || u.role === role) && (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)))
  }, [data, query, role])

  const header = <PageHeader title="Users" subtitle="Everyone who has an account on ReturnFlow." />
  if (loading) return <>{header}<LoadingState label="Loading users..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}
      <Card>
        <ListToolbar
          query={query}
          onQueryChange={(v) => { setQuery(v); setPage(1) }}
          searchLabel="Search users"
          searchPlaceholder="Search by name or email..."
          filters={[{ value: role, onChange: (v) => { setRole(v); setPage(1) }, label: 'Filter users by role', options: roleOptions }]}
        />
        {data.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users yet" description="Accounts will be listed here." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX} title="No users match your filters" description="Try a different search or role." />
        ) : (
          <>
            <UsersTable rows={filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="users" onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
