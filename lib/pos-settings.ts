export type PosSettings = {
  /** Listen for USB/BT scanner keyboard wedge (rapid keys + Enter). */
  hardwareScanner: boolean
  /** Print thermal receipt automatically after checkout. */
  autoPrintReceipt: boolean
  /** Keep screen on while on the Sell screen. */
  keepScreenAwake: boolean
  /** Short beep on successful scan. */
  scanBeep: boolean
}

const STORAGE_KEY = 'biva-pos-settings-v1'

export const POS_SETTINGS_CHANGED = 'biva-pos-settings-changed'

const DEFAULTS: PosSettings = {
  hardwareScanner: true,
  autoPrintReceipt: true,
  keepScreenAwake: true,
  scanBeep: true,
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
