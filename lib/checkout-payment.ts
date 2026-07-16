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
  // Only create a balance when part/credit mode is on AND tender doesn't cover the bill.
  const amountDue =
    input.isPartPayment && amountTendered < netAmount
      ? Math.max(0, netAmount - amountReceived)
      : 0
  const isPaid = amountDue <= 0
  const isPartPayment = amountDue > 0

  return {
    amountTendered,
    amountReceived,
    changeGiven,
    amountDue,
    isPaid,
    isPartPayment,
  }
}

/** True when this checkout should be treated as credit / part payment. */
export function shouldUsePartPayment(
  enabled: boolean,
  amountTendered: number,
  netAmount: number
): boolean {
  return enabled && amountTendered < netAmount
}

/** Cash handed over by the customer (stored amount + change). */
export function cashTenderedFromReceipt(amountPaid: number, changeGiven: number) {
  return Math.max(0, amountPaid) + Math.max(0, changeGiven)
}
