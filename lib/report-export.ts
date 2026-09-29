import type { AnalyticsPayload } from "@/lib/analytics-types"
import { paymentMethodLabel } from "@/lib/payment-methods"

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function csvEscape(value: string | number): string {
  const str = String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function buildAnalyticsCsv(
  data: AnalyticsPayload,
  businessName?: string | null
): string {
  const lines: string[] = []
  const generated = new Date().toLocaleString("en-GB")
  const shop = businessName?.trim() || "BIVA"

  lines.push(`BIVA Report,${csvEscape(shop)}`)
  lines.push(`Generated,${csvEscape(generated)}`)
  lines.push("")

  lines.push("Summary")
  lines.push("Period,Net sales (NLe),Profit est. (NLe),Line count")
  lines.push(
    `Today,${data.revenue.today.amount},${data.profit.today},${data.revenue.today.transactions}`
  )
  lines.push(
    `This week,${data.revenue.week.amount},${data.profit.week},${data.revenue.week.transactions}`
  )
  lines.push(
    `This month,${data.revenue.month.amount},${data.profit.month},${data.revenue.month.transactions}`
  )
  lines.push(
    `All time,${data.revenue.allTime.amount},${data.profit.allTime},${data.revenue.allTime.transactions}`
  )
  lines.push("")

  if (data.paymentsByMethod?.length) {
    lines.push("Payments this month by method")
    lines.push("Method,Amount (NLe),Count")
    for (const row of data.paymentsByMethod) {
      lines.push(
        `${csvEscape(paymentMethodLabel(row.method))},${row.amount},${row.count}`
      )
    }
    lines.push("")
  }

  lines.push("Inventory")
  lines.push("Metric,Value")
  lines.push(`Products,${data.inventory.totalProducts}`)
  lines.push(`Units in stock,${data.inventory.totalItems}`)
  lines.push(`Retail value (NLe),${data.inventory.totalValue}`)
  lines.push(`Cost value (NLe),${data.inventory.stockCostValue}`)
  lines.push(`Low stock items,${data.inventory.lowStock}`)
  lines.push(`Out of stock items,${data.inventory.outOfStock}`)
  lines.push("")

  lines.push("Top products")
  lines.push("Product,Qty sold,Revenue (NLe),Sale lines")
  for (const p of data.topProducts) {
    lines.push(
      `${csvEscape(p.name)},${p.quantitySold},${p.revenue},${p.saleCount}`
    )
  }
  lines.push("")

  lines.push("Categories")
  lines.push("Category,Products,Units,Value (NLe)")
  for (const c of data.categories) {
    lines.push(
      `${csvEscape(c.name)},${c.productCount},${c.totalQuantity},${c.totalValue}`
    )
  }
  lines.push("")

  lines.push("Daily revenue (last 7 days)")
  lines.push("Date,Transactions,Net revenue (NLe)")
  for (const d of data.dailyRevenue.slice(0, 7)) {
    lines.push(`${d.date},${d.transactions},${d.revenue}`)
  }

  return lines.join("\n")
}

export function downloadAnalyticsCsv(
  data: AnalyticsPayload,
  businessName?: string | null
) {
  const csv = buildAnalyticsCsv(data, businessName)
  const date = new Date().toISOString().slice(0, 10)
  const slug = (businessName || "biva")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  downloadBlob(`${slug}-report-${date}.csv`, csv, "text/csv;charset=utf-8")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function printAnalyticsReport(
  data: AnalyticsPayload,
  businessName?: string | null
): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false

  const shop = escapeHtml(businessName?.trim() || "My shop")
  const generated = escapeHtml(new Date().toLocaleString("en-GB"))

  const paymentRows = (data.paymentsByMethod ?? [])
    .map(
      (p) =>
        `<tr><td>${escapeHtml(paymentMethodLabel(p.method))}</td><td style="text-align:right">NLe ${formatMoney(p.amount)}</td><td style="text-align:right">${p.count}</td></tr>`
    )
    .join("")

  const topRows = data.topProducts
    .slice(0, 10)
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.name)}</td><td style="text-align:right">${p.quantitySold}</td><td style="text-align:right">NLe ${formatMoney(p.revenue)}</td></tr>`
    )
    .join("")

  const dailyRows = data.dailyRevenue
    .slice(0, 7)
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.date)}</td><td style="text-align:right">${d.transactions}</td><td style="text-align:right">NLe ${formatMoney(d.revenue)}</td></tr>`
    )
    .join("")

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${shop} — Report</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #111; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  .meta { color: #555; font-size: 0.875rem; margin-bottom: 20px; }
  h2 { font-size: 0.95rem; margin: 20px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin-bottom: 8px; }
  th, td { padding: 6px 4px; text-align: left; border-bottom: 1px solid #eee; }
  th { font-weight: 600; color: #444; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .tile { border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
  .tile label { display: block; font-size: 0.7rem; text-transform: uppercase; color: #666; }
  .tile strong { font-size: 1.1rem; }
  @media print { body { padding: 12px; } }
</style></head><body>
  <h1>${shop}</h1>
  <p class="meta">BIVA sales report · Generated ${generated}</p>

  <div class="grid">
    <div class="tile"><label>Today (net)</label><strong>NLe ${formatMoney(data.revenue.today.amount)}</strong></div>
    <div class="tile"><label>Today profit est.</label><strong>NLe ${formatMoney(data.profit.today)}</strong></div>
    <div class="tile"><label>This month</label><strong>NLe ${formatMoney(data.revenue.month.amount)}</strong></div>
    <div class="tile"><label>All time</label><strong>NLe ${formatMoney(data.revenue.allTime.amount)}</strong></div>
  </div>

  <h2>Inventory</h2>
  <p>${data.inventory.totalProducts} products · ${data.inventory.totalItems} units · Retail NLe ${formatMoney(data.inventory.totalValue)} · ${data.inventory.lowStock} low stock · ${data.inventory.outOfStock} out of stock</p>

  ${
    paymentRows
      ? `<h2>Payments this month</h2><table><thead><tr><th>Method</th><th style="text-align:right">Amount</th><th style="text-align:right">Count</th></tr></thead><tbody>${paymentRows}</tbody></table>`
      : ""
  }

  <h2>Top products</h2>
  <table><thead><tr><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Revenue</th></tr></thead><tbody>${topRows || "<tr><td colspan=3>No sales yet</td></tr>"}</tbody></table>

  <h2>Last 7 days</h2>
  <table><thead><tr><th>Date</th><th style="text-align:right">Lines</th><th style="text-align:right">Net</th></tr></thead><tbody>${dailyRows || "<tr><td colspan=3>No data</td></tr>"}</tbody></table>
</body></html>`

  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"
  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const frameDoc = frameWindow?.document
  if (!frameWindow || !frameDoc) {
    iframe.remove()
    return false
  }

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 500)
  }

  let printed = false
  const triggerPrint = () => {
    if (printed) return
    printed = true
    try {
      frameWindow.focus()
      frameWindow.print()
    } catch {
      // ignore — some mobile browsers block programmatic print
    } finally {
      cleanup()
    }
  }

  frameDoc.open()
  frameDoc.write(html)
  frameDoc.close()

  iframe.onload = () => window.setTimeout(triggerPrint, 100)
  window.setTimeout(triggerPrint, 300)

  return true
}
