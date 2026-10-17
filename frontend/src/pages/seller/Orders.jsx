import { ShoppingBag } from 'lucide-react'
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
import { getSellerOrders, ORDER_RANGE_OPTIONS } from '../../services/sellerService.js'
import { formatCurrency, formatDate } from '../../utils/format.js'
import { orderLabel } from '../../utils/labels.js'
import { isInRange } from '../../utils/ranges.js'
import { statusMeta } from '../../utils/status.js'

const PAGE_SIZE = 5

const columns = [
  { header: 'Order ID', render: (o) => `#${orderLabel(o.id)}` },
  { header: 'Customer', render: (o) => o.customerName },
  { header: 'Products', render: (o) => <ProductCell name={o.items[0].name} extra={o.items.length > 1 ? `+${o.items.length - 1} more` : null} /> },
  { header: 'Date', render: (o) => formatDate(o.placedAt) },
  { header: 'Amount', render: (o) => formatCurrency(o.total) },
  { header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
  {
    header: 'Actions',
    action: true,
    align: 'right',
    render: (o) => (
      <Button to={`/dashboard/orders/${o.id}`} variant="outline" size="sm">
        View Order
      </Button>
    ),
  },
]

export default function Orders() {
  const { data: orders, error, loading, reload } = useApi((signal) => getSellerOrders({ signal }))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [range, setRange] = useState('all')
  const [page, setPage] = useState(1)

  const statusOptions = useMemo(
    () => [{ value: 'ALL', label: 'All Statuses' }, ...[...new Set((orders ?? []).map((o) => o.status))].map((s) => ({ value: s, label: statusMeta(s).label }))],
    [orders],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '')
    return (orders ?? []).filter(
      (o) =>
        (status === 'ALL' || o.status === status) &&
        isInRange(o.placedAt, range) &&
        (!q || orderLabel(o.id).toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || o.items.some((i) => i.name.toLowerCase().includes(q))),
    )
  }, [orders, query, status, range])

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const header = <PageHeader title="Orders" subtitle="Orders containing your products." />

  if (loading) return <>{header}<LoadingState label="Loading orders..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}
      <Card>
        <ListToolbar
          query={query}
          onQueryChange={(v) => { setQuery(v); setPage(1) }}
          searchLabel="Search orders"
          searchPlaceholder="Search orders, customers or products..."
          filters={[
            { value: status, onChange: (v) => { setStatus(v); setPage(1) }, label: 'Filter orders by status', options: statusOptions },
            { value: range, onChange: (v) => { setRange(v); setPage(1) }, label: 'Filter orders by date', options: ORDER_RANGE_OPTIONS },
          ]}
        />
        {filtered.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No orders found"
            description={orders.length ? 'Try a different search, status or date range.' : 'Orders containing your products will show up here.'}
          />
        ) : (
          <>
            <DataTable columns={columns} rows={visible} getKey={(o) => o.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="orders" onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
