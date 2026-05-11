"use client"

const DB_NAME = "stockeasy-offline-db"
const DB_VERSION = 1
const CACHE_STORE = "cache"
const QUEUE_STORE = "queue"
const CONFLICT_STORE = "conflicts"
const MAX_RETRY_COUNT = 5
const PRODUCTS_CACHE_KEY = "/api/products"

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
    tempId = String(payload._offlineTempId ?? `local-${crypto.randomUUID()}`)
    payload._offlineTempId = tempId
    await withProductsCache((products) => [createOptimisticProduct(payload, tempId), ...products])
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
    const items = Array.isArray(payload.items) ? (payload.items as Array<{ productId: string; quantity: number }>) : []
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
