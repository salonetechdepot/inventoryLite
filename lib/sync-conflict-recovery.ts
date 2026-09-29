type MutationLike = {
  url: string
  method: string
  headers?: Record<string, string>
}

/** Idempotency keys — only applied when syncing online, not while queuing offline. */
export function idempotencyKeyForMutation(
  mutation: MutationLike,
  body: unknown
): string | null {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null

  if (mutation.url === "/api/sales/batch" && mutation.method === "POST") {
    const receiptId = payload?._offlineReceiptId
    if (typeof receiptId === "string" && receiptId.trim()) {
      return receiptId.trim()
    }
  }

  if (mutation.url === "/api/day-close" && mutation.method === "POST") {
    const date = payload?.businessDate
    if (typeof date === "string" && date.trim()) {
      return `day-close:${date.trim()}`
    }
  }

  return null
}

export function mergeSyncHeaders(
  mutation: MutationLike,
  body: unknown
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(mutation.headers ?? {}),
  }
  const key = idempotencyKeyForMutation(mutation, body)
  if (key) {
    headers["Idempotency-Key"] = key
    headers["X-Idempotency-Key"] = key
  }
  return headers
}

/** Server no longer has this product — drop queued change and refresh cache. */
export function isStaleProductMutation(mutation: MutationLike, status: number) {
  if (status !== 404) return false
  if (mutation.url === "/api/products" && mutation.method === "POST") return true
  return /^\/api\/products\/[^/]+(\/adjust)?$/.test(mutation.url)
}
