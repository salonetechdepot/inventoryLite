"use client"

import { mutate } from "swr"
import { restockQuantityForLine, type ReturnDisposition } from "@/lib/return-inventory"
import { isSessionExpired, shouldClearStoredSession } from "@/lib/session-expiry"
import { warmDashboardRscCache } from "@/lib/offline-navigation"

const DB_NAME = "stockeasy-offline-db"
const DB_VERSION = 1
const CACHE_STORE = "cache"
const QUEUE_STORE = "queue"
const CONFLICT_STORE = "conflicts"
const MAX_RETRY_COUNT = 5
const PRODUCTS_CACHE_KEY = "/api/products"
/** Stable SWR keys — filters are client-side so offline cache always hits. */
export const RETURN_RECEIPTS_CACHE_KEY = "/api/receipts?type=return&limit=500&status=all"
export const SALE_RECEIPTS_CACHE_KEY = "/api/receipts?type=sale&limit=500&status=all"
export const CATEGORIES_CACHE_KEY = "/api/categories"
export const DASHBOARD_STATS_CACHE_KEY = "/api/dashboard/stats"
export const ANALYTICS_CACHE_KEY = "/api/analytics"
export const SESSION_CACHE_KEY = "/api/auth/session"

/** All API keys refreshed in the background while online (IndexedDB + SWR). */
export const OFFLINE_DATA_CACHE_KEYS = [
  SESSION_CACHE_KEY,
  PRODUCTS_CACHE_KEY,
  CATEGORIES_CACHE_KEY,
  DASHBOARD_STATS_CACHE_KEY,
  SALE_RECEIPTS_CACHE_KEY,
  RETURN_RECEIPTS_CACHE_KEY,
  ANALYTICS_CACHE_KEY,
] as const

/** How often to refresh cached data while the app is online and visible. */
export const OFFLINE_BACKGROUND_REFRESH_MS = 30_000

const SESSION_LOCAL_KEY = "stockeasy-session-user-v1"

const EMPTY_DASHBOARD_STATS = {
  stats: {
    totalProducts: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    inventoryValue: 0,
    todaySalesCount: 0,
    todaySalesTotal: 0,
  },
  lowStockProducts: [] as Array<{
    id: string
    name: string
    quantity: number
    low_stock_threshold: number
  }>,
}

export type SessionBackup = {
  user: unknown
  sessionExpiresAt: string | null
}

function persistSessionBackup(data: SessionBackup) {
  if (!isBrowser()) return
  try {
    if (data?.user && !shouldClearStoredSession(data.sessionExpiresAt)) {
      localStorage.setItem(SESSION_LOCAL_KEY, JSON.stringify(data))
    } else {
      localStorage.removeItem(SESSION_LOCAL_KEY)
    }
  } catch {
    // Ignore quota / private mode errors.
  }
}

function loadSessionBackup(): SessionBackup | null {
  if (!isBrowser()) return null
  try {
    const raw = localStorage.getItem(SESSION_LOCAL_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as SessionBackup
    if (!data?.user || shouldClearStoredSession(data.sessionExpiresAt)) {
      localStorage.removeItem(SESSION_LOCAL_KEY)
      return null
    }
    return data
  } catch {
    return null
  }
}

export async function clearSessionBackup() {
  if (!isBrowser()) return
  try {
    localStorage.removeItem(SESSION_LOCAL_KEY)
  } catch {
    // ignore
  }
  await cacheData(SESSION_CACHE_KEY, { user: null, sessionExpiresAt: null })
}

function isOfflineGatewayResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? ""
  return (
    response.status === 503 ||
    response.status === 504 ||
    contentType.includes("text/html")
  )
}

