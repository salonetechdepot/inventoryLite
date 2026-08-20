/** Characters safe for Code 128 and most POS scanners. */
export const SCAN_CODE_PATTERN = /^[A-Za-z0-9\-_.]+$/

export type ScanCodeDisplayMode = "barcode" | "qr"

export function isValidScanCode(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 255) return false
  return SCAN_CODE_PATTERN.test(trimmed)
}

/** Shared API/form validation message. */
export function scanCodeValidationError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > 255) return "Scan code must be 255 characters or less."
  if (!SCAN_CODE_PATTERN.test(trimmed)) {
    return "Scan code may only use letters, numbers, hyphen, underscore, or dot."
  }
  return null
}

export function normalizeScanCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const err = scanCodeValidationError(trimmed)
  if (err) return null
  return trimmed
}

function randomSuffix(length = 10): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, length).toUpperCase()
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, length)
    .toUpperCase()
}

/** Offline-safe internal scan code — only the string is stored in the DB. */
export function generateScanCode(existingCodes: string[] = []): string {
  const existing = new Set(existingCodes.map((c) => c.trim().toLowerCase()).filter(Boolean))

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `SE-${randomSuffix()}`.slice(0, 64)
    if (!existing.has(code.toLowerCase())) return code
  }

  return `SE-${randomSuffix(12)}`.slice(0, 64)
}

export function formatLabelPrice(amount: number | string | undefined): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return "0"
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}
