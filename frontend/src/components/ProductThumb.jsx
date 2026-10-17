import { Backpack, BatteryCharging, Footprints, GlassWater, Glasses, Headphones, Lamp, Laptop, Mouse, Package, Shirt, Smartphone, Speaker, Watch } from 'lucide-react'
import { useState } from 'react'
import { productImageSrc, productType } from '../utils/productImages.js'

// Pages without product pictures show an icon tile.
const icons = {
  shoe: Footprints,
  shirt: Shirt,
  backpack: Backpack,
  headphones: Headphones,
  lamp: Lamp,
  mouse: Mouse,
  bottle: GlassWater,
  glasses: Glasses,
  watch: Watch,
}

const sizes = {
  sm: { box: 'h-9 w-9 rounded-lg', icon: 18 },
  md: { box: 'h-14 w-14 rounded-xl', icon: 26 },
  lg: { box: 'h-20 w-20 rounded-xl', icon: 36 },
  xl: { box: 'h-28 w-28 rounded-2xl', icon: 48 },
}

// Generic icon for a product type (used only when there is no real picture).
function TypeIcon({ name, size }) {
  const props = { size, strokeWidth: 1.6, 'aria-hidden': 'true' }
  switch (productType(name)) {
    case 'laptop': return <Laptop {...props} />
    case 'phone': return <Smartphone {...props} />
    case 'audio': return <Headphones {...props} />
    case 'speaker': return <Speaker {...props} />
    case 'wearable': return <Watch {...props} />
    case 'mouse': return <Mouse {...props} />
    case 'battery': return <BatteryCharging {...props} />
    default: return <Package {...props} />
  }
}

// Just the product icon, for panels that draw their own tile.
export function ProductIcon({ thumb, size = 24, ...props }) {
  const Icon = icons[thumb] ?? Package
  return <Icon size={size} strokeWidth={1.4} aria-hidden="true" {...props} />
}

// A square product tile. Give it the product `name` to show the product's picture (customer screens do); without a
// name it is the plain icon tile. The tile keeps its size while the picture loads, and if there is no picture for the
// product, or it fails to load, it shows an icon for the product's TYPE instead (never a broken-image icon).
export default function ProductThumb({ thumb, name, size = 'sm' }) {
  const s = sizes[size]
  const src = productImageSrc(name)
  const [failedSrc, setFailedSrc] = useState(null)
  const failed = failedSrc === src

  if (src && !failed) {
    return (
      <span className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white ${s.box}`}>
        <img src={src} alt={name} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} className="h-full w-full object-contain p-1" />
      </span>
    )
  }
  const Icon = icons[thumb] ?? Package
  return (
    <span
      role={name ? 'img' : undefined}
      aria-label={name ? `${name} (no product picture available)` : undefined}
      aria-hidden={name ? undefined : 'true'}
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 ${s.box}`}
    >
      {name ? <TypeIcon name={name} size={s.icon} /> : <Icon size={s.icon} strokeWidth={1.6} />}
    </span>
  )
}

// Thumbnail + product name, used in table cells. `image` turns on the product picture (customer screens).
export function ProductCell({ thumb, name, extra, image = false }) {
  return (
    <span className="flex items-center gap-3">
      <ProductThumb thumb={thumb} name={image ? name : undefined} />
      <span className="font-medium text-slate-900">
        {name}
        {extra && <span className="ml-1 text-xs font-normal text-slate-500">{extra}</span>}
      </span>
    </span>
  )
}
