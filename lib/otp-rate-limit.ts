import { prisma } from '@/lib/prisma'

const SEND_WINDOW_MS = 60 * 60 * 1000
const MAX_SENDS_PER_WINDOW = 8
const MAX_SENDS_PER_WINDOW_DEV = 20

function maxSendsAllowed() {
  return process.env.NODE_ENV === 'development' ? MAX_SENDS_PER_WINDOW_DEV : MAX_SENDS_PER_WINDOW
}

/** Limit OTP send requests per phone/email per hour (all purposes combined for that identifier). */
export async function checkOtpSendRateLimit(input: {
  phoneE164?: string | null
  email?: string | null
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const since = new Date(Date.now() - SEND_WINDOW_MS)
  const where =
    input.phoneE164 != null
      ? { phoneE164: input.phoneE164, createdAt: { gte: since } }
      : input.email != null
        ? { email: input.email.toLowerCase(), createdAt: { gte: since } }
        : null

  if (!where) {
    return { ok: true }
  }

  const count = await prisma.authOtp.count({ where })
  if (count >= maxSendsAllowed()) {
    return {
      ok: false,
      error: 'Too many code requests. Please wait an hour and try again.',
      status: 429,
    }
  }

  return { ok: true }
}
