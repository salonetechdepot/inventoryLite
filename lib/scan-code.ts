/** Characters safe for Code 128 and most POS scanners. */
export const SCAN_CODE_PATTERN = /^[A-Za-z0-9\-_.]+$/

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

/**
 * GS1 "restricted circulation" prefix: EAN-13 numbers starting with 20 are reserved
 * for in-store use, so they never clash with manufacturer barcodes.
 */
const IN_STORE_EAN_PREFIX = "20"

function randomDigits(length: number): string {
  const values = new Uint32Array(length)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values)
  } else {
    for (let i = 0; i < length; i++) values[i] = Math.floor(Math.random() * 10)
  }
  return Array.from(values, (v) => String(v % 10)).join("")
}

export function ean13CheckDigit(first12: string): string {
  const sum = first12
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return String((10 - (sum % 10)) % 10)
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === code[12]
}

/** Offline-safe 13-digit in-store EAN code — only the string is stored in the DB. */
export function generateScanCode(existingCodes: string[] = []): string {
  const existing = new Set(existingCodes.map((c) => c.trim().toLowerCase()).filter(Boolean))

  let code = ""
  for (let attempt = 0; attempt < 16; attempt++) {
    const first12 = `${IN_STORE_EAN_PREFIX}${randomDigits(10)}`
    code = `${first12}${ean13CheckDigit(first12)}`
    if (!existing.has(code)) return code
  }
  return code
}

export function formatLabelPrice(amount: number | string | undefined): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return "0"
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}
