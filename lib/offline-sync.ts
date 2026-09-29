"use client"

import { mutate } from "swr"
import { restockQuantityForLine, type ReturnDisposition } from "@/lib/return-inventory"
import { isSessionExpired, shouldClearStoredSession } from "@/lib/session-expiry"
import { warmDashboardRscCache } from "@/lib/offline-navigation"
import { resolveCheckoutPayment } from "@/lib/checkout-payment"
import type { SyncCursorState, SyncPayload } from "@/lib/sync-types"
import {
  capReceiptHistory,
  mergeProductSync,
  mergeReceiptSync,
  RECEIPT_HISTORY_CAP,
  type ReceiptIncoming,
} from "@/lib/sync-merge"
import {
  buildCloseSnapshot,
  emptyMethodTotals,
  formatBusinessDateLabel,
  getBusinessDateKey,
  normalizeMethodTotals,
  roundMoney,
  sumMethodTotals,
  type MethodTotals,
} from "@/lib/day-close"
import {
  isStaleProductMutation,
  mergeSyncHeaders,
} from "@/lib/sync-conflict-recovery"

const DB_NAME = "biva-offline-db"
const DB_VERSION = 1
const CACHE_STORE = "cache"
const QUEUE_STORE = "queue"
const CONFLICT_STORE = "conflicts"
const MAX_RETRY_COUNT = 5
const PRODUCTS_CACHE_KEY = "/api/products"
export { PRODUCTS_CACHE_KEY }
/** Stable SWR keys — filters are client-side so offline cache always hits. */
export const RETURN_RECEIPTS_CACHE_KEY = "/api/receipts?type=return&limit=500&status=all"
export const SALE_RECEIPTS_CACHE_KEY = "/api/receipts?type=sale&limit=500&status=all"
export const CATEGORIES_CACHE_KEY = "/api/categories"
export const DASHBOARD_STATS_CACHE_KEY = "/api/dashboard/stats"
export const ANALYTICS_CACHE_KEY = "/api/analytics"
export const SESSION_CACHE_KEY = "/api/auth/session"

/** Keys kept warm via delta sync (analytics loads on demand when opening Reports). */
export const OFFLINE_DATA_CACHE_KEYS = [
  SESSION_CACHE_KEY,
  PRODUCTS_CACHE_KEY,
  CATEGORIES_CACHE_KEY,
  DASHBOARD_STATS_CACHE_KEY,
  SALE_RECEIPTS_CACHE_KEY,
  RETURN_RECEIPTS_CACHE_KEY,
] as const

/** Slow heartbeat — event-driven sync handles most updates. */
export const OFFLINE_BACKGROUND_REFRESH_MS = 180_000

export const SYNC_CURSOR_CACHE_KEY = "__sync_cursor__"

const SESSION_LOCAL_KEY = "biva-session-user-v1"

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
  if (contentType.includes("application/json")) {
    return response.status === 503 || response.status === 504
  }
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
  created_at?: string | Date | null
  updated_at?: string | Date | null
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
  original_receipt_id?: string | null
  original_receipt?: {
    id: string
    created_at: string | Date
    net_amount: number
  } | null
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
  const merged = mergeReceiptSync(
    current,
    serverReceipts as unknown as ReceiptIncoming[]
  )
  return { receipts: capReceiptHistory(merged, RECEIPT_HISTORY_CAP) }
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
  const isPartPayment = Boolean(payload.isPartPayment)
  const {
    amountReceived,
    changeGiven,
    amountDue,
    isPaid,
    isPartPayment: storeIsPartPayment,
  } = resolveCheckoutPayment({
    netAmount,
    amountTendered: Number(payload.amountPaid ?? 0),
    isPartPayment,
  })
  const createdAt = new Date().toISOString()
  const customerName = typeof payload.customerName === "string" ? payload.customerName.trim() : ""
  const customerPhone = typeof payload.customerPhone === "string" ? payload.customerPhone.trim() : ""
  const originalReceiptId =
    receiptType === "RETURN" && typeof payload.originalReceiptId === "string"
      ? payload.originalReceiptId.trim() || null
      : null

  let original_receipt: CachedReceipt["original_receipt"] = null
  if (originalReceiptId) {
    const salesCache =
      (await getCachedData<{ receipts: CachedReceipt[] }>(SALE_RECEIPTS_CACHE_KEY))
        ?.receipts ?? []
    const linked = salesCache.find((r) => r.id === originalReceiptId)
    if (linked) {
      original_receipt = {
        id: linked.id,
        created_at: linked.created_at,
        net_amount: Number(linked.net_amount ?? 0),
      }
    } else {
      original_receipt = { id: originalReceiptId, created_at: createdAt, net_amount: 0 }
    }
  }

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
    amountReceived > 0
      ? [
          {
            id: `${receiptId}-pay`,
            amount: amountReceived,
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
    amount_paid: amountReceived,
    amount_due: amountDue,
    change_given: changeGiven,
    is_part_payment: storeIsPartPayment,
    is_paid: isPaid,
    notes: null,
    original_receipt_id: originalReceiptId,
    original_receipt,
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
    original_receipt_id: (r.original_receipt_id as string | null) ?? null,
    original_receipt:
      r.original_receipt && typeof r.original_receipt === "object"
        ? {
            id: String((r.original_receipt as { id?: string }).id ?? r.original_receipt_id ?? ""),
            created_at:
              (r.original_receipt as { created_at?: string }).created_at ?? createdAt,
            net_amount: Number(
              (r.original_receipt as { net_amount?: number }).net_amount ?? 0
            ),
          }
        : null,
    created_at: createdAt,
    updated_at: (r.updated_at as string | undefined) ?? createdAt,
    item_count: sales.length,
    sales,
    payments,
    _isLocalOnly: false,
  }
}

