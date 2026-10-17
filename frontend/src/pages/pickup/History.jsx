import { History as HistoryIcon } from 'lucide-react'
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
import { getPickups, isOpenPickup } from '../../services/pickupService.js'
import { formatDate } from '../../utils/format.js'
import { pickupLabel } from '../../utils/labels.js'
import { matchesDateFilter } from '../../utils/ranges.js'

const PAGE_SIZE = 5

const statusOptions = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PICKED_UP', label: 'Picked Up' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]
const rangeOptions = [
  { value: 'all', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]

// The API dates a finished pickup by when it was picked up, or else when it was assigned.
const whenOf = (p) => p.pickedUpAt ?? p.assignedAt

const columns = [
  { header: 'Pickup ID', render: (p) => `#${pickupLabel(p.id)}` },
  { header: 'Customer', render: (p) => p.customerName },
  { header: 'Product', render: (p) => <ProductCell name={p.product.name} /> },
  { header: 'Pickup Date', render: (p) => formatDate(whenOf(p)) },
  { header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
  {
    header: 'Action',
    action: true,
    align: 'right',
    render: (p) => (
      <Button to={`/dashboard/pickups/${p.id}`} state={{ section: 'history' }} variant="outline" size="sm">
        View
      </Button>
    ),
  },
]

export default function History() {
  const { data, error, loading, reload } = useApi((signal) => getPickups({ signal }))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [range, setRange] = useState('all')
  const [page, setPage] = useState(1)

  const history = useMemo(() => (data ?? []).filter((p) => !isOpenPickup(p)).sort((a, b) => new Date(whenOf(b)) - new Date(whenOf(a))), [data])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '')
    return history.filter(
      (p) =>
        (status === 'ALL' || p.status === status) &&
        matchesDateFilter(whenOf(p), range) &&
        (!q || pickupLabel(p.id).toLowerCase().includes(q) || p.customerName.toLowerCase().includes(q) || p.product.name.toLowerCase().includes(q)),
    )
  }, [history, query, status, range])

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const header = <PageHeader title="Pickup History" subtitle="Review your completed, failed and cancelled pickups." />

  if (loading) return <>{header}<LoadingState label="Loading your pickup history..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}
      <Card>
        <ListToolbar
          query={query}
          onQueryChange={(v) => { setQuery(v); setPage(1) }}
          searchLabel="Search pickup history"
          searchPlaceholder="Search by customer, product or ID..."
          filters={[
            { value: status, onChange: (v) => { setStatus(v); setPage(1) }, label: 'Filter history by status', options: statusOptions },
            { value: range, onChange: (v) => { setRange(v); setPage(1) }, label: 'Filter history by date', options: rangeOptions },
          ]}
        />
        {filtered.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="No pickups found" description={history.length ? 'Try a different search, status or date range.' : 'Finished pickups will be listed here.'} />
        ) : (
          <>
            <DataTable columns={columns} rows={visible} getKey={(p) => p.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="pickups" onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
