import { parseSierraLeoneToE164 } from '@/lib/phone-sierra-leone'

/** Normalize login identity so send + confirm hit the same OTP key on the API. */
export function normalizeLoginIdentity(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'Enter your email or phone number' }
  }

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Enter a valid email address' }
    }
    return { ok: true, value: email }
  }

  const parsed = parseSierraLeoneToE164(trimmed)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error }
  }
  return { ok: true, value: parsed.e164 }
}

export function normalizeOtpCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6)
}
