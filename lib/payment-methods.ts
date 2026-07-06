export type PaymentMethodId =
  | "cash"
  | "orange_money"
  | "afrimoney"
  | "bank_transfer"
  | "credit"

export type PaymentMethodOption = {
  id: PaymentMethodId
  label: string
  shortLabel: string
}

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: "cash", label: "Cash", shortLabel: "Cash" },
  { id: "orange_money", label: "Orange Money", shortLabel: "Orange" },
  { id: "afrimoney", label: "Afrimoney", shortLabel: "Afrimoney" },
  { id: "bank_transfer", label: "Bank transfer", shortLabel: "Bank" },
  { id: "credit", label: "Credit (owe later)", shortLabel: "Credit" },
]

const LABEL_BY_ID = new Map(PAYMENT_METHODS.map((m) => [m.id, m.label]))

export function normalizePaymentMethod(value: string | null | undefined): PaymentMethodId {
  const raw = (value ?? "cash").trim().toLowerCase().replace(/\s+/g, "_")
  if (PAYMENT_METHODS.some((m) => m.id === raw)) return raw as PaymentMethodId
  if (raw === "momo" || raw === "mobile_money") return "orange_money"
  return "cash"
}

export function paymentMethodLabel(value: string | null | undefined): string {
  const id = normalizePaymentMethod(value)
  return LABEL_BY_ID.get(id) ?? value ?? "Cash"
}

export function initialPaymentMethodForCheckout(
  isPartPayment: boolean,
  amountPaid: number
): PaymentMethodId {
  if (isPartPayment && amountPaid <= 0) return "credit"
  return "cash"
}
