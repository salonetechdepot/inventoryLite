import { prisma } from '@/lib/prisma'
import { normalizeEmail, otpKeyForEmail } from '@/lib/email-normalize'
import { sendEmailOtp } from '@/lib/resend-email'
import { generateSixDigitCode, hashOtpCode, verifyOtpCode } from '@/lib/otp-code'
import { checkOtpSendRateLimit } from '@/lib/otp-rate-limit'
import {
  createSession,
  isSyntheticPhoneEmail,
  registerUserWithVerifiedEmail,
  type User,
} from '@/lib/auth'

const OTP_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 55 * 1000
const MAX_OTP_ATTEMPTS = 5
type Purpose = 'login' | 'register'

type PendingRegister = { businessName: string }

function parsePending(data: unknown): PendingRegister | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const businessName = typeof o.businessName === 'string' ? o.businessName.trim() : ''
  if (!businessName) return null
  return { businessName }
}

export async function sendAuthEmailOtp(input: {
  rawEmail: string
  purpose: Purpose
  businessName?: string
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const parsed = normalizeEmail(input.rawEmail)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 }
  }
  const { email } = parsed

  if (isSyntheticPhoneEmail(email)) {
    return {
      ok: false,
      error: 'This account uses WhatsApp sign-in. Switch to the WhatsApp tab.',
      status: 400,
    }
  }

  if (input.purpose === 'login') {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (!user) {
      return {
        ok: false,
        error: 'No account for this email. Register first or check the address.',
        status: 404,
      }
    }
  } else {
    if (!input.businessName?.trim()) {
      return { ok: false, error: 'Business name is required', status: 400 }
    }
    const taken = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (taken) {
      return { ok: false, error: 'This email is already registered. Sign in instead.', status: 409 }
    }
  }

  const hourlyLimit = await checkOtpSendRateLimit({ email })
  if (!hourlyLimit.ok) {
    return { ok: false, error: hourlyLimit.error, status: hourlyLimit.status }
  }

  const latest = await prisma.authOtp.findFirst({
    where: { email, purpose: input.purpose },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  } as Parameters<typeof prisma.authOtp.findFirst>[0])
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil(
      (RESEND_COOLDOWN_MS - (Date.now() - latest.createdAt.getTime())) / 1000
    )
    return {
      ok: false,
      error: `Please wait ${waitSec}s before requesting another code.`,
      status: 429,
    }
  }

  await prisma.authOtp.deleteMany({
    where: { email, purpose: input.purpose },
  } as Parameters<typeof prisma.authOtp.deleteMany>[0])

  const code = generateSixDigitCode()
  const otpKey = otpKeyForEmail(email)
  const codeHash = hashOtpCode(otpKey, code)

  const pendingJson =
    input.purpose === 'register' && input.businessName
      ? { businessName: input.businessName.trim() }
      : undefined

  const sent = await sendEmailOtp(email, code)
  if (!sent.ok) {
    return { ok: false, error: sent.error, status: 502 }
  }

  await prisma.authOtp.create({
    data: {
      email,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      purpose: input.purpose,
      pendingJson: pendingJson ?? undefined,
    },
  } as unknown as Parameters<typeof prisma.authOtp.create>[0])

  return { ok: true }
}

export async function verifyAuthEmailOtp(input: {
  rawEmail: string
  purpose: Purpose
  code: string
}): Promise<
  | { ok: true; user: User }
  | { ok: false; error: string; status: number }
> {
  const parsed = normalizeEmail(input.rawEmail)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 }
  }
  const { email } = parsed
  const otpKey = otpKeyForEmail(email)
  const trimmedCode = input.code.replace(/\D/g, '')
  if (trimmedCode.length !== 6) {
    return { ok: false, error: 'Enter the 6-digit code from your email', status: 400 }
  }

  const row = await prisma.authOtp.findFirst({
    where: {
      email,
      purpose: input.purpose,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  } as Parameters<typeof prisma.authOtp.findFirst>[0])

  if (!row) {
    return { ok: false, error: 'Code expired or not found. Request a new one.', status: 400 }
  }

  if (row.attempts >= MAX_OTP_ATTEMPTS) {
    await prisma.authOtp.delete({ where: { id: row.id } })
    return { ok: false, error: 'Too many attempts. Request a new code.', status: 400 }
  }

  if (!verifyOtpCode(otpKey, trimmedCode, row.codeHash)) {
    await prisma.authOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    })
    return { ok: false, error: 'Invalid code', status: 400 }
  }

  const pending =
    input.purpose === 'register' ? parsePending(row.pendingJson) : null

  await prisma.authOtp.delete({ where: { id: row.id } })

  if (input.purpose === 'login') {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        phoneE164: true,
        businessName: true,
        themeColor: true,
        shopLogoUrl: true,
        createdAt: true,
      },
    })
    if (!user) {
      return { ok: false, error: 'Account not found', status: 404 }
    }
    const u: User = {
      id: user.id,
      email: user.email,
      phone_e164: user.phoneE164,
      business_name: user.businessName,
      theme_color: user.themeColor,
      shop_logo_url: user.shopLogoUrl,
      created_at: user.createdAt ?? new Date(),
    }
    await createSession(u)
    return { ok: true, user: u }
  }

  if (!pending) {
    return { ok: false, error: 'Registration data missing. Start again.', status: 400 }
  }

  const reg = await registerUserWithVerifiedEmail(email, pending.businessName)
  if (!reg.success || !reg.user) {
    return { ok: false, error: reg.error || 'Registration failed', status: 400 }
  }
  await createSession(reg.user)
  return { ok: true, user: reg.user }
}
