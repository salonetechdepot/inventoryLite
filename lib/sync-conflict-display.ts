import type { SyncConflict } from "@/lib/offline-sync"
import { paymentMethodLabel } from "@/lib/payment-methods"

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null
  return payload as Record<string, unknown>
}

function cartItemCount(payload: Record<string, unknown> | null): number {
  const items = payload?.items
  return Array.isArray(items) ? items.length : 0
}

/** Human-readable title for a queued mutation that failed to sync. */
export function describeSyncConflict(conflict: SyncConflict): {
  title: string
  detail: string
} {
  const payload = payloadRecord(conflict.payload)
  const url = conflict.url

  if (url === "/api/sales/batch" && conflict.method === "POST") {
    const type = payload?.type === "return" ? "Return" : "Sale"
    const count = cartItemCount(payload)
    const paid = Number(payload?.amountPaid ?? 0)
    const method = paymentMethodLabel(
      typeof payload?.paymentMethod === "string" ? payload.paymentMethod : "cash"
    )
    return {
      title: `${type} checkout (${count} item${count === 1 ? "" : "s"})`,
      detail:
        paid > 0
          ? `NLe ${paid.toLocaleString("en-SL")} via ${method}`
          : "No payment recorded on this checkout",
    }
  }

  const productMatch = url.match(/^\/api\/products\/([^/]+)$/)
  if (productMatch && conflict.method === "PATCH") {
    const name = typeof payload?.name === "string" ? payload.name : "Product"
    return {
      title: `Product update: ${name}`,
      detail: "Changes could not be saved on the server.",
    }
  }

  if (productMatch && conflict.method === "DELETE") {
    return {
      title: "Product delete",
      detail: "This product could not be removed on the server.",
    }
  }

  const adjustMatch = url.match(/^\/api\/products\/([^/]+)\/adjust$/)
  if (adjustMatch && conflict.method === "POST") {
    const adj = Number(payload?.adjustment ?? 0)
    const sign = adj >= 0 ? "+" : ""
    return {
      title: "Stock adjustment",
      detail: `Quantity change ${sign}${adj} was rejected.`,
    }
  }

  if (url === "/api/products" && conflict.method === "POST") {
    const name = typeof payload?.name === "string" ? payload.name : "New product"
    return {
      title: `New product: ${name}`,
      detail: "Product could not be created on the server.",
    }
  }

  const paymentMatch = url.match(/^\/api\/receipts\/([^/]+)\/payments$/)
  if (paymentMatch && conflict.method === "POST") {
    const amount = Number(payload?.amount ?? 0)
    const method = paymentMethodLabel(
      typeof payload?.method === "string" ? payload.method : "cash"
    )
    return {
      title: "Payment recording",
      detail: `NLe ${amount.toLocaleString("en-SL")} via ${method}`,
    }
  }

  return {
    title: `${conflict.method} ${url}`,
    detail: conflict.reason,
  }
}

export function formatConflictTime(createdAt: number): string {
  return new Date(createdAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}
