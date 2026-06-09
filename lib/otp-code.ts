import { createHmac, randomInt, timingSafeEqual } from 'crypto'

function otpPepper(): string {
  return process.env.OTP_PEPPER || process.env.JWT_SECRET || 'change-me-in-production'
}

export function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Stable key for OTP storage, e.g. `whatsapp:+232…` or `email:user@example.com` */
export function hashOtpCode(otpKey: string, code: string): string {
  return createHmac('sha256', otpPepper()).update(`${otpKey}:${code}`).digest('hex')
}

export function verifyOtpCode(otpKey: string, code: string, storedHash: string): boolean {
  const computed = hashOtpCode(otpKey, code)
  try {
    const a = Buffer.from(computed, 'hex')
    const b = Buffer.from(storedHash, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
