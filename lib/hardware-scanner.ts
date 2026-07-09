/** Max ms between keystrokes to treat input as a scanner wedge burst. */
const MAX_KEY_GAP_MS = 80
const MIN_SCAN_LENGTH = 2
const MAX_SCAN_LENGTH = 128

function isTypingTarget(
  target: EventTarget | null,
  allowedInputRef?: { current: HTMLInputElement | null }
) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.tagName === 'TEXTAREA') return true
  if (target.tagName === 'SELECT') return true
  if (target.tagName === 'INPUT') {
    const input = target as HTMLInputElement
    const allowed = allowedInputRef?.current
    if (allowed && input === allowed) return false
    const type = input.type
    if (type === 'checkbox' || type === 'radio' || type === 'button') return false
    return true
  }
  return false
}

export type HardwareScannerOptions = {
  enabled: boolean
  paused?: boolean
  /** Search input may receive wedge text directly; other inputs pause capture. */
  allowedInputRef?: { current: HTMLInputElement | null }
  onScan: (code: string) => void
}

/**
 * Capture keyboard-wedge barcode scans (rapid keystrokes ending with Enter).
 * Ignores normal typing in form fields except the optional allowed search input.
 */
export function attachHardwareScanner(options: HardwareScannerOptions): () => void {
  let buffer = ''
  let lastKeyAt = 0

  const reset = () => {
    buffer = ''
    lastKeyAt = 0
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!options.enabled || options.paused) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (isTypingTarget(event.target, options.allowedInputRef)) return

    const now = Date.now()

    if (event.key === 'Enter') {
      const code = buffer.trim()
      reset()
      if (code.length >= MIN_SCAN_LENGTH) {
        event.preventDefault()
        options.onScan(code)
      }
      return
    }

    if (event.key.length !== 1) return

    if (buffer.length > 0 && now - lastKeyAt > MAX_KEY_GAP_MS) {
      buffer = ''
    }

    lastKeyAt = now
    buffer += event.key

    if (buffer.length > MAX_SCAN_LENGTH) {
      reset()
    }
  }

  window.addEventListener('keydown', onKeyDown, true)
  return () => {
    window.removeEventListener('keydown', onKeyDown, true)
    reset()
  }
}
