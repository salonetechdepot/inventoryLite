import type { SyncProduct } from '@/lib/sync-types'

export type ReceiptIncoming = {
  id: string
  created_at: string | Date
  [key: string]: unknown
}

/** Upsert server products into cache; on full sync drop removed server rows. */
export function mergeProductSync<
  T extends { id: string; name: string; _isLocalOnly?: boolean },
>(existing: T[], incoming: SyncProduct[], full: boolean): T[] {
  const localOnly = existing.filter((p) => p._isLocalOnly)
  const serverIds = new Set(incoming.map((p) => p.id))

  const base = full
    ? existing.filter((p) => p._isLocalOnly || serverIds.has(p.id))
    : [...existing]

  for (const product of incoming) {
    const idx = base.findIndex((p) => p.id === product.id)
    const row = {
      ...(idx >= 0 ? base[idx] : {}),
      ...product,
      _isLocalOnly: false,
    } as unknown as T
    if (idx >= 0) {
      if (base[idx]._isLocalOnly) continue
      base[idx] = row
    } else {
      base.push(row)
    }
  }

  const mergedIds = new Set(base.map((p) => p.id))
  for (const local of localOnly) {
    if (!mergedIds.has(local.id)) {
      base.push(local)
      mergedIds.add(local.id)
    }
  }

  return base.sort((a, b) => a.name.localeCompare(b.name))
}

/** Upsert receipts by id; preserve unsynced local receipts. */
export function mergeReceiptSync<
  T extends { id: string; created_at: string | Date; _isLocalOnly?: boolean },
>(existing: T[], incoming: ReceiptIncoming[]): T[] {
  const next = [...existing]

  for (const receipt of incoming) {
    const idx = next.findIndex((r) => r.id === receipt.id)
    const row = {
      ...(idx >= 0 ? next[idx] : {}),
      ...receipt,
      _isLocalOnly: false,
    } as unknown as T
    if (idx >= 0) {
      if (next[idx]._isLocalOnly && !String(receipt.id).startsWith('local-')) {
        next[idx] = row
      } else if (!next[idx]._isLocalOnly) {
        next[idx] = row
      }
    } else {
      next.push(row)
    }
  }

  return next.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

/** On full sync, cap history size while keeping local-only rows. */
export function capReceiptHistory<
  T extends { id: string; created_at: string | Date; _isLocalOnly?: boolean },
>(receipts: T[], maxCount: number): T[] {
  const localOnly = receipts.filter((r) => r._isLocalOnly)
  const server = receipts.filter((r) => !r._isLocalOnly)
  const trimmed = server.slice(0, maxCount)
  const ids = new Set(trimmed.map((r) => r.id))
  const extraLocal = localOnly.filter((r) => !ids.has(r.id))
  return [...extraLocal, ...trimmed].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export const RECEIPT_HISTORY_CAP = 500
