export type PosSettings = {
  /** Listen for USB/BT scanner keyboard wedge (rapid keys + Enter). */
  hardwareScanner: boolean
  /** Max ms between scanner keystrokes; slower Bluetooth scanners need more. */
  scannerKeyGapMs: number
  /** Print thermal receipt automatically after checkout. */
  autoPrintReceipt: boolean
  /** Keep screen on while on the Sell screen. */
  keepScreenAwake: boolean
  /** Short beep on successful scan. */
  scanBeep: boolean
  /** Land on the Sell screen when the app opens on this device. */
  openOnSell: boolean
}

const STORAGE_KEY = 'biva-pos-settings-v1'

export const POS_SETTINGS_CHANGED = 'biva-pos-settings-changed'

export const SCANNER_SPEEDS = [
  { id: 'fast', label: 'Fast', keyGapMs: 80 },
  { id: 'normal', label: 'Normal', keyGapMs: 150 },
  { id: 'slow', label: 'Slow', keyGapMs: 300 },
] as const

const DEFAULTS: PosSettings = {
  hardwareScanner: true,
  scannerKeyGapMs: SCANNER_SPEEDS[0].keyGapMs,
  autoPrintReceipt: true,
  keepScreenAwake: true,
  scanBeep: true,
  openOnSell: false,
}

export function getPosSettings(): PosSettings {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePosSettings(patch: Partial<PosSettings>): PosSettings {
  const next = { ...getPosSettings(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(POS_SETTINGS_CHANGED, { detail: next }))
  return next
}
