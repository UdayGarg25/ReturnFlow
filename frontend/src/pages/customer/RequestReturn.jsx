import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/ApiState.jsx'
import Breadcrumbs from '../../components/Breadcrumbs.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import { SelectField, TextAreaField } from '../../components/FormField.jsx'
import Notice from '../../components/Notice.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import ProductThumb from '../../components/ProductThumb.jsx'
import PhotoSlots from '../../components/PhotoSlots.jsx'
import PhotosCard from '../../components/PhotosCard.jsx'
import { useAuth } from '../../context/useAuth.js'
import useApi from '../../hooks/useApi.js'
import { MAX_PHOTOS, photoProblem, uploadReturnImage } from '../../services/returnImageService.js'
import { createCustomerReturn, getCustomerOrder, getCustomerOrders, getCustomerReturns, orderLabel } from '../../services/customerService.js'
import { formatCurrency, formatDate } from '../../utils/format.js'
import { RETURN_REASONS } from '../../utils/returnReasons.js'

// Customer picks one item from one of their delivered orders. Only the item, reason and
// description are sent; the backend decides who the customer is and checks the item is
// theirs and eligible, so nothing here is authoritative.
export default function RequestReturn() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [params] = useSearchParams()

  const lists = useApi(async (signal) => {
    const [orders, returns] = await Promise.all([getCustomerOrders({ signal }), getCustomerReturns({ signal })])
    return { orders, returns }
  })

  const [orderId, setOrderId] = useState(params.get('order') ?? '')
  const [form, setForm] = useState({ itemId: '', reason: '', description: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  // Photos are chosen first and uploaded right after the return is created (a photo needs a return to belong to).
  const [staged, setStaged] = useState([]) // { key, file, src, status, progress, error }
  const [photoNotice, setPhotoNotice] = useState(null)
  const [created, setCreated] = useState(null) // the return, once it exists
  const uploadAbort = useRef(null)
  const previews = useRef(new Set())
  useEffect(() => {
    const urls = previews.current
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); uploadAbort.current?.abort() }
  }, [])

  const delivered = (lists.data?.orders ?? []).filter((o) => o.status === 'DELIVERED')
  // an order id from the URL only counts if it is one of the customer's delivered orders
  const selected = delivered.some((o) => String(o.id) === orderId) ? orderId : ''
  const order = useApi((signal) => (selected ? getCustomerOrder(selected, { signal }) : Promise.resolve(null)), [selected])

  const header = (
    <>
      <Breadcrumbs items={[{ label: 'My Returns', to: '/dashboard/returns' }, { label: 'Request a Return' }]} />
      <PageHeader title="Request a Return" subtitle="Tell us what went wrong and we'll take it from here." />
    </>
  )

  if (lists.loading) return <>{header}<LoadingState label="Loading your orders..." /></>
  if (lists.error) return <>{header}<ErrorState error={lists.error} onRetry={lists.reload} /></>

  // items that already have an open return cannot be returned again (a rejected one can be retried)
  const taken = new Set(lists.data.returns.filter((r) => r.status !== 'SELLER_REJECTED').map((r) => r.orderItemId))
  const items = (order.data?.items ?? []).filter((i) => !taken.has(i.id))
  const chosenItem = items.find((i) => String(i.id) === form.itemId)
  const hiddenCount = (order.data?.items.length ?? 0) - items.length

  const setField = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }))

  const patchPhoto = (key, patch) => setStaged((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  const addPhotos = (files) => {
    setPhotoNotice(null)
    const room = MAX_PHOTOS - staged.length
    const picked = [...files]
    const accepted = []
    for (const file of picked) {
      const problem = photoProblem(file)
      if (problem) { setPhotoNotice({ tone: 'error', text: problem }); continue }
      if (accepted.length >= room) { setPhotoNotice({ tone: 'error', text: 'You can add at most 2 photos.' }); break }
      const src = URL.createObjectURL(file)
      previews.current.add(src)
      accepted.push({ key: `${file.name}-${file.size}-${Date.now()}-${accepted.length}`, file, src, status: 'ready' })
    }
    if (accepted.length > 0) setStaged((list) => [...list, ...accepted])
  }
  const removePhoto = (item) => {
    URL.revokeObjectURL(item.src)
    previews.current.delete(item.src)
    setStaged((list) => list.filter((p) => p.key !== item.key))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const errors = {}
    if (!selected) errors.order = 'Choose an order.'
    if (!form.itemId) errors.itemId = 'Choose the item you are returning.'
    if (!form.reason) errors.reason = 'Choose a reason.'
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      const ret = await createCustomerReturn({ orderItemId: Number(form.itemId), reason: form.reason, description: form.description })
      setCreated(ret)
      // the return exists now: upload the chosen photos one by one (with progress), then open the return
      const controller = new AbortController()
      uploadAbort.current = controller
      let failed = 0
      for (const photo of staged) {
        patchPhoto(photo.key, { status: 'uploading', progress: 0 })
        try {
          await uploadReturnImage(ret.id, photo.file, { signal: controller.signal, onProgress: (progress) => patchPhoto(photo.key, { progress }) })
          patchPhoto(photo.key, { status: 'saved' })
        } catch (uploadErr) {
          failed++
          patchPhoto(photo.key, { status: 'error', error: uploadErr.name === 'AbortError' ? 'Cancelled' : uploadErr.message })
          if (uploadErr.name === 'AbortError') break
        }
      }
      if (failed === 0) navigate(`/dashboard/returns/${ret.id}`)
    } catch (err) {
      if (err.status === 401) refreshUser() // session ended: the route guard takes over
      const fromApi = { itemId: err.fieldErrors?.orderItemId, reason: err.fieldErrors?.reason, description: err.fieldErrors?.description }
      setFieldErrors(Object.fromEntries(Object.entries(fromApi).filter(([, v]) => v)))
      setFormError(Object.values(fromApi).some(Boolean) ? null : err.message)
      setSubmitting(false)
    }
  }

  return (
    <>
      {header}
      {delivered.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-slate-500">You have no delivered orders to return yet. Items can be returned once an order is delivered.</p>
          <div className="text-center"><Button to="/dashboard/orders" variant="secondary">View my orders</Button></div>
        </Card>
      ) : (
        <form onSubmit={submit} noValidate className="grid max-w-5xl gap-6 lg:grid-cols-2 lg:items-start">
          <Card>
            <div className="space-y-5">
            {created && staged.some((p) => p.status === 'error') && (
              <Notice tone="warning">
                Your return request was submitted, but a photo could not be uploaded. You can add it again from the return page.{' '}
                <Button to={`/dashboard/returns/${created.id}`} size="sm" className="ml-1">Open my return</Button>
              </Notice>
            )}
            {formError && <Notice tone="error">{formError}</Notice>}

            <SelectField
              label="Order"
              required
              placeholder="Select an order"
              value={selected}
              onChange={(e) => {
                setOrderId(e.target.value)
                setForm((f) => ({ ...f, itemId: '' }))
              }}
              options={delivered.map((o) => ({ value: String(o.id), label: `#${orderLabel(o.id)} - ${formatDate(o.placedAt)} - ${formatCurrency(o.total)}` }))}
              error={fieldErrors.order}
            />

            {selected && order.loading && <p role="status" className="text-sm text-slate-500">Loading items...</p>}
            {selected && order.error && <Notice tone="error">We couldn&apos;t load that order&apos;s items. <button type="button" onClick={order.reload} className="font-semibold underline">Try again</button></Notice>}
            {selected && order.data && (
              <>
                {items.length === 0 ? (
                  <Notice>Every item in this order already has a return request.</Notice>
                ) : (
                  <SelectField
                    label="Item to return"
                    required
                    placeholder="Select an item"
                    value={form.itemId}
                    onChange={setField('itemId')}
                    options={items.map((i) => ({ value: String(i.id), label: `${i.name} (qty ${i.quantity}) - ${formatCurrency(i.unitPrice * i.quantity)}` }))}
                    error={fieldErrors.itemId}
                    hint={hiddenCount > 0 ? `${hiddenCount} item(s) in this order already have a return request.` : undefined}
                  />
                )}
              </>
            )}

            {chosenItem && (
              <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-3" data-testid="chosen-item">
                <ProductThumb name={chosenItem.name} size="xl" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">{chosenItem.name}</p>
                  <p className="text-slate-500">Qty {chosenItem.quantity} &middot; {formatCurrency(chosenItem.unitPrice * chosenItem.quantity)}</p>
                  <p className="text-slate-500">Order #{orderLabel(selected)}</p>
                </div>
              </div>
            )}

            <SelectField label="Reason" required placeholder="Select a reason" value={form.reason} onChange={setField('reason')} options={RETURN_REASONS} error={fieldErrors.reason} />
            <TextAreaField label="Description" rows={4} maxLength={1000} placeholder="Tell us more (optional)" value={form.description} onChange={setField('description')} error={fieldErrors.description} />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button to="/dashboard/returns" variant="secondary" size="lg">Cancel</Button>
              <Button type="submit" size="lg" disabled={submitting || Boolean(created) || (selected && items.length === 0)}>{submitting ? (staged.some((p) => p.status === 'uploading') ? 'Uploading photos...' : 'Submitting...') : 'Submit Return Request'}</Button>
            </div>
            </div>
          </Card>

          <PhotosCard
            title="Return Photos"
            optional
            count={staged.length}
            intro="Add up to 2 photos of the item. Clear photos help us process your return faster."
            notice={photoNotice}
            tips
          >
            <PhotoSlots items={staged} onFiles={addPhotos} onRemove={removePhoto} onCancel={() => uploadAbort.current?.abort()} disabled={submitting} />
          </PhotosCard>
        </form>
      )}
    </>
  )
}
