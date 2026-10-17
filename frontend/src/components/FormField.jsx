import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'

const base =
  'block w-full rounded-lg border bg-white py-2.5 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500'
const okBorder = 'border-slate-300 focus:border-brand-600 focus:ring-brand-600/25'
const badBorder = 'border-red-400 focus:border-red-500 focus:ring-red-500/25'

const fieldClass = (icon, error) => `${base} ${icon ? 'pl-10' : 'pl-3'} ${error ? badBorder : okBorder}`

// Label + control + hint/error. `icon` is optional; `required` only adds the asterisk
// (forms validate themselves, so there is no native browser validation bubble).
function Shell({ id, label, icon: Icon, required, error, hint, children, trailing }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-red-500">*</span>}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
        )}
        {children}
        {trailing}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : (
        hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}

const describedBy = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined)

// Text-like input with an optional leading icon. type="password" gets a show/hide toggle.
export function TextField({ label, icon, type = 'text', required, error, hint, ...props }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'

  return (
    <Shell
      id={id}
      label={label}
      icon={icon}
      required={required}
      error={error}
      hint={hint}
      trailing={
        isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:text-slate-600"
          >
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        )
      }
    >
      <input
        id={id}
        type={isPassword && visible ? 'text' : type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${fieldClass(icon, error)} ${isPassword ? 'pr-11' : ''}`}
        {...props}
      />
    </Shell>
  )
}

export function SelectField({ label, icon, options, placeholder, required, error, hint, value, defaultValue, ...props }) {
  const id = useId()
  // Controlled when `value` is passed, otherwise starts on the placeholder.
  const valueProps = value !== undefined ? { value } : { defaultValue: defaultValue ?? '' }
  return (
    <Shell
      id={id}
      label={label}
      icon={icon}
      required={required}
      error={error}
      hint={hint}
      trailing={
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
      }
    >
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${fieldClass(icon, error)} appearance-none pr-10`}
        {...valueProps}
        {...props}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  )
}

export function TextAreaField({ label, required, error, hint, ...props }) {
  const id = useId()
  return (
    <Shell id={id} label={label} required={required} error={error} hint={hint}>
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${fieldClass(false, error)} resize-y`}
        {...props}
      />
    </Shell>
  )
}
