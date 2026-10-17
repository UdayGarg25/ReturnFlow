import { IndianRupee } from 'lucide-react'
import { useState } from 'react'
import Button from './Button.jsx'
import Card from './Card.jsx'
import { TextAreaField, TextField } from './FormField.jsx'
import Notice from './Notice.jsx'

const DESCRIPTION_MAX = 2000

// Same rules the API applies (the API re-checks everything; this just saves a round trip).
function validate(v) {
  const errors = {}
  const name = v.name.trim()
  if (name.length < 2 || name.length > 200) errors.name = 'Name must be 2 to 200 characters.'
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v.price.trim()) || Number(v.price) <= 0) errors.price = 'Enter a valid price greater than 0, e.g. 120 or 99.50.'
  if (v.description.length > DESCRIPTION_MAX) errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`
  if (v.imageUrl.trim()) {
    let ok = v.imageUrl.length <= 500
    try {
      ok = ok && ['http:', 'https:'].includes(new URL(v.imageUrl.trim()).protocol)
    } catch {
      ok = false
    }
    if (!ok) errors.imageUrl = 'Image URL must be a valid http(s) address.'
  }
  return errors
}

const toValues = (p) => ({ name: p?.name ?? '', price: p ? String(p.price) : '', description: p?.description ?? '', imageUrl: p?.imageUrl ?? '' })

// Shared by Add Product and Edit Product. `onSubmit(values)` calls the API and rejects with an
// ApiError on failure; its field errors are shown next to the fields. The seller is never sent:
// the backend always uses the logged-in seller.
export default function ProductForm({ product, cancelTo, onSubmit }) {
  const isEdit = Boolean(product)
  const [values, setValues] = useState(() => toValues(product))
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [apiErrors, setApiErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const errors = validate(values)
  const show = (f) => (submitted || touched[f] ? errors[f] : undefined) ?? apiErrors[f]

  const field = (name) => ({
    name,
    value: values[name],
    onChange: (e) => {
      setSaved(false)
      setApiErrors((a) => ({ ...a, [name]: undefined }))
      setValues((prev) => ({ ...prev, [name]: e.target.value }))
    },
    onBlur: () => setTouched((prev) => ({ ...prev, [name]: true })),
    error: show(name),
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitted(true)
    setFormError(null)
    if (Object.keys(errors).length > 0) {
      const form = e.target
      setTimeout(() => form.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(values)
      setSaved(true)
    } catch (err) {
      setApiErrors(err.fieldErrors ?? {})
      setFormError(Object.keys(err.fieldErrors ?? {}).length > 0 ? null : err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {saved && <Notice tone="success" className="mb-6">{isEdit ? 'Changes saved.' : 'Product created.'}</Notice>}
      {formError && <Notice tone="error" className="mb-6">{formError}</Notice>}

      <Card title="Product Details" className="max-w-3xl">
        <div className="space-y-5">
          <TextField label="Product Name" required placeholder="Enter product name" autoComplete="off" {...field('name')} />
          <TextField label="Price" required icon={IndianRupee} inputMode="decimal" placeholder="0.00" autoComplete="off" {...field('price')} />
          <div>
            <TextAreaField label="Description" rows={5} placeholder="Describe the product: materials, fit, what is included..." {...field('description')} />
            <p className={`mt-1 text-right text-xs ${values.description.length > DESCRIPTION_MAX ? 'text-red-600' : 'text-slate-400'}`}>
              {values.description.length}/{DESCRIPTION_MAX}
            </p>
          </div>
          <TextField
            label="Image URL"
            placeholder="https://example.com/product.jpg"
            autoComplete="off"
            hint="Optional. Used as the reference photo when returned items are inspected."
            {...field('imageUrl')}
          />
        </div>
      </Card>

      <div className="mt-6 flex max-w-3xl flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button to={cancelTo} variant="secondary" size="lg">{saved && !isEdit ? 'Back to Products' : 'Cancel'}</Button>
        <Button type="submit" size="lg" disabled={submitting}>{submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Product'}</Button>
      </div>
    </form>
  )
}
