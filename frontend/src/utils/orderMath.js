export const orderSubtotal = (order) =>
  order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

export const orderTotal = (order) => orderSubtotal(order) + order.shippingFee
