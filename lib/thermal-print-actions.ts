'use client'

import { printProductLabel } from '@/lib/product-label-print'
import { printThermalReceipt } from '@/lib/receipt-print'
import { THERMAL_PRINT_HINT } from '@/lib/thermal-print'
import { toast } from '@/hooks/use-toast'

function showThermalPrintHint() {
  toast({
    title: THERMAL_PRINT_HINT.title,
    description: THERMAL_PRINT_HINT.description,
    duration: 8000,
  })
}

/** Manual receipt print — opens 58mm portal print and shows driver settings hint. */
export function printReceiptWithHint(sourceContainer?: HTMLElement): boolean {
  const ok = printThermalReceipt(sourceContainer)
  if (ok) showThermalPrintHint()
  return ok
}

/** Manual label print — opens 58mm portal print and shows driver settings hint. */
export function printLabelWithHint(sourceContainer: HTMLElement): boolean {
  const ok = printProductLabel(sourceContainer)
  if (ok) showThermalPrintHint()
  return ok
}
