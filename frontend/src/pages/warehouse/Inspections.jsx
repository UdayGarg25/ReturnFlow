import { ClipboardCheck, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Card from '../../components/Card.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import InspectionTable from '../../components/InspectionTable.jsx'
import ListToolbar from '../../components/ListToolbar.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import Pagination from '../../components/Pagination.jsx'
import useApi from '../../hooks/useApi.js'
import { AI_FLAG_OPTIONS, DATE_FILTER_OPTIONS, getInspections, matchesDateFilter, QUEUE_STATUS_OPTIONS } from '../../services/warehouseService.js'
import { isOpen } from '../../utils/inspection.js'
import { returnLabel } from '../../utils/labels.js'

const PAGE_SIZE = 5

export default function Inspections() {
  const { data, error, loading, reload } = useApi((signal) => getInspections({ signal }))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [date, setDate] = useState('all')
  const [flag, setFlag] = useState('ALL')
  const [page, setPage] = useState(1)

  const queue = useMemo(() => (data ?? []).filter(isOpen).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), [data])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '')
    return queue.filter(
      (i) =>
        (status === 'ALL' || i.status === status) &&
        (flag === 'ALL' || i.aiFlag === flag) &&
        matchesDateFilter(i.createdAt, date) &&
        (!q || returnLabel(i.returnId).toLowerCase().includes(q) || i.product.name.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q)),
    )
  }, [queue, query, status, date, flag])

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const reset = (setter) => (v) => { setter(v); setPage(1) }
  const header = <PageHeader title="Inspection Queue" subtitle="Review and inspect returned products received at the warehouse." />

  if (loading) return <>{header}<LoadingState label="Loading inspections..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  return (
    <>
      {header}
      <Card>
        <ListToolbar
          query={query}
          onQueryChange={reset(setQuery)}
          searchLabel="Search inspections"
          searchPlaceholder="Search by return ID, product or customer..."
          filters={[
            { value: status, onChange: reset(setStatus), label: 'Filter inspections by status', options: QUEUE_STATUS_OPTIONS },
            { value: date, onChange: reset(setDate), label: 'Filter inspections by created date', options: DATE_FILTER_OPTIONS },
            { value: flag, onChange: reset(setFlag), label: 'Filter inspections by AI result', options: AI_FLAG_OPTIONS },
          ]}
        />
        {queue.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No inspections found" description="Returns received at the warehouse will show up here." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX} title="No inspections match your filters" description="Try a different search, status, date or AI result." />
        ) : (
          <>
            <InspectionTable rows={visible} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} label="inspections" onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
