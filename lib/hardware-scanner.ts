/** Default max ms between keystrokes to treat input as a scanner wedge burst. */
export const DEFAULT_MAX_KEY_GAP_MS = 80
const MIN_SCAN_LENGTH = 2
/** Bursts typed into other form fields must be longer before they count as a scan. */
const MIN_FIELD_SCAN_LENGTH = 4
const MAX_SCAN_LENGTH = 128
/** The Enter/Tab suffix must follow the last character about as fast as the characters. */
const TERMINATOR_GAP_FACTOR = 4
const FILL_INPUT_TYPES = new Set(['insertText', 'insertFromPaste', 'insertReplacementText'])
const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'range',
  'color',
])

type TextField = HTMLInputElement | HTMLTextAreaElement

/**
 * free    — no text field focused; capture freely.
 * allowed — the search box that may receive scans.
 * field   — another text field (e.g. cash tendered); only clear scanner bursts count.
 * ignore  — selects / rich editors.
 */
type TargetKind = 'free' | 'allowed' | 'field' | 'ignore'

export type ScanSource = Exclude<TargetKind, 'ignore'>

function classifyTarget(
  target: EventTarget | null,
  allowed: HTMLInputElement | null
): { kind: TargetKind; field: TextField | null } {
  if (!(target instanceof HTMLElement)) return { kind: 'free', field: null }
  if (target.isContentEditable || target.tagName === 'SELECT') {
    return { kind: 'ignore', field: null }
  }
  if (target instanceof HTMLTextAreaElement) return { kind: 'field', field: target }
  if (target instanceof HTMLInputElement) {
    if (NON_TEXT_INPUT_TYPES.has(target.type)) return { kind: 'free', field: null }
    if (allowed && target === allowed) return { kind: 'allowed', field: target }
    return { kind: 'field', field: target }
  }
  return { kind: 'free', field: null }
}

/** Set a React-controlled field's value and let React see the change. */
function setFieldValue(field: TextField, value: string) {
  const proto =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

export type ScanDiagnostics = {
  code: string
  /** keys: typed character by character; fill: whole code inserted at once. */
  method: 'keys' | 'fill'
  terminator: 'Enter' | 'Tab' | null
  avgGapMs: number | null
  maxGapMs: number | null
  /** Whether the scan was passed to onScan and handled. */
  accepted: boolean
}

export type HardwareScannerOptions = {
  enabled: boolean
  paused?: boolean
  /** Search input may receive wedge text directly; other inputs only accept clear scanner bursts. */
  allowedInputRef?: { current: HTMLInputElement | null }
  maxKeyGapMs?: number
  /** Return false to leave the keystrokes to the focused field (not treated as a scan). */
  onScan: (code: string, source: ScanSource) => boolean | void
  /** Reports scanner-like bursts, including ones that were not accepted (scanner test). */
  onDiagnostics?: (info: ScanDiagnostics) => void
}

/**
 * Capture keyboard-wedge barcode scans (rapid keystrokes ending with Enter or Tab),
 * plus scanners that insert the whole code into the search box at once.
 */
export function attachHardwareScanner(options: HardwareScannerOptions): () => void {
  let buffer = ''
  let lastKeyAt = 0
  let gaps: number[] = []
  let burstField: TextField | null = null
  let valueBefore = ''
  let silenceTimer: number | undefined

  const maxGap = () => options.maxKeyGapMs ?? DEFAULT_MAX_KEY_GAP_MS

  const reset = () => {
    buffer = ''
    lastKeyAt = 0
    gaps = []
    burstField = null
    valueBefore = ''
    window.clearTimeout(silenceTimer)
  }

  const describeBurst = (terminator: ScanDiagnostics['terminator']) => ({
    code: buffer.trim(),
    method: 'keys' as const,
    terminator,
    avgGapMs: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    maxGapMs: gaps.length ? Math.max(...gaps) : null,
  })

  // A fast burst with no Enter/Tab after it: report it so the test screen can explain.
  const scheduleSilenceReport = () => {
    window.clearTimeout(silenceTimer)
    silenceTimer = window.setTimeout(() => {
      if (buffer.trim().length >= MIN_FIELD_SCAN_LENGTH) {
        options.onDiagnostics?.({ ...describeBurst(null), accepted: false })
      }
      reset()
    }, maxGap() * TERMINATOR_GAP_FACTOR)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!options.enabled || options.paused) return
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const { kind, field } = classifyTarget(
      event.target,
      options.allowedInputRef?.current ?? null
    )
    if (kind === 'ignore') {
      reset()
      return
    }

    const now = Date.now()

    if (event.key === 'Enter' || event.key === 'Tab') {
      if (!buffer) return
      const info = describeBurst(event.key)
      const quick = now - lastKeyAt <= maxGap() * TERMINATOR_GAP_FACTOR
      const minLength = kind === 'field' ? MIN_FIELD_SCAN_LENGTH : MIN_SCAN_LENGTH
      const sameField = field === burstField
      const fieldToRestore = burstField
      const restoreValue = valueBefore
      reset()

      if (!quick || !sameField || info.code.length < minLength) {
        if (info.code.length >= MIN_FIELD_SCAN_LENGTH) {
          options.onDiagnostics?.({ ...info, accepted: false })
        }
        return
      }

      const handled = options.onScan(info.code, kind) !== false
      options.onDiagnostics?.({ ...info, accepted: handled })
      if (!handled) return

      event.preventDefault()
      event.stopPropagation()
      if (fieldToRestore?.isConnected) setFieldValue(fieldToRestore, restoreValue)
      return
    }

    if (event.key.length !== 1) return
    if (event.repeat) {
      reset()
      return
    }

    if (buffer.length > 0 && (now - lastKeyAt > maxGap() || field !== burstField)) {
      reset()
    }

    if (buffer.length === 0) {
      burstField = field
      valueBefore = field?.value ?? ''
    } else {
      gaps.push(now - lastKeyAt)
    }

    lastKeyAt = now
    buffer += event.key

    if (buffer.length > MAX_SCAN_LENGTH) {
      reset()
      return
    }
    scheduleSilenceReport()
  }

  const onInput = (event: Event) => {
    if (!options.enabled || options.paused) return
    const allowed = options.allowedInputRef?.current
    // Only when the on-screen keyboard is hidden — then a multi-character insert is a scanner.
    if (!allowed || event.target !== allowed || allowed.inputMode !== 'none') return

    const inputEvent = event as InputEvent
    if (!FILL_INPUT_TYPES.has(inputEvent.inputType)) return
    const data = inputEvent.data ?? ''
    const code = data.trim()
    if (code.length < MIN_FIELD_SCAN_LENGTH) return

    reset()
    const handled = options.onScan(code, 'allowed') !== false
    options.onDiagnostics?.({
      code,
      method: 'fill',
      terminator: null,
      avgGapMs: null,
      maxGapMs: null,
      accepted: handled,
    })
    if (handled) setFieldValue(allowed, allowed.value.replace(data, ''))
  }

  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('input', onInput, true)
  return () => {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('input', onInput, true)
    reset()
  }
}