async function applyBatchReceiptCacheResolution(
  mutation: { url: string; method: string; body?: unknown; tempId?: string },
  response: Response
): Promise<Record<string, string> | null> {
  if (mutation.url !== "/api/sales/batch" || mutation.method !== "POST") return null
  let body: Record<string, unknown> = {}
  try {
    body =
      mutation.body && typeof mutation.body === "object"
        ? (mutation.body as Record<string, unknown>)
        : JSON.parse(String(mutation.body ?? "{}"))
  } catch {
    return null
  }
  const offlineReceiptId = body._offlineReceiptId
    ? String(body._offlineReceiptId)
    : mutation.tempId
      ? String(mutation.tempId)
      : undefined
  let data: { receipt?: Record<string, unknown>; sales?: Array<Record<string, unknown>>; type?: string }
  try {
    data = (await response.clone().json()) as typeof data
  } catch {
    return null
  }
  if (!data?.receipt) return null
  const formatted = formatReceiptFromBatchResponse({
    receipt: data.receipt,
    sales: Array.isArray(data.sales) ? data.sales : [],
  })
  const isReturn =
    String(data.receipt.type ?? data.type ?? "").toUpperCase() === "RETURN" || data.type === "return"
  const cacheKey = isReturn ? RETURN_RECEIPTS_CACHE_KEY : SALE_RECEIPTS_CACHE_KEY
  await upsertReceiptInCache(cacheKey, formatted, offlineReceiptId)

  const realId = String(formatted.id ?? "")
  if (offlineReceiptId && realId && offlineReceiptId !== realId) {
    return { [offlineReceiptId]: realId }
  }
  return null
}

