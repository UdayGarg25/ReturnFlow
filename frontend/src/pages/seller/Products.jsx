import { Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import DataTable from '../../components/DataTable.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ListToolbar from '../../components/ListToolbar.jsx'
import Notice from '../../components/Notice.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import Pagination from '../../components/Pagination.jsx'
import { ProductCell } from '../../components/ProductThumb.jsx'
import RowMenu from '../../components/RowMenu.jsx'
import useApi from '../../hooks/useApi.js'
import { deleteSellerProduct, getSellerProducts } from '../../services/sellerService.js'
import { formatCurrency, formatDate } from '../../utils/format.js'
import { productLabel } from '../../utils/labels.js'

const PAGE_SIZE = 5

export default function Products() {
  const { data: products, error, loading, reload } = useApi((signal) => getSellerProducts({ signal }))
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState(null) // the product awaiting delete confirmation
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState(null) // { tone, text }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (products ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || productLabel(p.id).toLowerCase().includes(q))
  }, [products, query])

  const lastPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, lastPage)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const header = (
    <PageHeader
      title="Products"
      subtitle="Manage your product catalog."
      action={
        <Button to="/dashboard/products/new" size="lg">
          <Plus size={16} aria-hidden="true" /> Add Product
        </Button>
      }
    />
  )

  if (loading) return <>{header}<LoadingState label="Loading your products..." /></>
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>

  const remove = async () => {
    setDeleting(true)
    try {
      await deleteSellerProduct(confirm.id)
      setNotice({ tone: 'success', text: `${confirm.name} was deleted.` })
      reload() // show what the database now holds
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
    } finally {
      setConfirm(null)
      setDeleting(false)
    }
  }

  const columns = [
    { header: '#', render: (p) => productLabel(p.id) },
    { header: 'Product', render: (p) => <ProductCell name={p.name} /> },
    { header: 'Price', render: (p) => formatCurrency(p.price) },
    { header: 'Added', render: (p) => formatDate(p.createdAt) },
    {
      header: 'Actions',
      action: true,
      align: 'right',
      render: (p) => (
        <div className="flex justify-end gap-2">
          <Button to={`/dashboard/products/${p.id}`} variant="outline" size="sm" className="flex-1 sm:flex-none" aria-label={`Edit ${p.name}`}>
            <Pencil size={14} aria-hidden="true" /> Edit
          </Button>
          <RowMenu label={`More actions for ${p.name}`} items={[{ label: 'Delete', icon: Trash2, danger: true, onSelect: () => { setNotice(null); setConfirm(p) } }]} />
        </div>
      ),
    },
  ]

  return (
    <>
      {header}
      {notice && <Notice tone={notice.tone} className="mb-4">{notice.text}</Notice>}
      {confirm && (
        <div role="alertdialog" aria-label="Confirm delete" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">Delete &ldquo;{confirm.name}&rdquo;?</p>
          <p className="mt-1 text-sm text-red-800">This cannot be undone. Products that already have orders cannot be deleted.</p>
          <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={remove} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete Product'}</Button>
          </div>
        </div>
      )}
      <Card>
        <ListToolbar
          query={query}
          onQueryChange={(v) => { setQuery(v); setPage(1) }}
          searchLabel="Search products"
          searchPlaceholder="Search products by name..."
          filters={[]}
        />
        {filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products found"
            description={products.length ? 'Try a different search.' : 'Add your first product to start selling.'}
            action={!products.length && <Button to="/dashboard/products/new">Add Product</Button>}
          />
        ) : (
          <>
            <DataTable columns={columns} rows={visible} getKey={(p) => p.id} />
            <Pagination page={current} pageSize={PAGE_SIZE} total={filtered.length} label="products" onChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
