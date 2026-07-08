/** CSS class toggled on `body` while printing a receipt (see globals.css). */
export const THERMAL_RECEIPT_PRINT_CLASS = 'printing-thermal-receipt'

/**
 * Open the browser print dialog sized for narrow thermal paper (58mm).
 * Hides the rest of the app so only `.receipt-print-root` is printed.
 */
export function printThermalReceipt(): void {
  if (typeof window === 'undefined') return

  const body = document.body
  body.classList.add(THERMAL_RECEIPT_PRINT_CLASS)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    body.classList.remove(THERMAL_RECEIPT_PRINT_CLASS)
  }

  window.addEventListener('afterprint', cleanup, { once: true })
  window.setTimeout(cleanup, 5_000)

  window.print()
}
