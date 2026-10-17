import { Undo2 } from 'lucide-react'
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
import { getSellerReturns } from '../../services/sellerService.js'
import { formatDate } from '../../utils/format.js'
import { returnLabel } from '../../utils/labels.js'
import { statusMeta, TONE_GROUPS } from '../../utils/status.js'

const PAGE_SIZE = 5

const statusOptions = [{ value: 'ALL', label: 'All Statuses' }, ...Object.entries(TONE_GROUPS).map(([value, label]) => ({ value, label }))]

const columns = [
  { header: 'Return ID', render: (r) => `#${returnLabel(r.id)}` },
  { header: 'Product', render: (r) => <ProductCell name={r.product.name} /> },
  { header: 'Customer', render: (r) => r.customerName },
  { header: 'Reason', render: (r) => r.reason },
  { header: 'Date', render: (r) => formatDate(r.requestedAt) },
  { header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  {
    header: 'Action',
    action: true,
    align: 'right',
    render: (r) => (
      <Button to={`/dashboard/returns/${r.id}`} variant={r.status === 'RETURN_REQUESTED' ? 'primary' : 'outline'} size="sm">
        {r.status === 'RETURN_REQUESTED' ? 'Review' : 'View'}
      </Button>
    ),
  },
]

export default function Returns() {
  const { data: returns, error, loading, reload } = useApi((signal) => getSellerReturns({ signal }))
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('ALL')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '')
    return (returns ?? []).filter(
      (r) =>
        (group === 'ALL' || statusMeta(r.status).tone === group) &&
        (!q || returnLabel(r.id).toLowerCase().includes(q) || r.product.name.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q)),
    )
  }, [returns, query, group])

  const pending = (returns ?? []).filter((r) => r.status === 'RETURN_REQUESTED').length
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const header = (
    <PageHeader
      title="Return Requests"
      subtitle="Review and manage customer return requests."
      action={
        pending > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">{pending} awaiting your decision</p>
        )
      }
    />
  )

  if (loading) return <>{header}<LoadingState label="Loading return requests..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}
      <Card>
        <ListToolbar
          query={query}
          onQueryChange={(v) => { setQuery(v); setPage(1) }}
          searchLabel="Search return requests"
          searchPlaceholder="Search by return, product or customer..."
          filters={[{ value: group, onChange: (v) => { setGroup(v); setPage(1) }, label: 'Filter returns by status', options: statusOptions }]}
        />
        {filtered.length === 0 ? (
          <EmptyState
            icon={Undo2}
            title="No return requests found"
            description={returns.length ? 'Try a different search or status filter.' : 'Return requests for your products will show up here.'}
          />
        ) : (
          <>
            <DataTable columns={columns} rows={visible} getKey={(r) => r.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="requests" onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
