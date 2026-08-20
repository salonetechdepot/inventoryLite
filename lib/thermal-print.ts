/** Shown once when opening the browser print dialog for 58mm thermal output. */
export const THERMAL_PRINT_HINT = {
  title: '58mm print settings',
  description:
    'Set paper to 58mm (or Receipt), margins to None, turn off headers & footers, and use 100% scale — not “Fit to page”.',
} as const

/** Tailwind / UI classes stripped from clones so print is plain thermal text. */
const SCREEN_ONLY_CLASSES = [
  'rounded-lg',
  'rounded-md',
  'rounded-full',
  'rounded-xs',
  'border',
  'shadow-lg',
  'shadow',
  'bg-white',
  'bg-background',
  'bg-muted/30',
  'bg-muted/50',
  'bg-primary/5',
  'bg-primary/10',
  'bg-warning/10',
  'gap-1.5',
  'gap-4',
  'p-2',
  'p-4',
  'p-6',
  'px-3',
  'py-2',
  'overflow-hidden',
  'line-clamp-2',
  'truncate',
] as const

function stripScreenClasses(el: HTMLElement) {
  for (const cls of SCREEN_ONLY_CLASSES) {
    el.classList.remove(cls)
  }
  // Drop responsive colour utilities that print as blue/gray on thermal.
  el.classList.forEach((name) => {
    if (
      name.startsWith('text-primary') ||
      name.startsWith('text-muted') ||
      name.startsWith('text-warning') ||
      name.startsWith('text-destructive') ||
      name.startsWith('bg-primary') ||
      name.startsWith('bg-muted') ||
      name.startsWith('bg-warning')
    ) {
      el.classList.remove(name)
    }
  })
}

/**
 * Deep-clone a printable node and remove screen-only subtrees / decorative classes.
 */
export function prepareThermalClone(
  source: Element,
  options?: { removeSelectors?: string[] }
): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement
  for (const selector of options?.removeSelectors ?? []) {
    clone.querySelectorAll(selector).forEach((el) => el.remove())
  }
  stripScreenClasses(clone)
  clone.querySelectorAll<HTMLElement>('*').forEach(stripScreenClasses)
  return clone
}

/**
 * Wait for portal DOM + print CSS to apply before opening the print dialog.
 */
export function scheduleThermalPrint(printFn: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(printFn)
  })
}

export function attachThermalPrintCleanup(
  cleanup: () => void,
  timeoutMs = 5_000
): void {
  window.addEventListener('afterprint', cleanup, { once: true })
  window.setTimeout(cleanup, timeoutMs)
}