async function applyDayCloseCacheResolution(mutation: QueuedMutation, response: Response) {
  if (mutation.url !== "/api/day-close" || mutation.method !== "POST") return
  try {
    const data = (await response.clone().json()) as { close?: Record<string, unknown> }
    if (!data?.close) return
    const dateKey = String(data.close.business_date ?? "")
    if (!dateKey) return
    const cacheKey = `/api/day-close?date=${dateKey}`
    const cached = await getCachedData<Record<string, unknown>>(cacheKey)
    await cacheData(cacheKey, {
      ...(cached ?? {}),
      existing_close: data.close,
      _offline: false,
    })
  } catch {
    // ignore
  }
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
      const newPaid = Number(receipt.amount_paid ?? 0) + credited
      const newDue = Math.max(0, currentDue - credited)
      const newChange = Number(receipt.change_given ?? 0) + overflow
      const nowPaid = newDue <= 0
      const newPayment = {
        id: `local-pay-${crypto.randomUUID()}`,
        amount: credited,
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
        is_part_payment: nowPaid ? false : true,
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

  if (input.url === "/api/day-close" && input.method === "POST") {
    const dateKey = String(payload.businessDate ?? getBusinessDateKey())
    const cacheKey = `/api/day-close?date=${dateKey}`
    const current = await getCachedData<{
      business_date: string
      business_date_label: string
      expected_by_method: MethodTotals
      expected_cash: number
      expected_total: number
      change_given_total: number
      sale_count: number
      return_count: number
      payment_count: number
      existing_close: Record<string, unknown> | null
      recent_closes: unknown[]
      _offline?: boolean
    }>(cacheKey)

    const expectedByMethod = normalizeMethodTotals(
      current?.expected_by_method ?? emptyMethodTotals()
    )
    const countedInput: MethodTotals = { ...expectedByMethod }
    const fromBody = normalizeMethodTotals(
      (payload.countedByMethod as MethodTotals | undefined) ?? {}
    )
    for (const [method, value] of Object.entries(fromBody)) {
      countedInput[method as keyof MethodTotals] = value
    }
    if (payload.countedCash !== undefined) {
      countedInput.cash = roundMoney(Number(payload.countedCash) || 0)
    }

    const snapshot = buildCloseSnapshot({ expectedByMethod, countedByMethod: countedInput })
    const now = new Date().toISOString()

    const existing_close = {
      id: `local-close-${dateKey}`,
      business_date: dateKey,
      business_date_label: formatBusinessDateLabel(dateKey),
      expected_by_method: snapshot.expectedByMethod,
      counted_by_method: snapshot.countedByMethod,
      expected_cash: snapshot.expectedCash,
      counted_cash: snapshot.countedCash,
      cash_variance: snapshot.cashVariance,
      expected_total: snapshot.expectedTotal,
      counted_total: snapshot.countedTotal,
      total_variance: snapshot.totalVariance,
      change_given_total: current?.change_given_total ?? 0,
      sale_count: current?.sale_count ?? 0,
      return_count: current?.return_count ?? 0,
      payment_count: current?.payment_count ?? 0,
      notes: typeof payload.notes === "string" ? payload.notes : null,
      closed_at: now,
      _pendingSync: true,
    }

    await cacheData(cacheKey, {
      business_date: dateKey,
      business_date_label: formatBusinessDateLabel(dateKey),
      expected_by_method: expectedByMethod,
      expected_cash: roundMoney(expectedByMethod.cash || 0),
      expected_total: roundMoney(sumMethodTotals(expectedByMethod)),
      change_given_total: current?.change_given_total ?? 0,
      sale_count: current?.sale_count ?? 0,
      return_count: current?.return_count ?? 0,
      payment_count: current?.payment_count ?? 0,
      existing_close,
      recent_closes: current?.recent_closes ?? [],
      _offline: true,
    })

    return { tempId: dateKey }
  }

  return {}
}

function remapIdInUrl(url: string, idMap: Record<string, string>) {
  let mapped = url
  for (const [tempId, realId] of Object.entries(idMap)) {
    mapped = mapped.replace(`/api/products/${tempId}/adjust`, `/api/products/${realId}/adjust`)
    mapped = mapped.replace(`/api/products/${tempId}`, `/api/products/${realId}`)
    mapped = mapped.replace(
      `/api/receipts/${tempId}/payments`,
      `/api/receipts/${realId}/payments`
    )
    mapped = mapped.replace(`/api/receipts/${tempId}`, `/api/receipts/${realId}`)
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
  return {
    products: mergeProductSync(
      currentProducts,
      serverProducts as import("@/lib/sync-types").SyncProduct[],
      true
    ),
  }
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

/** Dismiss and pull server truth into offline cache (online only). */
export async function dismissConflictAndReconcile(id: string) {
  await dismissConflict(id)
  if (isBrowser() && navigator.onLine) {
    await runDeltaSync()
  }
}

/** Re-queue a failed mutation and sync again — only when online; offline queue unchanged. */
export async function retrySyncConflict(
  conflictId: string
): Promise<SyncQueueResult | { ok: false; reason: string }> {
  if (!isBrowser()) return { ok: false, reason: "Not in browser" }
  if (!navigator.onLine) {
    return { ok: false, reason: "Connect to the internet to retry sync." }
  }
  const conflicts = await listConflicts()
  const conflict = conflicts.find((row) => row.id === conflictId)
  if (!conflict) return { ok: false, reason: "Conflict not found." }

  await enqueueMutation({
    url: conflict.url,
    method: conflict.method,
    body: conflict.payload,
    headers: {},
  })
  await dismissConflict(conflictId)
  const result = await processOfflineQueue()
  return result
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

async function readApiError(response: Response): Promise<string> {
  try {
    const data = (await response.clone().json()) as { error?: string; message?: string }
    return data.error || data.message || `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

export const OFFLINE_SYNC_COMPLETE_EVENT = "biva-offline-sync-complete"
export const OFFLINE_CACHE_REFRESHED_EVENT = "biva-offline-cache-refreshed"

export type OfflineCacheRefreshResult = {
  refreshed: number
  failed: number
  productDetails: number
}

export type DeltaSyncResult = {
  ok: boolean
  full: boolean
  products: number
  sale_receipts: number
  return_receipts: number
  reason?: string
}

let activeDeltaSync: Promise<DeltaSyncResult> | null = null
let deltaSyncDebounce: ReturnType<typeof setTimeout> | null = null

async function loadSyncCursor(tenantId: string): Promise<SyncCursorState | null> {
  const state = await getCachedData<SyncCursorState>(SYNC_CURSOR_CACHE_KEY)
  if (!state || state.tenantId !== tenantId) return null
  return state
}

async function saveSyncCursor(state: SyncCursorState) {
  await cacheData(SYNC_CURSOR_CACHE_KEY, state)
}

function tenantIdFromSessionUser(user: unknown): string | null {
  if (!user || typeof user !== "object") return null
  const id = (user as { tenant_id?: string }).tenant_id
  return typeof id === "string" && id.trim() ? id.trim() : null
}

/** Debounced delta sync after local mutations — keeps offline cache fresh before disconnect. */
export function scheduleDeltaSync(_reason?: string) {
  if (!isBrowser() || !navigator.onLine) return
  if (deltaSyncDebounce) clearTimeout(deltaSyncDebounce)
  deltaSyncDebounce = setTimeout(() => {
    deltaSyncDebounce = null
    void runDeltaSync()
  }, 400)
}

/** Pull only what changed since the last cursor (full bootstrap when needed). */
export async function runDeltaSync(options?: {
  full?: boolean
}): Promise<DeltaSyncResult> {
  if (!isBrowser() || !navigator.onLine) {
    return {
      ok: false,
      full: false,
      products: 0,
      sale_receipts: 0,
      return_receipts: 0,
      reason: "offline",
    }
  }
  if (activeDeltaSync) return activeDeltaSync
  activeDeltaSync = performDeltaSync(options).finally(() => {
    activeDeltaSync = null
  })
  return activeDeltaSync
}

async function refreshOfflineDataViaIndividualFetches(): Promise<boolean> {
  if (!isBrowser() || !navigator.onLine) return false
  let ok = 0
  for (const key of OFFLINE_DATA_CACHE_KEYS) {
    try {
      await fetchWithOfflineCache(key)
      ok += 1
    } catch {
      // continue — partial cache is better than none
    }
  }
  try {
    await warmDashboardRscCache()
  } catch {
    // ignore
  }
  return ok > 0
}

async function performDeltaSync(options?: { full?: boolean }): Promise<DeltaSyncResult> {
  const empty = {
    ok: false,
    full: false,
    products: 0,
    sale_receipts: 0,
    return_receipts: 0,
  }

  try {
    await fetchWithOfflineCache<SessionBackup>(SESSION_CACHE_KEY)
    const session =
      (await getCachedData<SessionBackup>(SESSION_CACHE_KEY)) ??
      loadSessionBackup()
    const tenantId = tenantIdFromSessionUser(session?.user)
    if (!tenantId) {
      return { ...empty, reason: "no_session" }
    }

    const cursorState = await loadSyncCursor(tenantId)
    const forceFull = options?.full === true
    const syncUrl =
      forceFull || !cursorState
        ? "/api/sync?full=1"
        : `/api/sync?since=${encodeURIComponent(cursorState.cursor)}`

    const res = await fetch(syncUrl, { credentials: "same-origin" })
    if (!res.ok || isOfflineGatewayResponse(res)) {
      const fallbackOk = await refreshOfflineDataViaIndividualFetches()
      return fallbackOk
        ? { ok: true, full: false, products: 0, sale_receipts: 0, return_receipts: 0 }
        : { ...empty, reason: `sync_${res.status}` }
    }

    const payload = (await res.json()) as SyncPayload

    const existingProducts =
      (await getCachedData<{ products: ProductShape[] }>(PRODUCTS_CACHE_KEY))
        ?.products ?? []
    const mergedProducts = mergeProductSync(
      existingProducts,
      payload.products,
      payload.full
    )
    await cacheData(PRODUCTS_CACHE_KEY, { products: mergedProducts })
    await mutate(PRODUCTS_CACHE_KEY, { products: mergedProducts }, { revalidate: false })

    await cacheData(CATEGORIES_CACHE_KEY, { categories: payload.categories })
    await mutate(
      CATEGORIES_CACHE_KEY,
      { categories: payload.categories },
      { revalidate: false }
    )

    const existingSales =
      (await getCachedData<{ receipts: CachedReceipt[] }>(SALE_RECEIPTS_CACHE_KEY))
        ?.receipts ?? []
    let mergedSales = mergeReceiptSync(existingSales, payload.sale_receipts)
    if (payload.full) {
      mergedSales = capReceiptHistory(mergedSales, RECEIPT_HISTORY_CAP)
    }
    await cacheData(SALE_RECEIPTS_CACHE_KEY, { receipts: mergedSales })
    await mutate(SALE_RECEIPTS_CACHE_KEY, { receipts: mergedSales }, { revalidate: false })

    const existingReturns =
      (await getCachedData<{ receipts: CachedReceipt[] }>(RETURN_RECEIPTS_CACHE_KEY))
        ?.receipts ?? []
    let mergedReturns = mergeReceiptSync(existingReturns, payload.return_receipts)
    if (payload.full) {
      mergedReturns = capReceiptHistory(mergedReturns, RECEIPT_HISTORY_CAP)
    }
    await cacheData(RETURN_RECEIPTS_CACHE_KEY, { receipts: mergedReturns })
    await mutate(
      RETURN_RECEIPTS_CACHE_KEY,
      { receipts: mergedReturns },
      { revalidate: false }
    )

    await cacheData(DASHBOARD_STATS_CACHE_KEY, payload.stats)
    await mutate(DASHBOARD_STATS_CACHE_KEY, payload.stats, { revalidate: false })

    await saveSyncCursor({
      tenantId,
      cursor: payload.cursor,
      lastFullSyncAt: payload.full
        ? payload.cursor
        : cursorState?.lastFullSyncAt ?? payload.cursor,
    })

    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(OFFLINE_CACHE_REFRESHED_EVENT, {
          detail: {
            refreshed: OFFLINE_DATA_CACHE_KEYS.length,
            failed: 0,
            productDetails: 0,
            full: payload.full,
            delta: !payload.full,
          },
        })
      )
    }

    return {
      ok: true,
      full: payload.full,
      products: payload.counts.products,
      sale_receipts: payload.counts.sale_receipts,
      return_receipts: payload.counts.return_receipts,
    }
  } catch {
    const fallbackOk = await refreshOfflineDataViaIndividualFetches()
    return fallbackOk
      ? { ok: true, full: false, products: 0, sale_receipts: 0, return_receipts: 0 }
      : { ...empty, reason: "sync_failed" }
  }
}

/** @deprecated Prefer runDeltaSync — kept for callers that expect this shape. */
export async function refreshAllOfflineData(options?: {
  updateSwr?: boolean
  warmRoutes?: boolean
  full?: boolean
}): Promise<OfflineCacheRefreshResult> {
  if (!isBrowser() || !navigator.onLine) {
    return { refreshed: 0, failed: 0, productDetails: 0 }
  }

  const result = await runDeltaSync({ full: options?.full })

  if (options?.warmRoutes !== false) {
    try {
      await warmDashboardRscCache()
    } catch {
      // ignore
    }
  }

  return {
    refreshed: result.ok ? OFFLINE_DATA_CACHE_KEYS.length : 0,
    failed: result.ok ? 0 : 1,
    productDetails: 0,
  }
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
      headers: mergeSyncHeaders(
        { url: input.url, method: input.method, headers: input.headers },
        body
      ),
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

    if (input.url === "/api/day-close" && input.method === "POST") {
      await applyDayCloseCacheResolution(
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

    scheduleDeltaSync("mutation")

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
        headers: mergeSyncHeaders({ ...mutation, url: mappedUrl }, mappedBody),
        credentials: "same-origin",
        body: mappedBody ? JSON.stringify(mappedBody) : undefined,
      })

      if (res.ok || shouldTreatAsSuccess(mutation, res.status)) {
        await deleteFromStore(QUEUE_STORE, mutation.id)
        const receiptMap = await applyBatchReceiptCacheResolution(mutation, res)
        if (receiptMap) Object.assign(tempIdMap, receiptMap)
        await applyPaymentCacheResolution(
          { ...mutation, url: mappedUrl },
          res
        )
        await applyDayCloseCacheResolution({ ...mutation, url: mappedUrl }, res)
        const createdMap = await applyCreateSyncResolution(mutation, res)
        if (createdMap) Object.assign(tempIdMap, createdMap)
        synced += 1
      } else if (isStaleProductMutation({ ...mutation, url: mappedUrl }, res.status)) {
        await deleteFromStore(QUEUE_STORE, mutation.id)
        await runDeltaSync()
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
    await runDeltaSync()
  }
  return result
}
