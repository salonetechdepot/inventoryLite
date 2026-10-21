'use client'

import { describeLabelSize } from '@/lib/label-settings'
import { printProductLabel, readLabelSize } from '@/lib/product-label-print'
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

/** Manual label print — page sized to the chosen label, with a matching driver hint. */
export function printLabelWithHint(sourceContainer: HTMLElement): boolean {
  const ok = printProductLabel(sourceContainer)
  if (!ok) return ok
  const label = sourceContainer.querySelector('.product-label-print-root')
  const size = label ? describeLabelSize(readLabelSize(label)) : 'your label size'
  toast({
    title: 'Label print settings',
    description: `In the print screen choose paper / label size ${size}, margins None and scale 100%. The label printer must also be set to the same size.`,
    duration: 9000,
  })
  return ok
}
