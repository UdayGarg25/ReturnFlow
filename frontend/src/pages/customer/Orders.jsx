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
import StatusBadge from '../../components/StatusBadge.jsx'
import useApi from '../../hooks/useApi.js'
import { getCustomerOrders, orderLabel } from '../../services/customerService.js'
import { formatCurrency, formatDate } from '../../utils/format.js'
import { statusMeta } from '../../utils/status.js'

const PAGE_SIZE = 5

// The API's order list carries no line items, so there is no product column here;
// the products are on the order's detail page.
const columns = [
  { header: 'Order ID', render: (o) => `#${orderLabel(o.id)}` },
  { header: 'Date', render: (o) => formatDate(o.placedAt) },
  { header: 'Amount', render: (o) => formatCurrency(o.total) },
  { header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
  {
    header: 'Actions',
    action: true,
    align: 'right',
    render: (o) => (
      <Button to={`/dashboard/orders/${o.id}`} variant="outline" size="sm">
        View Details
      </Button>
    ),
  },
]

export default function Orders() {
  const { data: orders, error, loading, reload } = useApi((signal) => getCustomerOrders({ signal }))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [page, setPage] = useState(1)

  const filterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'All Orders' },
      ...[...new Set((orders ?? []).map((o) => o.status))].map((s) => ({ value: s, label: statusMeta(s).label })),
    ],
    [orders],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '')
    return (orders ?? []).filter((o) => (status === 'ALL' || o.status === status) && (!q || orderLabel(o.id).toLowerCase().includes(q)))
  }, [orders, query, status])

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const header = <PageHeader title="My Orders" subtitle="View and track all your orders." />

  if (loading) return <>{header}<LoadingState label="Loading your orders..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}
      <Card>
        <ListToolbar
          query={query}
          onQueryChange={(v) => { setQuery(v); setPage(1) }}
          searchLabel="Search orders"
          searchPlaceholder="Search by order ID..."
          filters={[
            { value: status, onChange: (v) => { setStatus(v); setPage(1) }, label: 'Filter orders by status', options: filterOptions },
          ]}
        />
        {filtered.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No orders found"
            description={orders.length ? 'Try a different search or status filter.' : 'Orders you place will show up here.'}
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
