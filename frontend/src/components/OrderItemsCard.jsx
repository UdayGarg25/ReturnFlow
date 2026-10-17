import { orderSubtotal, orderTotal } from '../utils/orderMath.js'
import { formatCurrency } from '../utils/format.js'
import Card from './Card.jsx'
import ProductThumb from './ProductThumb.jsx'

// Line items plus subtotal / shipping / total. Shared by customer and seller order pages.
// Variant and shipping fee are optional; `order.total` wins when the API provides it.
export default function OrderItemsCard({ order, className = '', images = false }) {
  return (
    <Card title="Order Items" className={className}>
      <ul className="divide-y divide-slate-100">
        {order.items.map((item) => (
          <li key={item.id ?? item.productId ?? item.name} className="flex items-center gap-4 py-4 first:pt-0">
            <ProductThumb thumb={item.thumb} name={images ? item.name : undefined} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{item.name}</p>
              {item.variant && <p className="text-sm text-slate-500">{item.variant}</p>}
              <p className="text-sm text-slate-500">Quantity: {item.quantity}</p>
            </div>
            <p className="font-semibold text-slate-900">{formatCurrency(item.unitPrice * item.quantity)}</p>
          </li>
        ))}
      </ul>
      <dl className="mt-2 space-y-2 border-t border-slate-100 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Subtotal</dt>
          <dd className="text-slate-800">{formatCurrency(orderSubtotal(order))}</dd>
        </div>
        {order.shippingFee !== undefined && (
          <div className="flex justify-between">
            <dt className="text-slate-500">Shipping Fee</dt>
            <dd className="text-slate-800">{formatCurrency(order.shippingFee)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-bold text-navy-900">
          <dt>Total</dt>
          <dd>{formatCurrency(order.total ?? orderTotal(order))}</dd>
        </div>
      </dl>
    </Card>
  )
}