async function offlineFallbackForKey<T>(cacheKey: string): Promise<T | null> {
  if (cacheKey === SESSION_CACHE_KEY) {
    const backup = loadSessionBackup()
    if (backup) return backup as T
    return { user: null, sessionExpiresAt: null } as T
  }
  if (cacheKey === ANALYTICS_CACHE_KEY) {
    const { EMPTY_ANALYTICS } = await import("@/lib/analytics-types")
    return { ...EMPTY_ANALYTICS, _offline: true } as T
  }
  if (cacheKey === DASHBOARD_STATS_CACHE_KEY) {
    return EMPTY_DASHBOARD_STATS as T
  }
  if (cacheKey === CATEGORIES_CACHE_KEY) {
    return { categories: [] } as T
  }
  if (cacheKey === PRODUCTS_CACHE_KEY) {
    return { products: [] } as T
  }
  if (
    cacheKey === RETURN_RECEIPTS_CACHE_KEY ||
    cacheKey === SALE_RECEIPTS_CACHE_KEY ||
    cacheKey.startsWith("/api/receipts")
  ) {
    return { receipts: [] } as T
  }

  const productMatch = cacheKey.match(/^\/api\/products\/([^/?]+)$/)
  if (productMatch) {
    const productsState = await getCachedData<{ products: ProductShape[] }>(PRODUCTS_CACHE_KEY)
    const product = productsState?.products?.find((p) => p.id === productMatch[1])
    if (product) return { product } as T
  }

  return null
}

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
  cost_price?: number | null
  specifications?: Record<string, string> | null
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
    cost_price:
      payload.costPrice === undefined || payload.costPrice === null
        ? null
        : Number(payload.costPrice),
    specifications:
      payload.specifications && typeof payload.specifications === "object"
        ? (payload.specifications as Record<string, string>)
        : null,
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
    cost_price:
      payload.costPrice === undefined
        ? (product.cost_price ?? null)
        : payload.costPrice === null
          ? null
          : Number(payload.costPrice),
    specifications:
      payload.specifications === undefined
        ? (product.specifications ?? null)
        : payload.specifications === null
          ? null
          : (payload.specifications as Record<string, string>),
  }
}

/** Matches GET /api/receipts row shape + offline flag */
interface CachedReceipt {
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
    return_condition?: string | null
    return_disposition?: string | null
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

type CachedReturnReceipt = CachedReceipt

interface DashboardStatsShape {
  totalProducts: number
  lowStockCount: number
  outOfStockCount: number
  inventoryValue: number
  todaySalesCount: number
  todaySalesTotal: number
}

function mergeReceiptsPreservingLocal(serverData: unknown, existingData: unknown) {
  const incoming = (serverData as { receipts?: CachedReceipt[] })?.receipts
  const existing = (existingData as { receipts?: CachedReceipt[] })?.receipts
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

function mergeReturnReceiptsPreservingLocal(serverData: unknown, existingData: unknown) {
  return mergeReceiptsPreservingLocal(serverData, existingData)
}

function mergeSaleReceiptsPreservingLocal(serverData: unknown, existingData: unknown) {
  return mergeReceiptsPreservingLocal(serverData, existingData)
}

async function withReceiptsCache(
  cacheKey: string,
  updater: (receipts: CachedReceipt[]) => CachedReceipt[]
) {
  const current =
    (await getCachedData<{ receipts: CachedReceipt[] }>(cacheKey)) ??
    ({ receipts: [] } as { receipts: CachedReceipt[] })
  const next = updater(Array.isArray(current.receipts) ? current.receipts : [])
  await cacheData(cacheKey, { receipts: next })
}

async function withReturnReceiptsCache(updater: (receipts: CachedReceipt[]) => CachedReceipt[]) {
  return withReceiptsCache(RETURN_RECEIPTS_CACHE_KEY, updater)
}

async function withSaleReceiptsCache(updater: (receipts: CachedReceipt[]) => CachedReceipt[]) {
  return withReceiptsCache(SALE_RECEIPTS_CACHE_KEY, updater)
}

function parseReceiptPaymentUrl(url: string): string | null {
  const match = url.match(/^\/api\/receipts\/([^/]+)\/payments$/)
  return match?.[1] ?? null
}

function formatReceiptFromApiResponse(receipt: Record<string, unknown>, sales: Array<Record<string, unknown>>) {
  return formatReceiptFromBatchResponse({ receipt, sales })
}

async function bumpDashboardStatsAfterSale(amountPaid: number, itemsSold: number) {
  const current = await getCachedData<{
    stats: DashboardStatsShape
    lowStockProducts: Array<{
      id: string
      name: string
      quantity: number
      low_stock_threshold: number
    }>
  }>(DASHBOARD_STATS_CACHE_KEY)
  if (!current?.stats) return

  const productsState = await getCachedData<{ products: ProductShape[] }>(PRODUCTS_CACHE_KEY)
  const products = productsState?.products ?? []
  const lowStockCount = products.filter(
    (p) => (p.quantity ?? 0) <= (p.low_stock_threshold ?? 0)
  ).length
  const outOfStockCount = products.filter((p) => (p.quantity ?? 0) === 0).length
  const inventoryValue = products.reduce(
    (sum, p) => sum + (p.quantity ?? 0) * Number(p.unit_price ?? 0),
    0
  )

  await cacheData(DASHBOARD_STATS_CACHE_KEY, {
    ...current,
    stats: {
      ...current.stats,
      totalProducts: products.length,
      lowStockCount,
      outOfStockCount,
      inventoryValue,
      todaySalesCount: Number(current.stats.todaySalesCount ?? 0) + itemsSold,
      todaySalesTotal: Number(current.stats.todaySalesTotal ?? 0) + amountPaid,
    },
    lowStockProducts: products
      .filter((p) => (p.quantity ?? 0) <= (p.low_stock_threshold ?? 0))
      .sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0))
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity ?? 0,
        low_stock_threshold: p.low_stock_threshold ?? 0,
      })),
  })
}

