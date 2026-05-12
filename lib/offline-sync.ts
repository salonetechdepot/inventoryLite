"use client"

const DB_NAME = "stockeasy-offline-db"
const DB_VERSION = 1
const CACHE_STORE = "cache"
const QUEUE_STORE = "queue"
const CONFLICT_STORE = "conflicts"
const MAX_RETRY_COUNT = 5
const PRODUCTS_CACHE_KEY = "/api/products"
/** Stable SWR key for return receipts — filters are client-side so offline cache always hits. */
export const RETURN_RECEIPTS_CACHE_KEY = "/api/receipts?type=return&limit=500&status=all"

export interface QueuedMutation {
  id: string
  url: string
  method: "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
  headers?: Record<string, string>
  createdAt: number
  retryCount: number
  tempId?: string
}

export interface SyncConflict {
  id: string
  mutationId: string
  url: string
  method: "POST" | "PATCH" | "PUT" | "DELETE"
  status: number
  reason: string
  payload?: unknown
  createdAt: number
}

interface CachedRecord {
  key: string
  data: unknown
  updatedAt: number
}

interface ProductShape {
  id: string
  name: string
  quantity: number
  unit_price: number
  low_stock_threshold: number
  image_url: string | null
  category_id?: string | null
  category_name?: string | null
  category_icon?: string | null
  scan_code?: string | null
  tags?: string[]
  has_specifications?: boolean
  _isLocalOnly?: boolean
}

