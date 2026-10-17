import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Breadcrumbs from '../../components/Breadcrumbs.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import ProductForm from '../../components/ProductForm.jsx'
import useApi from '../../hooks/useApi.js'
import { createSellerProduct, getSellerProduct, updateSellerProduct } from '../../services/sellerService.js'
import { productLabel } from '../../utils/labels.js'

// Serves both /dashboard/products/new and /dashboard/products/:id.
export default function ProductFormPage() {
  const { id } = useParams()
  return id === undefined ? <NewProduct /> : <EditProduct key={id} id={id} />
}

function NewProduct() {
  const navigate = useNavigate()
  return (
    <>
      <Breadcrumbs items={[{ label: 'Products', to: '/dashboard/products' }, { label: 'Add Product' }]} />
      <PageHeader title="Add Product" subtitle="Add a new product to your catalog." />
      <ProductForm
        cancelTo="/dashboard/products"
        onSubmit={async (values) => {
          await createSellerProduct(values)
          navigate('/dashboard/products')
        }}
      />
    </>
  )
}

function EditProduct({ id }) {
  const { data: product, error, loading, reload } = useApi((signal) => getSellerProduct(id, { signal }), [id])

  if (loading) return <LoadingState label="Loading the product..." />
  if (error) {
    return <ErrorState error={error} onRetry={reload} notFoundTitle="Product not found" notFoundText="We couldn't find that product in your catalog." backTo={{ to: '/dashboard/products', label: 'Back to Products' }} />
  }
  return (
    <>
      <Breadcrumbs items={[{ label: 'Products', to: '/dashboard/products' }, { label: 'Edit Product' }]} />
      <PageHeader title="Edit Product" subtitle={`Update the details for ${product.name} (${productLabel(product.id)}).`} />
      <ProductForm product={product} cancelTo="/dashboard/products" onSubmit={(values) => updateSellerProduct(id, values)} />
    </>
  )
}
