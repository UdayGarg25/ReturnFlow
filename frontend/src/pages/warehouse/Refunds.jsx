import { CircleCheck, Clock, SearchX, Wallet } from 'lucide-react'
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
import StatCard from '../../components/StatCard.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import useApi from '../../hooks/useApi.js'
import { DATE_FILTER_OPTIONS, getInspections, matchesDateFilter, REFUND_STATUS_OPTIONS } from '../../services/warehouseService.js'
import { formatDate } from '../../utils/format.js'
import { returnLabel } from '../../utils/labels.js'

const PAGE_SIZE = 5

const columns = [
  { header: 'Return ID', render: (i) => `#${returnLabel(i.returnId)}` },
  { header: 'Customer', render: (i) => i.customerName },
  { header: 'Product', render: (i) => <ProductCell name={i.product.name} /> },
  { header: 'Approved', render: (i) => formatDate(i.updatedAt) },
  { header: 'Status', render: (i) => <StatusBadge status={i.refundStatus} /> },
  {
    header: 'Actions',
    action: true,
    align: 'right',
    render: (i) => (
      <Button to={`/dashboard/inspections/${i.id}`} state={{ section: 'history' }} variant="outline" size="sm">
        View
      </Button>
    ),
  },
]

// There is no refunds endpoint for the warehouse: this lists approved inspections together with
// the refund state of their return (REFUND_PENDING -> pending, REFUNDED/COMPLETED -> completed).
export default function Refunds() {
  const { data, error, loading, reload } = useApi((signal) => getInspections({ signal }))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [range, setRange] = useState('all')
  const [page, setPage] = useState(1)

  const refunds = useMemo(() => (data ?? []).filter((i) => i.refundStatus).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [data])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '')
    return refunds.filter(
      (i) =>
        (status === 'ALL' || i.refundStatus === status) &&
        matchesDateFilter(i.updatedAt, range) &&
        (!q || returnLabel(i.returnId).toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q) || i.product.name.toLowerCase().includes(q)),
    )
  }, [refunds, query, status, range])

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const reset = (setter) => (v) => { setter(v); setPage(1) }
  const header = <PageHeader title="Refunds" subtitle="Track refund status for approved returns." />

  if (loading) return <>{header}<LoadingState label="Loading refunds..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  const pending = refunds.filter((i) => i.refundStatus === 'PENDING').length
  return (
    <>
      {header}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard icon={Clock} label="Refunds Pending" value={pending} tone="bg-amber-100 text-amber-600" />
        <StatCard icon={CircleCheck} label="Completed" value={refunds.length - pending} tone="bg-emerald-100 text-emerald-600" />
      </div>

      <Card className="mt-6">
        <ListToolbar
          query={query}
          onQueryChange={reset(setQuery)}
          searchLabel="Search refunds"
          searchPlaceholder="Search by return ID, customer or product..."
          filters={[
            { value: status, onChange: reset(setStatus), label: 'Filter refunds by status', options: REFUND_STATUS_OPTIONS },
            { value: range, onChange: reset(setRange), label: 'Filter refunds by date', options: DATE_FILTER_OPTIONS },
          ]}
        />
        {refunds.length === 0 ? (
          <EmptyState icon={Wallet} title="No refunds yet" description="Refunds are created when a return is approved." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX} title="No refunds match your filters" description="Try a different search, status or date range." />
        ) : (
          <>
            <DataTable columns={columns} rows={visible} getKey={(i) => i.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="refunds" onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
