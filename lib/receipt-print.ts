import {
  attachThermalPrintCleanup,
  prepareThermalClone,
  scheduleThermalPrint,
} from '@/lib/thermal-print'

/** CSS class toggled on `html`/`body` while printing a receipt (see globals.css). */
export const THERMAL_RECEIPT_PRINT_CLASS = 'printing-thermal-receipt'
export const RECEIPT_PRINT_PORTAL_ID = 'receipt-print-portal'

function removeReceiptPrintPortal() {
  document.getElementById(RECEIPT_PRINT_PORTAL_ID)?.remove()
}

function removeOtherPrintPortals() {
  document.getElementById('product-label-print-portal')?.remove()
}

function prepareReceiptClone(source: HTMLElement): HTMLElement {
  return prepareThermalClone(source, { removeSelectors: ['.receipt-no-print'] })
}

/**
 * Open the browser print dialog sized for narrow thermal paper (58mm).
 * Clones `.receipt-print-root` onto `document.body` so dialog layout does not
 * affect print width or leave blank space on the page.
 */
export function printThermalReceipt(sourceContainer?: HTMLElement): boolean {
  if (typeof window === 'undefined') return false

  const source =
    sourceContainer ??
    document.querySelector<HTMLElement>('.receipt-print-root')
  if (!source) return false

  removeReceiptPrintPortal()
  removeOtherPrintPortals()

  const portal = document.createElement('div')
  portal.id = RECEIPT_PRINT_PORTAL_ID
  portal.setAttribute('aria-hidden', 'true')
  portal.appendChild(prepareReceiptClone(source))
  document.body.appendChild(portal)

  const root = document.documentElement
  const body = document.body
  root.classList.add(THERMAL_RECEIPT_PRINT_CLASS)
  body.classList.add(THERMAL_RECEIPT_PRINT_CLASS)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    root.classList.remove(THERMAL_RECEIPT_PRINT_CLASS)
    body.classList.remove(THERMAL_RECEIPT_PRINT_CLASS)
    removeReceiptPrintPortal()
  }

  attachThermalPrintCleanup(cleanup)

  scheduleThermalPrint(() => {
    window.print()
  })

  return true
}
