import { Link } from 'react-router-dom'

const variants = {
  primary:
    'bg-brand-600 text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 active:bg-brand-700',
  outline: 'border border-brand-600 bg-white text-brand-600 hover:bg-brand-50',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  dangerOutline: 'border border-red-300 bg-white text-red-600 hover:bg-red-50',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-sm',
}

// Renders a router <Link> for `to`, a plain <a> for `href` (tel:, mailto:), otherwise a <button>.
export default function Button({
  to,
  href,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`

  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    )
  }
  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  )
}
