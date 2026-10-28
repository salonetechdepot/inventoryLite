import Dexie, { type Table } from "dexie"

/**
 * On-device database (IndexedDB via Dexie). It is the source of truth for the
 * UI: screens read from here first and the server copy is merged in by sync.
 *
 * Same database the hand-written IndexedDB code created (native version 1 =
 * Dexie version 0.1), so data already on phones — including unsent sales in
 * `queue` — is kept when this code first opens it.
 */
export const LOCAL_DB_NAME = "biva-offline-db"

export const PRODUCTS_CACHE_KEY = "/api/products"
export const SALE_RECEIPTS_CACHE_KEY = "/api/receipts?type=sale&limit=500&status=all"
export const RETURN_RECEIPTS_CACHE_KEY = "/api/receipts?type=return&limit=500&status=all"

type ListTableName = "products" | "saleReceipts" | "returnReceipts"

/** Lists stored one row per record; SWR still sees them as `{ products }` / `{ receipts }`. */
const LIST_TABLES: Record<string, { table: ListTableName; field: "products" | "receipts" }> = {
  [PRODUCTS_CACHE_KEY]: { table: "products", field: "products" },
  [SALE_RECEIPTS_CACHE_KEY]: { table: "saleReceipts", field: "receipts" },
  [RETURN_RECEIPTS_CACHE_KEY]: { table: "returnReceipts", field: "receipts" },
}

export interface CachedRecord {
  key: string
  data: unknown
  updatedAt: number
}

/** A list row plus its position, so lists come back in the order they were saved. */
type ListRow = Record<string, unknown> & { id: string; _seq: number }

/** Stored in `cache` for a list key: says the list has been saved (even when empty). */
type ListMarker = { __listTable: ListTableName }

class BivaLocalDb extends Dexie {
  cache!: Table<CachedRecord, string>
  queue!: Table<{ id: string; createdAt: number; tenantId?: string | null }, string>
  conflicts!: Table<{ id: string; createdAt: number }, string>
  products!: Table<ListRow, string>
  saleReceipts!: Table<ListRow, string>
  returnReceipts!: Table<ListRow, string>

  constructor() {
    super(LOCAL_DB_NAME)
    this.version(0.1).stores({ cache: "key", queue: "id", conflicts: "id" })
    this.version(1)
      .stores({
        cache: "key",
        queue: "id, createdAt, tenantId",
        conflicts: "id, createdAt",
        products: "id, _seq",
        saleReceipts: "id, _seq",
        returnReceipts: "id, _seq",
      })
      .upgrade(async (tx) => {
        // Move each list out of its single JSON record into its own table.
        const cache = tx.table<CachedRecord, string>("cache")
        for (const [key, spec] of Object.entries(LIST_TABLES)) {
          const record = await cache.get(key)
          if (!record) continue
          const rows = (record.data as Record<string, unknown> | null)?.[spec.field]
          if (!Array.isArray(rows)) continue
          await tx.table<ListRow, string>(spec.table).bulkPut(toListRows(rows))
          await cache.put({
            key,
            data: { __listTable: spec.table } satisfies ListMarker,
            updatedAt: record.updatedAt,
          })
        }
      })
  }
}

function toListRows(rows: unknown[]): ListRow[] {
  const out: ListRow[] = []
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") return
    const id = (row as { id?: unknown }).id
    if (typeof id !== "string" || !id) return
    out.push({ ...(row as Record<string, unknown>), id, _seq: index })
  })
  return out
}

function fromListRow(row: ListRow): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...row }
  delete rest._seq
  return rest
}

let instance: BivaLocalDb | null = null

export function localDb(): BivaLocalDb {
  if (!instance) instance = new BivaLocalDb()
  return instance
}

function isListMarker(data: unknown): data is ListMarker {
  return Boolean(data && typeof data === "object" && "__listTable" in data)
}

export async function readCached<T>(key: string): Promise<{ data: T; updatedAt: number } | null> {
  const db = localDb()
  const spec = LIST_TABLES[key]
  if (!spec) {
    const record = await db.cache.get(key)
    return record ? { data: record.data as T, updatedAt: record.updatedAt } : null
  }
  return db.transaction("r", db.cache, db[spec.table], async () => {
    const marker = await db.cache.get(key)
    if (!marker || !isListMarker(marker.data)) return null
    const rows = await db[spec.table].orderBy("_seq").toArray()
    return {
      data: { [spec.field]: rows.map(fromListRow) } as T,
      updatedAt: marker.updatedAt,
    }
  })
}

export async function writeCached(key: string, data: unknown) {
  const db = localDb()
  const updatedAt = Date.now()
  const spec = LIST_TABLES[key]
  const rows = spec ? (data as Record<string, unknown> | null)?.[spec.field] : undefined
  if (!spec || !Array.isArray(rows)) {
    await db.cache.put({ key, data, updatedAt })
    return
  }
  await db.transaction("rw", db.cache, db[spec.table], async () => {
    await db[spec.table].clear()
    await db[spec.table].bulkPut(toListRows(rows))
    await db.cache.put({ key, data: { __listTable: spec.table } satisfies ListMarker, updatedAt })
  })
}

export async function deleteCached(key: string) {
  const db = localDb()
  const spec = LIST_TABLES[key]
  if (!spec) {
    await db.cache.delete(key)
    return
  }
  await db.transaction("rw", db.cache, db[spec.table], async () => {
    await db[spec.table].clear()
    await db.cache.delete(key)
  })
}
