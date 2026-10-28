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

/**
 * Print the receipt or label that was just mounted on the page.
 * A normal browser tab prints in place. The installed app prints from a
 * hidden frame so Android does not discard the window and show
 * "This page couldn't load" when the print dialog closes.
 */
export function printPreparedDocument(): void {
  // Always print from a hidden frame. Top-level window.print() makes Android
  // Chrome drop the tab and show "This page couldn't load" while offline.
  if (!printInstalledDocument()) window.print()
}

function printInstalledDocument(): boolean {
  const portal =
    document.getElementById('receipt-print-portal') ??
    document.getElementById('product-label-print-portal')
  if (!portal) return false

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const frameDoc = frameWindow?.document
  if (!frameWindow || !frameDoc) {
    iframe.remove()
    return false
  }

  frameDoc.open()
  frameDoc.write('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>')
  frameDoc.close()

  frameDoc.documentElement.className = document.documentElement.className
  const rootStyle = document.documentElement.getAttribute('style')
  if (rootStyle) frameDoc.documentElement.setAttribute('style', rootStyle)
  frameDoc.body.className = document.body.className

  for (const node of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
    frameDoc.head.appendChild(node.cloneNode(true))
  }
  frameDoc.body.appendChild(portal.cloneNode(true))

  let printed = false
  const trigger = () => {
    if (printed) return
    printed = true
    try {
      frameWindow.focus()
      frameWindow.print()
    } catch {
      // Top-level print is what makes Android discard the installed app.
    }
  }

  const links = frameDoc.querySelectorAll('link[rel="stylesheet"]')
  let pending = links.length
  const finished = () => {
    pending -= 1
    if (pending <= 0) trigger()
  }
  links.forEach((link) => {
    link.addEventListener('load', finished)
    link.addEventListener('error', finished)
  })
  if (pending === 0) trigger()
  window.setTimeout(trigger, 700)

  const remove = () => window.setTimeout(() => iframe.remove(), 400)
  frameWindow.addEventListener('afterprint', remove, { once: true })
  window.setTimeout(remove, 60_000)
  return true
}
