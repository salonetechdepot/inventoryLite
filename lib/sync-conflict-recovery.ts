type MutationLike = {
  url: string
  method: string
  headers?: Record<string, string>
}

/** POSTs whose server route replays the first response for a repeated key. */
const IDEMPOTENT_POST_URL =
  /^\/api\/(sales\/batch|products|products\/[^/]+\/adjust|receipts\/[^/]+\/payments)$/

export function needsIdempotencyKey(mutation: MutationLike) {
  return mutation.method === "POST" && IDEMPOTENT_POST_URL.test(mutation.url)
}

/**
 * Key for a queued change. Read it from the body as queued (before
 * remapIdsInBody strips the `_offline*` / `_idempotencyKey` fields), so every
 * retry of the same change sends the same key.
 */
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

  if (mutation.url === "/api/products" && mutation.method === "POST") {
    const tempId = payload?._offlineTempId
    if (typeof tempId === "string" && tempId.trim()) {
      return tempId.trim()
    }
  }

  const key = payload?._idempotencyKey
  if (typeof key === "string" && key.trim()) {
    return key.trim()
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
