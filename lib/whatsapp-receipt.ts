import type { ReceiptData } from "@/components/receipt-view"
import { paymentMethodLabel } from "@/lib/payment-methods"

const SIERRA_LEONE_CODE = "232"

function formatMoney(amount: number) {
  const value = new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0)
  return `NLe ${value}`
}

function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Number in the international form wa.me expects (digits only, no +).
 * Local Sierra Leone numbers (076…, 76…) get the 232 country code.
 */
export function whatsappPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, "")
  if (digits.startsWith("00")) digits = digits.slice(2)
  if (!digits) return null

  if (digits.startsWith(SIERRA_LEONE_CODE) && digits.length === 11) return digits
  if (digits.startsWith("0") && digits.length === 9) return SIERRA_LEONE_CODE + digits.slice(1)
  if (digits.length === 8) return SIERRA_LEONE_CODE + digits
  // Already international (another country) — trust it.
  if (digits.length >= 10 && !digits.startsWith("0")) return digits
  return null
}

function paymentSummary(receipt: ReceiptData): string | null {
  const methods = Array.from(
    new Set((receipt.payments ?? []).map((payment) => paymentMethodLabel(payment.method)))
  )
  if (methods.length > 0) return methods.join(", ")
  if (Number(receipt.amount_paid) <= 0 && Number(receipt.amount_due) > 0) return "Credit"
  return null
}

/** Plain-text receipt using WhatsApp formatting (*bold*). */
export function formatReceiptForWhatsApp(
  receipt: ReceiptData,
  businessName?: string | null
): string {
  const isReturn = String(receipt.type).toUpperCase() === "RETURN"
  const isPending = receipt.id.startsWith("pending-") || receipt.id.startsWith("local-")
  const reference = isPending ? "(pending sync)" : `#${receipt.id.slice(0, 8).toUpperCase()}`
  const lines: string[] = []

  if (businessName?.trim()) lines.push(`*${businessName.trim()}*`)
  lines.push(`${isReturn ? "Return receipt" : "Receipt"} ${reference}`)
  lines.push(formatDateTime(receipt.created_at))
  if (receipt.customer_name?.trim()) lines.push(`Customer: ${receipt.customer_name.trim()}`)
  lines.push("")

  for (const sale of receipt.sales) {
    lines.push(
      `${sale.quantity_sold} × ${sale.product_name} @ ${formatMoney(sale.unit_price_at_sale)} = ${formatMoney(sale.total_amount)}`
    )
  }
  lines.push("")

  if (Number(receipt.discount_amount) > 0) {
    lines.push(`Subtotal: ${formatMoney(receipt.subtotal)}`)
    lines.push(`Discount: −${formatMoney(receipt.discount_amount)}`)
  }
  lines.push(`*${isReturn ? "Refund total" : "Total"}: ${formatMoney(receipt.net_amount)}*`)

  const method = paymentSummary(receipt)
  lines.push(
    `${isReturn ? "Refunded" : "Paid"}: ${formatMoney(receipt.amount_paid)}${method ? ` (${method})` : ""}`
  )
  if (Number(receipt.change_given) > 0) {
    lines.push(`Change: ${formatMoney(receipt.change_given)}`)
  }
  if (!isReturn && Number(receipt.amount_due) > 0) {
    lines.push(`*Balance due: ${formatMoney(receipt.amount_due)}*`)
  }

  lines.push("")
  lines.push("Thank you for your business!")
  return lines.join("\n")
}

/** wa.me link: opens the customer's chat when the receipt has their number, otherwise the contact picker. */
export function whatsappReceiptUrl(receipt: ReceiptData, businessName?: string | null): string {
  const text = encodeURIComponent(formatReceiptForWhatsApp(receipt, businessName))
  const phone = whatsappPhone(receipt.customer_phone)
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`
}
