/** Shared helpers for the credit / debtors book. */

export type DebtorReceiptSummary = {
  id: string
  customer_name?: string | null
  customer_phone?: string | null
  net_amount: number
  amount_paid: number
  amount_due: number
  is_paid: boolean
  is_part_payment?: boolean
  created_at: string | Date
  item_count?: number
  type?: string
}

export type DebtorEntry = {
  key: string
  displayName: string
  phone: string | null
  totalDue: number
  totalPaid: number
  receiptCount: number
  oldestDueAt: string | Date
  receipts: DebtorReceiptSummary[]
}

/** Normalize phone for matching the same person across receipts. */
export function normalizePhoneKey(phone: string | null | undefined): string {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 8) return digits.slice(-9)
  return digits
}

/** Group key: prefer phone, then lowercased name, else walk-in id. */
export function debtorKeyForReceipt(receipt: {
  customer_name?: string | null
  customer_phone?: string | null
  id: string
}): string {
  const phone = normalizePhoneKey(receipt.customer_phone)
  if (phone) return `phone:${phone}`
  const name = (receipt.customer_name || "").trim().toLowerCase()
  if (name) return `name:${name}`
  return `walkin:${receipt.id}`
}

export function debtorDisplayName(receipt: {
  customer_name?: string | null
  customer_phone?: string | null
}): string {
  const name = (receipt.customer_name || "").trim()
  if (name) return name
  const phone = (receipt.customer_phone || "").trim()
  if (phone) return phone
  return "Unnamed credit"
}

export function aggregateDebtors(
  receipts: DebtorReceiptSummary[]
): DebtorEntry[] {
  const unpaid = receipts.filter(
    (r) =>
      !r.is_paid &&
      Number(r.amount_due || 0) > 0 &&
      String(r.type ?? "SALE").toUpperCase() !== "RETURN"
  )

  const map = new Map<string, DebtorEntry>()

  for (const receipt of unpaid) {
    const key = debtorKeyForReceipt(receipt)
    const due = Number(receipt.amount_due || 0)
    const paid = Number(receipt.amount_paid || 0)
    const existing = map.get(key)

    if (!existing) {
      map.set(key, {
        key,
        displayName: debtorDisplayName(receipt),
        phone: (receipt.customer_phone || "").trim() || null,
        totalDue: due,
        totalPaid: paid,
        receiptCount: 1,
        oldestDueAt: receipt.created_at,
        receipts: [receipt],
      })
      continue
    }

    existing.totalDue += due
    existing.totalPaid += paid
    existing.receiptCount += 1
    existing.receipts.push(receipt)
    if (new Date(receipt.created_at) < new Date(existing.oldestDueAt)) {
      existing.oldestDueAt = receipt.created_at
    }
    if (!existing.phone && receipt.customer_phone) {
      existing.phone = receipt.customer_phone.trim()
    }
    if (
      existing.displayName === "Unnamed credit" &&
      debtorDisplayName(receipt) !== "Unnamed credit"
    ) {
      existing.displayName = debtorDisplayName(receipt)
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalDue - a.totalDue)
}

export function sumOutstanding(
  receipts: Array<{
    amount_due?: number
    is_paid?: boolean
    type?: string
  }>
): number {
  return receipts.reduce((sum, r) => {
    if (r.is_paid) return sum
    if (String(r.type ?? "SALE").toUpperCase() === "RETURN") return sum
    return sum + Math.max(0, Number(r.amount_due || 0))
  }, 0)
}
