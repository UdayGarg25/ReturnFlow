import { ClipboardCheck, SearchX } from 'lucide-react'
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
import { useAuth } from '../../context/useAuth.js'
import useApi from '../../hooks/useApi.js'
import { DATE_FILTER_OPTIONS, getInspections, HISTORY_STATUS_OPTIONS, matchesDateFilter } from '../../services/warehouseService.js'
import { formatDateTime } from '../../utils/format.js'
import { conditionLabel, isOpen } from '../../utils/inspection.js'
import { returnLabel } from '../../utils/labels.js'

const PAGE_SIZE = 5

export default function CompletedInspections() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useApi((signal) => getInspections({ signal }))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [range, setRange] = useState('all')
  const [page, setPage] = useState(1)

  const completed = useMemo(() => (data ?? []).filter((i) => !isOpen(i)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [data])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '')
    return completed.filter(
      (i) =>
        (status === 'ALL' || i.status === status) &&
        matchesDateFilter(i.updatedAt, range) &&
        (!q || returnLabel(i.returnId).toLowerCase().includes(q) || i.product.name.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q)),
    )
  }, [completed, query, status, range])

  const columns = [
    { header: 'Return ID', render: (i) => `#${returnLabel(i.returnId)}` },
    { header: 'Product', render: (i) => <ProductCell name={i.product.name} /> },
    { header: 'Customer', render: (i) => i.customerName },
    { header: 'Inspection Date', render: (i) => formatDateTime(i.updatedAt) },
    { header: 'Condition', render: (i) => conditionLabel(i.condition) },
    { header: 'Result', render: (i) => <StatusBadge status={i.displayStatus} /> },
    { header: 'Inspector', render: (i) => (i.staffId === user.id ? 'You' : `Staff #${i.staffId}`) },
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

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const reset = (setter) => (v) => { setter(v); setPage(1) }
  const header = <PageHeader title="Completed Inspections" subtitle="View all processed inspections." />

  if (loading) return <>{header}<LoadingState label="Loading inspections..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}
      <Card>
        <ListToolbar
          query={query}
          onQueryChange={reset(setQuery)}
          searchLabel="Search completed inspections"
          searchPlaceholder="Search by return ID, product or customer..."
          filters={[
            { value: status, onChange: reset(setStatus), label: 'Filter completed inspections by result', options: HISTORY_STATUS_OPTIONS },
            { value: range, onChange: reset(setRange), label: 'Filter completed inspections by date', options: DATE_FILTER_OPTIONS },
          ]}
        />
        {completed.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No completed inspections yet" description="Approved and rejected inspections will be listed here." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX} title="No inspections match your filters" description="Try a different search, result or date range." />
        ) : (
          <>
            <DataTable columns={columns} rows={visible} getKey={(i) => i.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="inspections" onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
