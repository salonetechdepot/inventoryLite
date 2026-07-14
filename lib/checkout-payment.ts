/** Resolve cash tender vs amount kept after change for checkout. */
export function resolveCheckoutPayment(input: {
  netAmount: number
  amountTendered: number
  isPartPayment: boolean
}) {
  const netAmount = Math.max(0, input.netAmount)
  const amountTendered = Math.max(0, input.amountTendered)
  const changeGiven = Math.max(0, amountTendered - netAmount)
  const amountReceived = amountTendered - changeGiven
  const amountDue = input.isPartPayment
    ? Math.max(0, netAmount - amountReceived)
    : 0
  const isPaid = amountDue <= 0

  return {
    amountTendered,
    amountReceived,
    changeGiven,
    amountDue,
    isPaid,
  }
}

/** Cash handed over by the customer (stored amount + change). */
export function cashTenderedFromReceipt(amountPaid: number, changeGiven: number) {
  return Math.max(0, amountPaid) + Math.max(0, changeGiven)
}
