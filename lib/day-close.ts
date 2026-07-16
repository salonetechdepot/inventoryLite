import {
  normalizePaymentMethod,
  PAYMENT_METHODS,
  type PaymentMethodId,
} from "@/lib/payment-methods"
import { getSessionTimezone } from "@/lib/session-expiry"

export const DAY_CLOSE_METHODS = PAYMENT_METHODS.filter((m) => m.id !== "credit").map(
  (m) => m.id
) as PaymentMethodId[]

export type MethodTotals = Record<string, number>

export type DayCloseReceiptLike = {
  type?: string
  created_at: string | Date
  change_given?: number
  payments?: Array<{
    amount: number
    method?: string | null
    created_at?: string | Date
  }>
}

export function getBusinessDateKey(
  now: Date = new Date(),
  timeZone: string = getSessionTimezone()
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

/** Parse YYYY-MM-DD into a Date at UTC midnight (safe for @db.Date). */
export function businessDateToUtcDate(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim())
  if (!match) {
    throw new Error("Invalid business date")
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * UTC range covering local calendar day in the given timezone.
 * Africa/Freetown is GMT year-round, so this matches UTC midnight bounds there.
 */
export function businessDayUtcRange(
  dateKey: string,
  timeZone: string = getSessionTimezone()
): { start: Date; end: Date } {
  const start = findZonedInstant(dateKey, 0, 0, 0, timeZone)
  const nextKey = addCalendarDays(dateKey, 1)
  const end = findZonedInstant(nextKey, 0, 0, 0, timeZone)
  return { start, end }
}

function addCalendarDays(dateKey: string, days: number): string {
  const base = businessDateToUtcDate(dateKey)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  let hour = pick("hour")
  if (hour === 24) hour = 0
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour,
    minute: pick("minute"),
    second: pick("second"),
  }
}

/** Find a UTC Date that is local Y-M-D H:M:S in `timeZone`. */
function findZonedInstant(
  dateKey: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const [y, m, d] = dateKey.split("-").map(Number)
  let guess = Date.UTC(y, m - 1, d, hour, minute, second)
  for (let i = 0; i < 4; i++) {
    const parts = getZonedParts(new Date(guess), timeZone)
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    )
    const target = Date.UTC(y, m - 1, d, hour, minute, second)
    guess += target - asUtc
  }
  return new Date(guess)
}

export function emptyMethodTotals(): MethodTotals {
  const totals: MethodTotals = {}
  for (const id of DAY_CLOSE_METHODS) totals[id] = 0
  return totals
}

export function sumMethodTotals(totals: MethodTotals): number {
  return Object.values(totals).reduce((sum, n) => sum + Number(n || 0), 0)
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function normalizeMethodTotals(input: unknown): MethodTotals {
  const base = emptyMethodTotals()
  if (!input || typeof input !== "object") return base
  for (const [rawKey, rawVal] of Object.entries(input as Record<string, unknown>)) {
    const method = normalizePaymentMethod(rawKey)
    if (method === "credit") continue
    const amount = roundMoney(Number(rawVal) || 0)
    base[method] = roundMoney((base[method] || 0) + Math.max(0, amount))
  }
  return base
}

export function computeDayActivity(input: {
  receipts: DayCloseReceiptLike[]
  start: Date
  end: Date
}): {
  expectedByMethod: MethodTotals
  changeGivenTotal: number
  saleCount: number
  returnCount: number
  paymentCount: number
} {
  const expectedByMethod = emptyMethodTotals()
  let changeGivenTotal = 0
  let saleCount = 0
  let returnCount = 0
  let paymentCount = 0

  for (const receipt of input.receipts) {
    const created = new Date(receipt.created_at)
    if (created < input.start || created >= input.end) continue

    const type = String(receipt.type ?? "SALE").toUpperCase()
    const isReturn = type === "RETURN"
    if (isReturn) returnCount += 1
    else saleCount += 1

    changeGivenTotal = roundMoney(
      changeGivenTotal + Math.max(0, Number(receipt.change_given || 0))
    )

    const sign = isReturn ? -1 : 1
    for (const payment of receipt.payments ?? []) {
      const payAt = payment.created_at ? new Date(payment.created_at) : created
      if (payAt < input.start || payAt >= input.end) continue
      const method = normalizePaymentMethod(payment.method)
      if (method === "credit") continue
      const amount = roundMoney(Math.max(0, Number(payment.amount) || 0) * sign)
      expectedByMethod[method] = roundMoney((expectedByMethod[method] || 0) + amount)
      paymentCount += 1
    }
  }

  // Never show negative expected cash in the UI totals — clamp per method at 0 for close.
  for (const key of Object.keys(expectedByMethod)) {
    expectedByMethod[key] = roundMoney(Math.max(0, expectedByMethod[key] || 0))
  }

  return {
    expectedByMethod,
    changeGivenTotal: roundMoney(changeGivenTotal),
    saleCount,
    returnCount,
    paymentCount,
  }
}

export function buildCloseSnapshot(input: {
  expectedByMethod: MethodTotals
  countedByMethod: MethodTotals
}) {
  const expectedByMethod = normalizeMethodTotals(input.expectedByMethod)
  const countedByMethod = normalizeMethodTotals(input.countedByMethod)
  const expectedCash = roundMoney(expectedByMethod.cash || 0)
  const countedCash = roundMoney(countedByMethod.cash || 0)
  const expectedTotal = roundMoney(sumMethodTotals(expectedByMethod))
  const countedTotal = roundMoney(sumMethodTotals(countedByMethod))
  return {
    expectedByMethod,
    countedByMethod,
    expectedCash,
    countedCash,
    cashVariance: roundMoney(countedCash - expectedCash),
    expectedTotal,
    countedTotal,
    totalVariance: roundMoney(countedTotal - expectedTotal),
  }
}

export function formatBusinessDateLabel(dateKey: string): string {
  try {
    const date = businessDateToUtcDate(dateKey)
    return date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
  } catch {
    return dateKey
  }
}
