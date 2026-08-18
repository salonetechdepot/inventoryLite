import {
  businessDayUtcRange,
  computeDayActivity,
  formatBusinessDateLabel,
  roundMoney,
  sumMethodTotals,
  type DayCloseReceiptLike,
  type MethodTotals,
} from "@/lib/day-close"
import {
  cacheData,
  getCachedData,
  RETURN_RECEIPTS_CACHE_KEY,
  SALE_RECEIPTS_CACHE_KEY,
} from "@/lib/offline-sync"

export const DAY_CLOSE_RECENT_CACHE_KEY = "/api/day-close/recent"

export type DayCloseRecord = {
  id: string
  business_date: string
  business_date_label: string
  expected_by_method: MethodTotals
  counted_by_method: MethodTotals
  expected_cash: number
  counted_cash: number
  cash_variance: number
  expected_total: number
  counted_total: number
  total_variance: number
  change_given_total: number
  sale_count: number
  return_count: number
  payment_count: number
  notes: string | null
  closed_at: string | Date
}

export type DayClosePayload = {
  business_date: string
  business_date_label: string
  expected_by_method: MethodTotals
  expected_cash: number
  expected_total: number
  change_given_total: number
  sale_count: number
  return_count: number
  payment_count: number
  existing_close: DayCloseRecord | null
  recent_closes: DayCloseRecord[]
  /** True when loaded from cache / receipts without a live server read. */
  _offline?: boolean
}

function dayCloseCacheKey(dateKey: string) {
  return `/api/day-close?date=${dateKey}`
}

async function loadCachedReceipts(): Promise<DayCloseReceiptLike[]> {
  const [sales, returns] = await Promise.all([
    getCachedData<{ receipts: DayCloseReceiptLike[] }>(SALE_RECEIPTS_CACHE_KEY),
    getCachedData<{ receipts: DayCloseReceiptLike[] }>(RETURN_RECEIPTS_CACHE_KEY),
  ])
  return [...(sales?.receipts ?? []), ...(returns?.receipts ?? [])]
}

/** Build expected totals from cached sale/return receipts (includes unsynced local sales). */
export async function buildOfflineDayClosePayload(
  dateKey: string
): Promise<DayClosePayload | null> {
  const receipts = await loadCachedReceipts()
  if (receipts.length === 0) return null

  const { start, end } = businessDayUtcRange(dateKey)
  const activity = computeDayActivity({ receipts, start, end })

  const cachedForDate = await getCachedData<DayClosePayload>(dayCloseCacheKey(dateKey))
  const recentCache = await getCachedData<{ recent_closes: DayCloseRecord[] }>(
    DAY_CLOSE_RECENT_CACHE_KEY
  )

  return {
    business_date: dateKey,
    business_date_label: formatBusinessDateLabel(dateKey),
    expected_by_method: activity.expectedByMethod,
    expected_cash: roundMoney(activity.expectedByMethod.cash || 0),
    expected_total: roundMoney(sumMethodTotals(activity.expectedByMethod)),
    change_given_total: activity.changeGivenTotal,
    sale_count: activity.saleCount,
    return_count: activity.returnCount,
    payment_count: activity.paymentCount,
    existing_close: cachedForDate?.existing_close ?? null,
    recent_closes: recentCache?.recent_closes ?? cachedForDate?.recent_closes ?? [],
    _offline: true,
  }
}

async function persistDayCloseCaches(payload: DayClosePayload) {
  await cacheData(dayCloseCacheKey(payload.business_date), payload)
  if (payload.recent_closes.length > 0) {
    await cacheData(DAY_CLOSE_RECENT_CACHE_KEY, {
      recent_closes: payload.recent_closes,
    })
  }
}

/** Online fetch with IndexedDB cache; offline or failed requests use receipt preview. */
export async function fetchDayClose(dateKey: string): Promise<DayClosePayload> {
  const cacheKey = dayCloseCacheKey(dateKey)
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true

  if (!isOnline) {
    const offline = await buildOfflineDayClosePayload(dateKey)
    if (offline) return offline
    const cached = await getCachedData<DayClosePayload>(cacheKey)
    if (cached) return { ...cached, _offline: true }
    throw new Error(
      "No cached sales for this day. Open the app online first, then try again offline."
    )
  }

  try {
    const res = await fetch(`/api/day-close?date=${encodeURIComponent(dateKey)}`, {
      credentials: "same-origin",
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(
        typeof data?.error === "string" ? data.error : "Failed to load day close"
      )
    }
    const payload = (await res.json()) as DayClosePayload
    await persistDayCloseCaches(payload)
    return payload
  } catch (err) {
    const offline = await buildOfflineDayClosePayload(dateKey)
    if (offline) return offline
    const cached = await getCachedData<DayClosePayload>(cacheKey)
    if (cached) return { ...cached, _offline: true }
    throw err instanceof Error ? err : new Error("Failed to load day close")
  }
}
