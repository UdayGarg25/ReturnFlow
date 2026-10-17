import { Plus, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import DataTable from '../../components/DataTable.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ListToolbar from '../../components/ListToolbar.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import Pagination from '../../components/Pagination.jsx'
import { ProductCell } from '../../components/ProductThumb.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import useApi from '../../hooks/useApi.js'
import { getCustomerReturns, returnLabel } from '../../services/customerService.js'
import { formatDate } from '../../utils/format.js'
import { statusMeta, TONE_GROUPS } from '../../utils/status.js'

const PAGE_SIZE = 3

const filterOptions = [
  { value: 'ALL', label: 'All Statuses' },
  ...Object.entries(TONE_GROUPS).map(([value, label]) => ({ value, label })),
]

const columns = [
  { header: 'Return ID', render: (r) => `#${returnLabel(r.id)}` },
  { header: 'Product', render: (r) => <ProductCell name={r.product.name} image /> },
  { header: 'Reason', render: (r) => r.reason },
  { header: 'Date', render: (r) => formatDate(r.requestedAt) },
  { header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  {
    header: 'Actions',
    action: true,
    align: 'right',
    render: (r) => (
      <Button to={`/dashboard/returns/${r.id}`} variant="outline" size="sm">
        View Details
      </Button>
    ),
  },
]

export default function Returns() {
  const { data: returns, error, loading, reload } = useApi((signal) => getCustomerReturns({ signal }))
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('ALL')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '')
    return (returns ?? []).filter(
      (r) =>
        (group === 'ALL' || statusMeta(r.status).tone === group) &&
        (!q || returnLabel(r.id).toLowerCase().includes(q) || r.product.name.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q)),
    )
  }, [returns, query, group])

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const header = (
    <PageHeader
      title="My Returns"
      subtitle="View and track your return requests."
      action={
        <Button to="/dashboard/returns/new" size="lg">
          <Plus size={16} aria-hidden="true" /> Request a Return
        </Button>
      }
    />
  )

  if (loading) return <>{header}<LoadingState label="Loading your returns..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}
      <Card>
        <ListToolbar
          query={query}
          onQueryChange={(v) => { setQuery(v); setPage(1) }}
          searchLabel="Search returns"
          searchPlaceholder="Search returns or products..."
          filters={[
            { value: group, onChange: (v) => { setGroup(v); setPage(1) }, label: 'Filter returns by status', options: filterOptions },
          ]}
        />
        {filtered.length === 0 ? (
          <EmptyState
            icon={Undo2}
            title="No returns found"
            description={returns.length ? 'Try a different search or status filter.' : "You haven't requested any returns yet."}
            action={!returns.length && <Button to="/dashboard/returns/new">Request a Return</Button>}
          />
        ) : (
          <>
            <DataTable columns={columns} rows={visible} getKey={(r) => r.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="returns" onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