type BatchCartItem = {
  productId: string
  quantity: number
  returnCondition?: string
  returnDisposition?: string
}

async function buildOptimisticBatchReceiptAsync(
  payload: Record<string, unknown>,
  items: BatchCartItem[],
  receiptId: string,
  receiptType: "SALE" | "RETURN"
): Promise<CachedReceipt> {
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
      return_condition:
        receiptType === "RETURN" ? item.returnCondition ?? "SEALED" : null,
      return_disposition:
        receiptType === "RETURN" ? item.returnDisposition ?? "RESTOCK" : null,
      created_at: createdAt,
    }
  })

  const payments =
    safeAmountPaid > 0
      ? [
          {
            id: `${receiptId}-pay`,
            amount: safeAmountPaid,
            method:
              typeof payload.paymentMethod === "string"
                ? payload.paymentMethod.trim() || "cash"
                : "cash",
            note: "initial payment",
            created_at: createdAt,
          },
        ]
      : []

  return {
    id: receiptId,
    type: receiptType,
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
}

async function upsertReceiptInCache(
  cacheKey: string,
  formatted: CachedReceipt,
  offlineReceiptId?: string
) {
  await withReceiptsCache(cacheKey, (receipts) => {
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

function formatReceiptFromBatchResponse(data: {
  receipt: Record<string, unknown>
  sales: Array<Record<string, unknown>>
}): CachedReceipt {
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
    return_condition: (sale.return_condition as string | null | undefined) ?? null,
    return_disposition: (sale.return_disposition as string | null | undefined) ?? null,
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
  const cacheKey = isReturn ? RETURN_RECEIPTS_CACHE_KEY : SALE_RECEIPTS_CACHE_KEY
  await upsertReceiptInCache(cacheKey, formatted, offlineReceiptId)
}

async function applyPaymentCacheResolution(mutation: QueuedMutation, response: Response) {
  const receiptId = parseReceiptPaymentUrl(mutation.url)
  if (!receiptId || mutation.method !== "POST") return
  try {
    const data = (await response.clone().json()) as {
      receipt?: Record<string, unknown>
      credited?: number
    }
    if (!data?.receipt) return
    const sales = Array.isArray(data.receipt.sales)
      ? (data.receipt.sales as Array<Record<string, unknown>>)
      : []
    const formatted = formatReceiptFromApiResponse(data.receipt, sales)
    await upsertReceiptInCache(SALE_RECEIPTS_CACHE_KEY, { ...formatted, _isLocalOnly: false })
    const credited = Number(data.credited ?? 0)
    if (credited > 0) {
      await bumpDashboardStatsAfterSale(credited, 0)
    }
  } catch {
    // ignore parse errors
  }
}

async function applyOptimisticPaymentMutation(input: {
  url: string
  method: "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
}) {
  const receiptId = parseReceiptPaymentUrl(input.url)
  if (!receiptId || input.method !== "POST") return {}

  const payload = (input.body ?? {}) as Record<string, unknown>
  const amount = Math.max(0, Number(payload.amount ?? 0))
  if (amount <= 0) return {}

  const method = typeof payload.method === "string" ? payload.method : "cash"
  const note = typeof payload.note === "string" ? payload.note.trim() : null
  const createdAt = new Date().toISOString()

  await withSaleReceiptsCache((receipts) =>
    receipts.map((receipt) => {
      if (receipt.id !== receiptId) return receipt
      const currentDue = Number(receipt.amount_due ?? 0)
      const credited = Math.min(amount, currentDue)
      const overflow = amount - credited
      const newPaid = Number(receipt.amount_paid ?? 0) + amount
      const newDue = Math.max(0, currentDue - credited)
      const newChange = Number(receipt.change_given ?? 0) + overflow
      const nowPaid = newDue <= 0
      const newPayment = {
        id: `local-pay-${crypto.randomUUID()}`,
        amount,
        method,
        note,
        created_at: createdAt,
      }
      return {
        ...receipt,
        amount_paid: newPaid,
        amount_due: newDue,
        change_given: newChange,
        is_paid: nowPaid,
        is_part_payment: nowPaid ? false : receipt.is_part_payment,
        updated_at: createdAt,
        payments: [...(receipt.payments ?? []), newPayment],
        _isLocalOnly: true,
      }
    })
  )

  return {}
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
  if (parseReceiptPaymentUrl(input.url) && input.method === "POST") {
    await applyOptimisticPaymentMutation(input)
    return {}
  }

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
      ? (payload.items as BatchCartItem[])
      : []
    const type = payload.type === "return" ? "return" : "sale"

    await withProductsCache((products) =>
      products.map((product) => {
        const item = items.find((entry) => entry.productId === product.id)
        if (!item) return product
        const qty = Number(item.quantity ?? 0)
        const delta =
          type === "return"
            ? restockQuantityForLine(
                qty,
                item.returnDisposition as ReturnDisposition | undefined
              )
            : -qty
        return { ...product, quantity: Number(product.quantity ?? 0) + delta }
      })
    )

    if (items.length > 0) {
      const receiptId = String(payload._offlineReceiptId ?? `local-${crypto.randomUUID()}`)
      payload._offlineReceiptId = receiptId
      const receiptType = type === "return" ? "RETURN" : "SALE"
      const optimistic = await buildOptimisticBatchReceiptAsync(
        payload,
        items,
        receiptId,
        receiptType
      )
      const cacheKey =
        type === "return" ? RETURN_RECEIPTS_CACHE_KEY : SALE_RECEIPTS_CACHE_KEY
      await withReceiptsCache(cacheKey, (receipts) => [optimistic, ...receipts])

      if (type === "sale") {
        const itemsSold = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)
        await bumpDashboardStatsAfterSale(Number(optimistic.amount_paid ?? 0), itemsSold)
      }

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

export async function getCacheUpdatedAt(key: string): Promise<number | null> {
  if (!isBrowser()) return null
  const db = await openDb()
  const tx = db.transaction(CACHE_STORE, "readonly")
  const store = tx.objectStore(CACHE_STORE)
  const record = (await idbRequest(store.get(key))) as CachedRecord | undefined
  await txDone(tx)
  return record?.updatedAt ?? null
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

export async function dismissConflict(id: string) {
  if (!isBrowser()) return
  await deleteFromStore(CONFLICT_STORE, id)
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

/** Client/validation errors won't succeed on retry — surface immediately. */
function isPermanentSyncFailure(status: number) {
  return status === 400 || status === 401 || status === 403 || status === 404
}

function mutationFetchHeaders(mutation: QueuedMutation): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(mutation.headers ?? {}),
  }
}

async function readApiError(response: Response): Promise<string> {
  try {
    const data = (await response.clone().json()) as { error?: string; message?: string }
    return data.error || data.message || `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

export const OFFLINE_SYNC_COMPLETE_EVENT = "stockeasy-offline-sync-complete"
export const OFFLINE_CACHE_REFRESHED_EVENT = "stockeasy-offline-cache-refreshed"

export type OfflineCacheRefreshResult = {
  refreshed: number
  failed: number
  productDetails: number
}

async function prefetchProductDetailCaches(updateSwr: boolean): Promise<number> {
  const data = await getCachedData<{ products: Array<{ id: string }> }>(PRODUCTS_CACHE_KEY)
  const ids = (data?.products ?? []).map((p) => p.id).filter(Boolean)
  if (ids.length === 0) return 0

  let count = 0
  await Promise.allSettled(
    ids.slice(0, 300).map(async (id) => {
      const key = `/api/products/${id}`
      const productData = await fetchWithOfflineCache<{ product: unknown }>(key)
      if (updateSwr) {
        await mutate(key, productData, { revalidate: false })
      }
      count += 1
    })
  )
  return count
}

/** Fetch all dashboard data from the server, store in IndexedDB, and update SWR. */
export async function refreshAllOfflineData(options?: {
  updateSwr?: boolean
  warmRoutes?: boolean
}): Promise<OfflineCacheRefreshResult> {
  if (!isBrowser() || !navigator.onLine) {
    return { refreshed: 0, failed: 0, productDetails: 0 }
  }

  const updateSwr = options?.updateSwr !== false
  const warmRoutes = options?.warmRoutes !== false
  let refreshed = 0
  let failed = 0

  await Promise.allSettled(
    OFFLINE_DATA_CACHE_KEYS.map(async (key) => {
      try {
        const data = await fetchWithOfflineCache(key)
        if (updateSwr) {
          await mutate(key, data, { revalidate: false })
        }
        refreshed += 1
      } catch {
        failed += 1
      }
    })
  )

  let productDetails = 0
  try {
    productDetails = await prefetchProductDetailCaches(updateSwr)
  } catch {
    // Best-effort — list pages still work from products cache.
  }

  if (warmRoutes) {
    try {
      await warmDashboardRscCache()
    } catch {
      // ignore
    }
  }

  if (isBrowser()) {
    window.dispatchEvent(
      new CustomEvent(OFFLINE_CACHE_REFRESHED_EVENT, {
        detail: { refreshed, failed, productDetails },
      })
    )
  }

  return { refreshed, failed, productDetails }
}

function notifySyncComplete(detail: { synced: number; failed: number; conflicts: number }) {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT, { detail }))
}

async function readFromOfflineCache<T>(cacheKey: string): Promise<T> {
  const cached = await getCachedData<T>(cacheKey)
  if (cached !== null) {
    if (cacheKey === SESSION_CACHE_KEY) {
      const sessionData = cached as SessionBackup
      if (!sessionData.user || shouldClearStoredSession(sessionData.sessionExpiresAt)) {
        await clearSessionBackup()
        return { user: null, sessionExpiresAt: null } as T
      }
    }
    return cached
  }
  const fallback = await offlineFallbackForKey<T>(cacheKey)
  if (fallback !== null) return fallback
  // Never throw for UI data — empty payloads keep pages from crashing offline.
  return {} as T
}

export async function fetchWithOfflineCache<T>(url: string): Promise<T> {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true
  const cacheKey = url

  if (!isOnline) {
    return readFromOfflineCache<T>(cacheKey)
  }

  try {
    const res = await fetch(url)
    if (!res.ok || isOfflineGatewayResponse(res)) {
      throw new Error(`Failed request (${res.status})`)
    }
    const data = (await res.json()) as T

    if (cacheKey === SESSION_CACHE_KEY) {
      const sessionData = data as SessionBackup & { locked?: boolean }
      if (sessionData.locked) {
        await clearSessionBackup()
        await cacheData(cacheKey, data)
        return data as T
      }
      if (sessionData.user && shouldClearStoredSession(sessionData.sessionExpiresAt)) {
        await clearSessionBackup()
        return { user: null, sessionExpiresAt: null } as T
      }
      persistSessionBackup(sessionData)
    }
    if (cacheKey === PRODUCTS_CACHE_KEY) {
      const previous = await getCachedData<{ products: ProductShape[] }>(PRODUCTS_CACHE_KEY)
      const merged = mergeProductsPreservingLocal(data, previous)
      await cacheData(cacheKey, merged as T)
      return merged as T
    }

    if (cacheKey === RETURN_RECEIPTS_CACHE_KEY) {
      const previous = await getCachedData<{ receipts: CachedReceipt[] }>(RETURN_RECEIPTS_CACHE_KEY)
      const merged = mergeReturnReceiptsPreservingLocal(data, previous)
      await cacheData(cacheKey, merged as T)
      return merged as T
    }

    if (cacheKey === SALE_RECEIPTS_CACHE_KEY) {
      const previous = await getCachedData<{ receipts: CachedReceipt[] }>(SALE_RECEIPTS_CACHE_KEY)
      const merged = mergeSaleReceiptsPreservingLocal(data, previous)
      await cacheData(cacheKey, merged as T)
      return merged as T
    }

    await cacheData(cacheKey, data)
    return data
  } catch {
    return readFromOfflineCache<T>(cacheKey)
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
      headers: {
        "Content-Type": "application/json",
        ...(input.headers ?? {}),
      },
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      if (isOfflineGatewayResponse(response)) {
        await enqueueMutation({ ...input, tempId: optimistic.tempId })
        return { queued: true as const, response: null }
      }
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

    if (parseReceiptPaymentUrl(input.url) && input.method === "POST") {
      await applyPaymentCacheResolution(
        {
          id: "live",
          url: input.url,
          method: input.method,
          body: input.body,
          headers: input.headers,
          createdAt: Date.now(),
          retryCount: 0,
        },
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

export type SyncQueueResult = {
  synced: number
  failed: number
  conflicts: number
  lastError?: string
}

export async function processOfflineQueue(): Promise<SyncQueueResult> {
  const queue = await getQueue()
  if (queue.length === 0) return { synced: 0, failed: 0, conflicts: 0 }

  let synced = 0
  let failed = 0
  let conflicts = 0
  let lastError: string | undefined
  const tempIdMap: Record<string, string> = {}

  for (const mutation of queue) {
    const mappedUrl = remapIdInUrl(mutation.url, tempIdMap)
    const mappedBody = remapIdsInBody(mutation.body, tempIdMap)

    try {
      const res = await fetch(mappedUrl, {
        method: mutation.method,
        headers: mutationFetchHeaders(mutation),
        credentials: "same-origin",
        body: mappedBody ? JSON.stringify(mappedBody) : undefined,
      })

      if (res.ok || shouldTreatAsSuccess(mutation, res.status)) {
        await deleteFromStore(QUEUE_STORE, mutation.id)
        await applyBatchReceiptCacheResolution(mutation, res)
        await applyPaymentCacheResolution(mutation, res)
        const createdMap = await applyCreateSyncResolution(mutation, res)
        if (createdMap) Object.assign(tempIdMap, createdMap)
        synced += 1
      } else if (isConflictStatus(res.status) || isPermanentSyncFailure(res.status)) {
        const reason = await readApiError(res)
        lastError = reason
        await markConflict(mutation, res.status, reason)
        await deleteFromStore(QUEUE_STORE, mutation.id)
        conflicts += 1
      } else {
        failed += 1
        lastError = await readApiError(res)
        if (mutation.retryCount + 1 >= MAX_RETRY_COUNT) {
          await markConflict(
            mutation,
            res.status,
            lastError || `Giving up after ${MAX_RETRY_COUNT} retries.`
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
      lastError = "Network error while syncing. Try again."

      if (mutation.retryCount + 1 >= MAX_RETRY_COUNT) {
        await markConflict(mutation, 0, lastError)
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

  const result = { synced, failed, conflicts, lastError }
  if (synced > 0) {
    notifySyncComplete(result)
  }
  return result
}
