/**
 * Normalize Sierra Leone mobile numbers to E.164 (+232 + 8-digit national number).
 * Accepts common local formats: 07XXXXXXXX, 7XXXXXXXX, +2327XXXXXXXX, 2327XXXXXXXX
 */
export function parseSierraLeoneToE164(raw: string):
  | { ok: true; e164: string; digits: string }
  | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'Enter your phone number' }
  }

  const digitsOnly = trimmed.replace(/\D/g, '')

  let national: string
  if (digitsOnly.startsWith('232') && digitsOnly.length === 11) {
    national = digitsOnly.slice(3)
  } else if (digitsOnly.startsWith('0') && digitsOnly.length === 9) {
    national = digitsOnly.slice(1)
  } else if (digitsOnly.length === 8) {
    national = digitsOnly
  } else {
    return {
      ok: false,
      error: 'Use a Sierra Leone mobile number (8 digits after 232), e.g. 07X XXX XXX',
    }
  }

  if (!/^[0-9]{8}$/.test(national)) {
    return { ok: false, error: 'Invalid number length for Sierra Leone' }
  }

  const e164 = `+232${national}`
  const digits = `232${national}`
  return { ok: true, e164, digits }
}