function isBrowser() {
  return typeof window !== "undefined"
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "key" })
      }

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" })
      }

      if (!db.objectStoreNames.contains(CONFLICT_STORE)) {
        db.createObjectStore(CONFLICT_STORE, { keyPath: "id" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idbRequest<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function txDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDb()
  const tx = db.transaction(storeName, "readonly")
  const store = tx.objectStore(storeName)
  const all = await idbRequest(store.getAll())
  await txDone(tx)
  return all as T[]
}

async function putIntoStore(storeName: string, value: unknown) {
  const db = await openDb()
  const tx = db.transaction(storeName, "readwrite")
  tx.objectStore(storeName).put(value)
  await txDone(tx)
}

async function deleteFromStore(storeName: string, id: string) {
  const db = await openDb()
  const tx = db.transaction(storeName, "readwrite")
  tx.objectStore(storeName).delete(id)
  await txDone(tx)
}

async function clearStore(storeName: string) {
  const db = await openDb()
  const tx = db.transaction(storeName, "readwrite")
  tx.objectStore(storeName).clear()
  await txDone(tx)
}

function parseProductIdFromUrl(url: string): string | null {
  const match = url.match(/^\/api\/products\/([^/]+)$/)
  return match?.[1] ?? null
}

function parseAdjustProductIdFromUrl(url: string): string | null {
  const match = url.match(/^\/api\/products\/([^/]+)\/adjust$/)
  return match?.[1] ?? null
}

function createOptimisticProduct(payload: Record<string, unknown>, tempId: string): ProductShape {
  return {
    id: tempId,
    name: String(payload.name ?? "Untitled product"),
    quantity: Number(payload.quantity ?? 0),
    unit_price: Number(payload.unitPrice ?? 0),
    low_stock_threshold: Number(payload.lowStockThreshold ?? 5),
    image_url: (payload.imageUrl as string | null | undefined) ?? null,
    category_id: (payload.categoryId as string | null | undefined) ?? null,
    category_name: null,
    category_icon: null,
    scan_code: (payload.scanCode as string | null | undefined) ?? null,
    tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
    has_specifications: Boolean(payload.hasSpecifications),
    _isLocalOnly: true,
  }
}

function patchProductWithPayload(product: ProductShape, payload: Record<string, unknown>) {
  return {
    ...product,
    name: payload.name === undefined ? product.name : String(payload.name),
    quantity: payload.quantity === undefined ? product.quantity : Number(payload.quantity),
    unit_price: payload.unitPrice === undefined ? product.unit_price : Number(payload.unitPrice),
    low_stock_threshold:
      payload.lowStockThreshold === undefined
        ? product.low_stock_threshold
        : Number(payload.lowStockThreshold),
    image_url: payload.imageUrl === undefined ? product.image_url : ((payload.imageUrl as string | null) ?? null),
    category_id:
      payload.categoryId === undefined ? (product.category_id ?? null) : ((payload.categoryId as string | null) ?? null),
    scan_code:
      payload.scanCode === undefined ? (product.scan_code ?? null) : ((payload.scanCode as string | null) ?? null),
    tags: payload.tags === undefined ? (product.tags ?? []) : (Array.isArray(payload.tags) ? (payload.tags as string[]) : []),
    has_specifications:
      payload.hasSpecifications === undefined
        ? Boolean(product.has_specifications)
        : Boolean(payload.hasSpecifications),
  }
}

/** Matches GET /api/receipts row shape + offline flag */
interface CachedReturnReceipt {
  id: string
  type: string
  customer_name: string | null
  customer_phone: string | null
  subtotal: number
  discount_amount: number
  net_amount: number
  amount_paid: number
  amount_due: number
  change_given: number
  is_part_payment: boolean
  is_paid: boolean
  notes: string | null
  created_at: string | Date
  updated_at?: string | Date
  item_count: number
  sales: Array<{
    id: string
    product_id: string | null
    product_name: string
    quantity_sold: number
    unit_price_at_sale: number
    total_amount: number
    created_at: string | Date
  }>
  payments: Array<{
    id: string
    amount: number
    method: string | null
    note: string | null
    created_at: string | Date
  }>
  _isLocalOnly?: boolean
}

function mergeReturnReceiptsPreservingLocal(serverData: unknown, existingData: unknown) {
  const incoming = (serverData as { receipts?: CachedReturnReceipt[] })?.receipts
  const existing = (existingData as { receipts?: CachedReturnReceipt[] })?.receipts
  const serverReceipts = Array.isArray(incoming) ? incoming : []
  const current = Array.isArray(existing) ? existing : []
  const localOnly = current.filter((r) => r?._isLocalOnly)
  const merged = [...localOnly]
  for (const r of serverReceipts) {
    if (!merged.some((x) => x.id === r.id)) {
      merged.push({ ...r, _isLocalOnly: false })
    }
  }
  return { receipts: merged }
}

async function withReturnReceiptsCache(
  updater: (receipts: CachedReturnReceipt[]) => CachedReturnReceipt[]
) {
  const current =
    (await getCachedData<{ receipts: CachedReturnReceipt[] }>(RETURN_RECEIPTS_CACHE_KEY)) ??
    ({ receipts: [] } as { receipts: CachedReturnReceipt[] })
  const next = updater(Array.isArray(current.receipts) ? current.receipts : [])
  await cacheData(RETURN_RECEIPTS_CACHE_KEY, { receipts: next })
}

function formatReceiptFromBatchResponse(data: {
  receipt: Record<string, unknown>
  sales: Array<Record<string, unknown>>
}): CachedReturnReceipt {
  const r = data.receipt
  const amountPaid = Number(r.amount_paid ?? 0)
  const createdAt = (r.created_at as string) || new Date().toISOString()
  const payments =
    amountPaid > 0
      ? [
          {
            id: `synth-${r.id}-pay`,
            amount: amountPaid,
            method: "cash",
            note: "initial payment",
            created_at: createdAt,
          },
        ]
      : []
  const sales = (data.sales || []).map((sale, idx) => ({
    id: String(sale.id ?? `line-${idx}`),
    product_id: (sale.product_id as string | null) ?? (sale.productId as string | null) ?? null,
    product_name: String(sale.product_name ?? ""),
    quantity_sold: Number(sale.quantity_sold ?? 0),
    unit_price_at_sale: Number(sale.unit_price_at_sale ?? 0),
    total_amount: Number(sale.total_amount ?? 0),
    created_at: (sale.created_at as string) || createdAt,
  }))
  return {
    id: String(r.id),
    type: String(r.type ?? "RETURN"),
    customer_name: (r.customer_name as string | null) ?? null,
    customer_phone: (r.customer_phone as string | null) ?? null,
    subtotal: Number(r.subtotal ?? 0),
    discount_amount: Number(r.discount_amount ?? 0),
    net_amount: Number(r.net_amount ?? 0),
    amount_paid: amountPaid,
    amount_due: Number(r.amount_due ?? 0),
    change_given: Number(r.change_given ?? 0),
    is_part_payment: Boolean(r.is_part_payment),
    is_paid: Boolean(r.is_paid),
    notes: (r.notes as string | null) ?? null,
    created_at: createdAt,
    updated_at: (r.updated_at as string | undefined) ?? createdAt,
    item_count: sales.length,
    sales,
    payments,
    _isLocalOnly: false,
  }
}

async function applyBatchReceiptCacheResolution(
  mutation: { url: string; method: string; body?: unknown },
  response: Response
) {
  if (mutation.url !== "/api/sales/batch" || mutation.method !== "POST") return
  let body: Record<string, unknown> = {}
  try {
    body =
      mutation.body && typeof mutation.body === "object"
        ? (mutation.body as Record<string, unknown>)
        : JSON.parse(String(mutation.body ?? "{}"))
  } catch {
    return
  }
  const offlineReceiptId = body._offlineReceiptId ? String(body._offlineReceiptId) : undefined
  let data: { receipt?: Record<string, unknown>; sales?: Array<Record<string, unknown>>; type?: string }
  try {
    data = (await response.clone().json()) as typeof data
  } catch {
    return
  }
  if (!data?.receipt) return
  const formatted = formatReceiptFromBatchResponse({
    receipt: data.receipt,
    sales: Array.isArray(data.sales) ? data.sales : [],
  })
  const isReturn =
    String(data.receipt.type ?? data.type ?? "").toUpperCase() === "RETURN" || data.type === "return"
  if (!isReturn) return

  await withReturnReceiptsCache((receipts) => {
    if (offlineReceiptId) {
      const rest = receipts.filter((r) => r.id !== offlineReceiptId)
      return [formatted, ...rest]
    }
    if (receipts.some((r) => r.id === formatted.id)) {
      return receipts.map((r) => (r.id === formatted.id ? formatted : r))
    }
    return [formatted, ...receipts]
  })
}

async function withProductsCache(
  updater: (products: ProductShape[]) => ProductShape[]
) {
  const current = (await getCachedData<{ products: ProductShape[] }>(PRODUCTS_CACHE_KEY)) ?? { products: [] }
  const nextProducts = updater(Array.isArray(current.products) ? current.products : [])
  await cacheData(PRODUCTS_CACHE_KEY, { products: nextProducts })
}

async function applyOptimisticProductMutation(input: {
  url: string
  method: "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
}) {
  const payload = (input.body ?? {}) as Record<string, unknown>
  let tempId: string | undefined

  if (input.url === "/api/products" && input.method === "POST") {
    const productTempId = String(payload._offlineTempId ?? `local-${crypto.randomUUID()}`)
    payload._offlineTempId = productTempId
    tempId = productTempId
    await withProductsCache((products) => [createOptimisticProduct(payload, productTempId), ...products])
    return { tempId }
  }

  const directId = parseProductIdFromUrl(input.url)
  if (directId && input.method === "PATCH") {
    await withProductsCache((products) =>
      products.map((product) =>
        product.id === directId ? patchProductWithPayload(product, payload) : product
      )
    )
    return {}
  }

  if (directId && input.method === "DELETE") {
    await withProductsCache((products) => products.filter((product) => product.id !== directId))
    return {}
  }

  const adjustId = parseAdjustProductIdFromUrl(input.url)
  if (adjustId && input.method === "POST") {
    const adjustment = Number(payload.adjustment ?? 0)
    await withProductsCache((products) =>
      products.map((product) =>
        product.id === adjustId
          ? { ...product, quantity: Math.max(0, Number(product.quantity ?? 0) + adjustment) }
          : product
      )
    )
    return {}
  }

  if (input.url === "/api/sales/batch" && input.method === "POST") {
    const items = Array.isArray(payload.items)
      ? (payload.items as Array<{ productId: string; quantity: number }>)
      : []
    const type = payload.type === "return" ? "return" : "sale"

    await withProductsCache((products) =>
      products.map((product) => {
        const item = items.find((entry) => entry.productId === product.id)
        if (!item) return product
        const qty = Number(item.quantity ?? 0)
        const delta = type === "return" ? qty : -qty
        return { ...product, quantity: Number(product.quantity ?? 0) + delta }
      })
    )

    if (type === "return" && items.length > 0) {
      const receiptId = String(payload._offlineReceiptId ?? `local-${crypto.randomUUID()}`)
      payload._offlineReceiptId = receiptId

      const productsState = await getCachedData<{ products: ProductShape[] }>(PRODUCTS_CACHE_KEY)
      const productList = productsState?.products ?? []
      const productById = new Map(productList.map((p) => [p.id, p]))

      const safeDiscount = Math.max(0, Number(payload.discountAmount ?? 0))
      const subtotal = items.reduce((sum, item) => {
        const p = productById.get(item.productId)
        return sum + item.quantity * Number(p?.unit_price ?? 0)
      }, 0)
      const netAmount = Math.max(0, subtotal - safeDiscount)
      const safeAmountPaid = Math.max(0, Number(payload.amountPaid ?? 0))
      const negotiatedShortfall = Math.max(0, netAmount - safeAmountPaid)
      const isPartPayment = Boolean(payload.isPartPayment)
      const amountDue = isPartPayment ? negotiatedShortfall : 0
      const changeGiven = Math.max(0, safeAmountPaid - netAmount)
      const isPaid = amountDue <= 0
      const createdAt = new Date().toISOString()
      const customerName = typeof payload.customerName === "string" ? payload.customerName.trim() : ""
      const customerPhone = typeof payload.customerPhone === "string" ? payload.customerPhone.trim() : ""

      const sales = items.map((item, idx) => {
        const p = productById.get(item.productId)
        const unit = Number(p?.unit_price ?? 0)
        return {
          id: `${receiptId}-line-${idx}`,
          product_id: item.productId,
          product_name: String(p?.name ?? "Product"),
          quantity_sold: item.quantity,
          unit_price_at_sale: unit,
          total_amount: item.quantity * unit,
          created_at: createdAt,
        }
      })

      const payments =
        safeAmountPaid > 0
          ? [
              {
                id: `${receiptId}-pay`,
                amount: safeAmountPaid,
                method: "cash",
                note: "initial payment",
                created_at: createdAt,
              },
            ]
          : []

      const optimistic: CachedReturnReceipt = {
        id: receiptId,
        type: "RETURN",
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        subtotal,
        discount_amount: safeDiscount,
        net_amount: netAmount,
        amount_paid: safeAmountPaid,
        amount_due: amountDue,
        change_given: changeGiven,
        is_part_payment: isPartPayment,
        is_paid: isPaid,
        notes: null,
        created_at: createdAt,
        updated_at: createdAt,
        item_count: sales.length,
        sales,
        payments,
        _isLocalOnly: true,
      }

      await withReturnReceiptsCache((receipts) => [optimistic, ...receipts])
      return { tempId: receiptId }
    }

    return {}
  }

  return {}
}

function remapIdInUrl(url: string, idMap: Record<string, string>) {
  let mapped = url
  for (const [tempId, realId] of Object.entries(idMap)) {
    mapped = mapped.replace(`/api/products/${tempId}/adjust`, `/api/products/${realId}/adjust`)
    mapped = mapped.replace(`/api/products/${tempId}`, `/api/products/${realId}`)
  }
  return mapped
}

function remapIdsInBody(body: unknown, idMap: Record<string, string>) {
  if (!body || typeof body !== "object") return body
  const clone = JSON.parse(JSON.stringify(body)) as Record<string, unknown>

  if (clone._offlineTempId !== undefined) {
    delete clone._offlineTempId
  }

  if (clone._offlineReceiptId !== undefined) {
    delete clone._offlineReceiptId
  }

  if (Array.isArray(clone.items)) {
    clone.items = clone.items.map((item) => {
      if (!item || typeof item !== "object") return item
      const row = { ...(item as Record<string, unknown>) }
      const currentId = String(row.productId ?? "")
      if (idMap[currentId]) {
        row.productId = idMap[currentId]
      }
      return row
    })
  }

  return clone
}

async function applyCreateSyncResolution(mutation: QueuedMutation, response: Response) {
  if (mutation.url !== "/api/products" || mutation.method !== "POST" || !mutation.tempId) return null
  try {
    const data = await response.clone().json() as { product?: ProductShape }
    const created = data.product
    if (!created?.id) return null

    await withProductsCache((products) =>
      products.map((product) =>
        product.id === mutation.tempId
          ? { ...product, ...created, id: created.id, _isLocalOnly: false }
          : product
      )
    )

    return { [mutation.tempId]: created.id } as Record<string, string>
  } catch {
    return null
  }
}

function mergeProductsPreservingLocal(serverData: unknown, existingData: unknown) {
  const incoming = (serverData as { products?: ProductShape[] })?.products
  const existing = (existingData as { products?: ProductShape[] })?.products
  const serverProducts = Array.isArray(incoming) ? incoming : []
  const currentProducts = Array.isArray(existing) ? existing : []

  const localOnly = currentProducts.filter((product) => product?._isLocalOnly)
  const merged = [...localOnly]

  for (const serverProduct of serverProducts) {
    if (!merged.some((product) => product.id === serverProduct.id)) {
      merged.push(serverProduct)
    }
  }

  return { products: merged }
}

export async function cacheData<T>(key: string, data: T) {
  if (!isBrowser()) return
  await putIntoStore(CACHE_STORE, {
    key,
    data,
    updatedAt: Date.now(),
  } satisfies CachedRecord)
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  if (!isBrowser()) return null

  const db = await openDb()
  const tx = db.transaction(CACHE_STORE, "readonly")
  const store = tx.objectStore(CACHE_STORE)
  const record = (await idbRequest(store.get(key))) as CachedRecord | undefined
  await txDone(tx)

  if (!record) {
    return null
  }

  return record.data as T
}

async function getQueue() {
  if (!isBrowser()) return [] as QueuedMutation[]
  const queue = await getAllFromStore<QueuedMutation>(QUEUE_STORE)
  return queue.sort((a, b) => a.createdAt - b.createdAt)
}

export async function getQueuedMutationCount() {
  const queue = await getQueue()
  return queue.length
}

export async function getConflictCount() {
  if (!isBrowser()) return 0
  const conflicts = await getAllFromStore<SyncConflict>(CONFLICT_STORE)
  return conflicts.length
}

export async function listConflicts() {
  if (!isBrowser()) return [] as SyncConflict[]
  const conflicts = await getAllFromStore<SyncConflict>(CONFLICT_STORE)
  return conflicts.sort((a, b) => b.createdAt - a.createdAt)
}

export async function clearConflicts() {
  if (!isBrowser()) return
  await clearStore(CONFLICT_STORE)
}

async function enqueueMutation(mutation: Omit<QueuedMutation, "id" | "createdAt" | "retryCount">) {
  await putIntoStore(QUEUE_STORE, {
    ...mutation,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    retryCount: 0,
  } satisfies QueuedMutation)
}

async function markConflict(mutation: QueuedMutation, status: number, reason: string) {
  const conflict: SyncConflict = {
    id: crypto.randomUUID(),
    mutationId: mutation.id,
    url: mutation.url,
    method: mutation.method,
    status,
    reason,
    payload: mutation.body,
    createdAt: Date.now(),
  }
  await putIntoStore(CONFLICT_STORE, conflict)
}

function isConflictStatus(status: number) {
  return status === 409 || status === 410 || status === 412 || status === 422
}

function shouldTreatAsSuccess(mutation: QueuedMutation, status: number) {
  return mutation.method === "DELETE" && status === 404
}

export async function fetchWithOfflineCache<T>(url: string): Promise<T> {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true
  const cacheKey = url

  if (!isOnline) {
    const cached = await getCachedData<T>(cacheKey)
    if (cached !== null) return cached
    throw new Error("You are offline and there is no cached data available.")
  }

  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Failed request (${res.status})`)
    }
    const data = (await res.json()) as T
    if (cacheKey === PRODUCTS_CACHE_KEY) {
      const previous = await getCachedData<{ products: ProductShape[] }>(PRODUCTS_CACHE_KEY)
      const merged = mergeProductsPreservingLocal(data, previous)
      await cacheData(cacheKey, merged as T)
      return merged as T
    }

    if (cacheKey === RETURN_RECEIPTS_CACHE_KEY) {
      const previous = await getCachedData<{ receipts: CachedReturnReceipt[] }>(RETURN_RECEIPTS_CACHE_KEY)
      const merged = mergeReturnReceiptsPreservingLocal(data, previous)
      await cacheData(cacheKey, merged as T)
      return merged as T
    }

    await cacheData(cacheKey, data)
    return data
  } catch {
    const cached = await getCachedData<T>(cacheKey)
    if (cached !== null) return cached
    throw new Error("Failed to fetch data and no offline cache was found.")
  }
}

export async function sendOrQueueMutation(input: {
  url: string
  method: "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
  headers?: Record<string, string>
}) {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true
  const optimistic = await applyOptimisticProductMutation(input)

  if (!isOnline) {
    await enqueueMutation({ ...input, tempId: optimistic.tempId })
    return { queued: true as const, response: null }
  }

  try {
    const body = remapIdsInBody(input.body, {})
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      if (isConflictStatus(response.status)) {
        return { queued: false as const, response, conflict: true as const }
      }
      return { queued: false as const, response }
    }

    if (input.url === "/api/sales/batch" && input.method === "POST") {
      await applyBatchReceiptCacheResolution(
        { url: input.url, method: input.method, body: input.body },
        response
      )
    }

    if (input.url === "/api/products" && input.method === "POST" && optimistic.tempId) {
      await applyCreateSyncResolution(
        {
          id: "live",
          url: input.url,
          method: input.method,
          body: input.body,
          headers: input.headers,
          createdAt: Date.now(),
          retryCount: 0,
          tempId: optimistic.tempId,
        },
        response
      )
    }

    return { queued: false as const, response }
  } catch {
    await enqueueMutation({ ...input, tempId: optimistic.tempId })
    return { queued: true as const, response: null }
  }
}

export async function processOfflineQueue() {
  const queue = await getQueue()
  if (queue.length === 0) return { synced: 0, failed: 0, conflicts: 0 }

  let synced = 0
  let failed = 0
  let conflicts = 0
  const tempIdMap: Record<string, string> = {}

  for (const mutation of queue) {
    const mappedUrl = remapIdInUrl(mutation.url, tempIdMap)
    const mappedBody = remapIdsInBody(mutation.body, tempIdMap)

    try {
      const res = await fetch(mappedUrl, {
        method: mutation.method,
        headers: mutation.headers,
        body: mappedBody ? JSON.stringify(mappedBody) : undefined,
      })

      if (res.ok || shouldTreatAsSuccess(mutation, res.status)) {
        await deleteFromStore(QUEUE_STORE, mutation.id)
        await applyBatchReceiptCacheResolution(mutation, res)
        const createdMap = await applyCreateSyncResolution(mutation, res)
        if (createdMap) Object.assign(tempIdMap, createdMap)
        synced += 1
      } else if (isConflictStatus(res.status)) {
        await markConflict(
          mutation,
          res.status,
          `Server rejected ${mutation.method} ${mutation.url} with status ${res.status}.`
        )
        await deleteFromStore(QUEUE_STORE, mutation.id)
        conflicts += 1
      } else {
        failed += 1
        if (mutation.retryCount + 1 >= MAX_RETRY_COUNT) {
          await markConflict(
            mutation,
            res.status,
            `Giving up after ${MAX_RETRY_COUNT} retries due to repeated server errors.`
          )
          await deleteFromStore(QUEUE_STORE, mutation.id)
          conflicts += 1
        } else {
          await putIntoStore(QUEUE_STORE, {
            ...mutation,
            retryCount: mutation.retryCount + 1,
          } satisfies QueuedMutation)
        }
      }
    } catch {
      failed += 1

      if (mutation.retryCount + 1 >= MAX_RETRY_COUNT) {
        await markConflict(
          mutation,
          0,
          `Request failed repeatedly, likely network or timeout issue.`
        )
        await deleteFromStore(QUEUE_STORE, mutation.id)
        conflicts += 1
      } else {
        await putIntoStore(QUEUE_STORE, {
          ...mutation,
          retryCount: mutation.retryCount + 1,
        } satisfies QueuedMutation)
      }
    }
  }

  return { synced, failed, conflicts }
}
