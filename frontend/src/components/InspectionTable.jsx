import { formatDate } from '../utils/format.js'
import { returnLabel } from '../utils/labels.js'
import AIFlagBadge from './AIFlagBadge.jsx'
import Button from './Button.jsx'
import DataTable from './DataTable.jsx'
import { ProductCell } from './ProductThumb.jsx'
import StatusBadge from './StatusBadge.jsx'

// Rows of the warehouse inspection queue. `compact` is the dashboard version
// (bigger call to action).
export default function InspectionTable({ rows, compact = false }) {
  const columns = [
    { header: 'Return ID', render: (i) => `#${returnLabel(i.returnId)}` },
    { header: 'Product', render: (i) => <ProductCell name={i.product.name} /> },
    { header: 'Customer', render: (i) => i.customerName },
    { header: 'Created', render: (i) => formatDate(i.createdAt) },
    { header: 'Status', render: (i) => <StatusBadge status={i.displayStatus} /> },
    { header: 'AI Flag', render: (i) => <AIFlagBadge flag={i.aiFlag} /> },
    {
      header: 'Actions',
      action: true,
      align: 'right',
      render: (i) => (
        <Button to={`/dashboard/inspections/${i.id}`} variant="outline" size="sm">
          {compact ? 'View Inspection' : 'View'}
        </Button>
      ),
    },
  ]
  return <DataTable columns={columns} rows={rows} getKey={(i) => i.id} />
}
