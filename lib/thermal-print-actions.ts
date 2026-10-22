'use client'

import { describeLabelSize } from '@/lib/label-settings'
import {
  printProductLabel,
  readLabelSize,
  type LabelPrintOptions,
} from '@/lib/product-label-print'
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

/** Manual label print — one page per label, sized to the chosen label, with a driver hint. */
export function printLabelWithHint(
  sourceContainer: HTMLElement,
  options: LabelPrintOptions = {}
): boolean {
  const ok = printProductLabel(sourceContainer, options)
  if (!ok) return ok
  const label = sourceContainer.querySelector('.product-label-print-root')
  const size = label ? describeLabelSize(readLabelSize(label)) : 'your label size'
  toast({
    title: 'Label print settings',
    description: `Print screen: paper size ${size}, margins None, scale Default (100%). If labels come out small or two labels feed per print, set the printer's own paper size to ${size} — see "Label printer setup".`,
    duration: 10000,
  })
  return ok
}
