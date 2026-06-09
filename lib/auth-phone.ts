import { prisma } from '@/lib/prisma'
import { parseSierraLeoneToE164 } from '@/lib/phone-sierra-leone'
import { sendWhatsAppOtpTemplate } from '@/lib/whatsapp-meta'
import { generateSixDigitCode, hashOtpCode, verifyOtpCode } from '@/lib/otp-code'
import { checkOtpSendRateLimit } from '@/lib/otp-rate-limit'
import {
  createSession,
  registerUserWithVerifiedPhone,
  type User,
} from '@/lib/auth'

const OTP_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 55 * 1000
const MAX_OTP_ATTEMPTS = 5
type Purpose = 'login' | 'register'

type PendingRegister = { businessName: string }

function otpKeyForPhone(e164: string): string {
  return `whatsapp:${e164}`
}

function parsePending(data: unknown): PendingRegister | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const businessName = typeof o.businessName === 'string' ? o.businessName.trim() : ''
  if (!businessName) return null
  return { businessName }
}

export async function sendAuthPhoneOtp(input: {
  rawPhone: string
  purpose: Purpose
  businessName?: string
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const parsed = parseSierraLeoneToE164(input.rawPhone)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 }
  }
  const { e164, digits } = parsed

  if (input.purpose === 'login') {
    const user = await prisma.user.findUnique({
      where: { phoneE164: e164 },
      select: { id: true },
    })
    if (!user) {
      return {
        ok: false,
        error: 'No account for this number. Register first or check the number.',
        status: 404,
      }
    }
  } else {
    if (!input.businessName?.trim()) {
      return { ok: false, error: 'Business name is required', status: 400 }
    }
    const taken = await prisma.user.findUnique({
      where: { phoneE164: e164 },
      select: { id: true },
    })
    if (taken) {
      return { ok: false, error: 'This number is already registered. Sign in instead.', status: 409 }
    }
  }

  const hourlyLimit = await checkOtpSendRateLimit({ phoneE164: e164 })
  if (!hourlyLimit.ok) {
    return { ok: false, error: hourlyLimit.error, status: hourlyLimit.status }
  }

  const latest = await prisma.authOtp.findFirst({
    where: { phoneE164: e164, purpose: input.purpose },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
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
    where: { phoneE164: e164, purpose: input.purpose },
  })

  const code = generateSixDigitCode()
  const otpKey = otpKeyForPhone(e164)
  const codeHash = hashOtpCode(otpKey, code)

  const pendingJson =
    input.purpose === 'register' && input.businessName
      ? { businessName: input.businessName.trim() }
      : undefined

  const sent = await sendWhatsAppOtpTemplate(digits, code)
  if (!sent.ok) {
    return { ok: false, error: sent.error, status: 502 }
  }

  await prisma.authOtp.create({
    data: {
      phoneE164: e164,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      purpose: input.purpose,
      pendingJson: pendingJson ?? undefined,
    },
  })

  return { ok: true }
}

export async function verifyAuthPhoneOtp(input: {
  rawPhone: string
  purpose: Purpose
  code: string
}): Promise<
  | { ok: true; user: User }
  | { ok: false; error: string; status: number }
> {
  const parsed = parseSierraLeoneToE164(input.rawPhone)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 }
  }
  const { e164 } = parsed
  const otpKey = otpKeyForPhone(e164)
  const trimmedCode = input.code.replace(/\D/g, '')
  if (trimmedCode.length !== 6) {
    return { ok: false, error: 'Enter the 6-digit code from WhatsApp', status: 400 }
  }

  const row = await prisma.authOtp.findFirst({
    where: {
      phoneE164: e164,
      purpose: input.purpose,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

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
      where: { phoneE164: e164 },
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

  const reg = await registerUserWithVerifiedPhone(e164, pending.businessName, null)
  if (!reg.success || !reg.user) {
    return { ok: false, error: reg.error || 'Registration failed', status: 400 }
  }
  await createSession(reg.user)
  return { ok: true, user: reg.user }
}
