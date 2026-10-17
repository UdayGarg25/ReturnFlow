import { ClipboardList } from 'lucide-react'
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
import { formatSlot } from '../../utils/format.js'
import { pickupLabel } from '../../utils/labels.js'
import { matchesDateFilter } from '../../utils/ranges.js'

const PAGE_SIZE = 5

const statusOptions = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ASSIGNED', label: 'Pending' },
  { value: 'ACCEPTED', label: 'Accepted' },
]
const dateOptions = [
  { value: 'all', label: 'All Dates' },
  { value: 'today', label: 'Assigned today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]

const columns = [
  { header: 'Pickup ID', render: (p) => `#${pickupLabel(p.id)}` },
  { header: 'Customer', render: (p) => p.customerName },
  { header: 'Product', render: (p) => <ProductCell name={p.product.name} /> },
  { header: 'Reason', render: (p) => p.reason },
  { header: 'Assigned', render: (p) => formatSlot(p.assignedAt) },
  { header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
  {
    header: 'Actions',
    action: true,
    align: 'right',
    render: (p) => (
      <Button to={`/dashboard/pickups/${p.id}`} variant="outline" size="sm">
        View
      </Button>
    ),
  },
]

export default function Pickups() {
  const { data, error, loading, reload } = useApi((signal) => getPickups({ signal }))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [date, setDate] = useState('all')
  const [page, setPage] = useState(1)

  const open = useMemo(() => (data ?? []).filter(isOpenPickup).sort((a, b) => new Date(a.assignedAt) - new Date(b.assignedAt)), [data])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '')
    return open.filter(
      (p) =>
        (status === 'ALL' || p.status === status) &&
        matchesDateFilter(p.assignedAt, date) &&
        (!q || pickupLabel(p.id).toLowerCase().includes(q) || p.customerName.toLowerCase().includes(q) || p.product.name.toLowerCase().includes(q)),
    )
  }, [open, query, status, date])

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const header = <PageHeader title="Assigned Pickups" subtitle="View and manage your assigned pickups." />

  if (loading) return <>{header}<LoadingState label="Loading your pickups..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}
      <Card>
        <ListToolbar
          query={query}
          onQueryChange={(v) => { setQuery(v); setPage(1) }}
          searchLabel="Search pickups"
          searchPlaceholder="Search by customer or product..."
          filters={[
            { value: status, onChange: (v) => { setStatus(v); setPage(1) }, label: 'Filter pickups by status', options: statusOptions },
            { value: date, onChange: (v) => { setDate(v); setPage(1) }, label: 'Filter pickups by date', options: dateOptions },
          ]}
        />
        {filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No pickups found" description={open.length ? 'Try a different search, status or date.' : 'New pickups assigned to you will show up here.'} />
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
