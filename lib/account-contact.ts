import { prisma } from '@/lib/prisma'
import { normalizeEmail } from '@/lib/email-normalize'
import { parseSierraLeoneToE164 } from '@/lib/phone-sierra-leone'
import { sendEmailOtp } from '@/lib/resend-email'
import { sendWhatsAppOtpTemplate } from '@/lib/whatsapp-meta'
import { generateSixDigitCode, hashOtpCode, verifyOtpCode } from '@/lib/otp-code'
import { checkOtpSendRateLimit } from '@/lib/otp-rate-limit'
import { isSyntheticPhoneEmail, syntheticEmailFromPhoneE164 } from '@/lib/auth'

const OTP_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 55 * 1000
const PURPOSE = 'contact_update'

function otpKey(userId: string, field: string, value: string) {
  return `contact:${userId}:${field}:${value}`
}

export async function sendAccountContactOtp(input: {
  userId: string
  field: 'email' | 'phone'
  rawValue: string
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, phoneE164: true },
  })
  if (!user) {
    return { ok: false, error: 'User not found', status: 404 }
  }

  let targetEmail: string | null = null
  let targetPhone: string | null = null
  let sendChannel: 'email' | 'whatsapp' = 'email'

  if (input.field === 'email') {
    const parsed = normalizeEmail(input.rawValue)
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, status: 400 }
    }
    if (isSyntheticPhoneEmail(parsed.email)) {
      return { ok: false, error: 'Enter a real email address', status: 400 }
    }
    if (parsed.email === user.email.toLowerCase()) {
      return { ok: false, error: 'That is already your email', status: 400 }
    }
    const taken = await prisma.user.findFirst({
      where: { email: parsed.email, id: { not: user.id } },
      select: { id: true },
    })
    if (taken) {
      return { ok: false, error: 'This email is already used by another account', status: 409 }
    }
    targetEmail = parsed.email
    sendChannel = 'email'
  } else {
    const parsed = parseSierraLeoneToE164(input.rawValue)
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, status: 400 }
    }
    if (parsed.e164 === user.phoneE164) {
      return { ok: false, error: 'That is already your phone number', status: 400 }
    }
    const taken = await prisma.user.findFirst({
      where: { phoneE164: parsed.e164, id: { not: user.id } },
      select: { id: true },
    })
    if (taken) {
      return { ok: false, error: 'This number is already used by another account', status: 409 }
    }
    targetPhone = parsed.e164
    sendChannel = 'whatsapp'
  }

  const hourly = await checkOtpSendRateLimit({
    email: targetEmail ?? undefined,
    phoneE164: targetPhone ?? undefined,
  })
  if (!hourly.ok) {
    return { ok: false, error: hourly.error, status: hourly.status }
  }

  const latest = await prisma.authOtp.findFirst({
    where: {
      purpose: PURPOSE,
      ...(targetEmail ? { email: targetEmail } : { phoneE164: targetPhone! }),
    },
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
    where: {
      purpose: PURPOSE,
      ...(targetEmail ? { email: targetEmail } : { phoneE164: targetPhone! }),
    },
  })

  const code = generateSixDigitCode()
  const value = targetEmail ?? targetPhone!
  const codeHash = hashOtpCode(otpKey(user.id, input.field, value), code)

  if (sendChannel === 'email' && targetEmail) {
    const sent = await sendEmailOtp(targetEmail, code)
    if (!sent.ok) {
      return { ok: false, error: sent.error, status: 502 }
    }
    await prisma.authOtp.create({
      data: {
        channel: 'email',
        email: targetEmail,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        purpose: PURPOSE,
        pendingJson: { userId: user.id, field: input.field, value: targetEmail },
      },
    })
  } else if (targetPhone) {
    const parsed = parseSierraLeoneToE164(input.rawValue)
    const digits = parsed.ok ? parsed.digits : targetPhone.replace(/\D/g, '')
    const sent = await sendWhatsAppOtpTemplate(digits, code)
    if (!sent.ok) {
      return { ok: false, error: sent.error, status: 502 }
    }
    await prisma.authOtp.create({
      data: {
        channel: 'whatsapp',
        phoneE164: targetPhone,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        purpose: PURPOSE,
        pendingJson: { userId: user.id, field: input.field, value: targetPhone },
      },
    })
  }

  return { ok: true }
}

export async function verifyAccountContactOtp(input: {
  userId: string
  field: 'email' | 'phone'
  rawValue: string
  code: string
}): Promise<{ ok: true; email?: string; phone_e164?: string | null } | { ok: false; error: string; status: number }> {
  let normalizedValue = ''
  if (input.field === 'email') {
    const parsed = normalizeEmail(input.rawValue)
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, status: 400 }
    }
    normalizedValue = parsed.email
  } else {
    const parsed = parseSierraLeoneToE164(input.rawValue)
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, status: 400 }
    }
    normalizedValue = parsed.e164
  }

  const trimmedCode = input.code.replace(/\D/g, '')
  if (trimmedCode.length !== 6) {
    return { ok: false, error: 'Enter the 6-digit code', status: 400 }
  }

  const row = await prisma.authOtp.findFirst({
    where: {
      purpose: PURPOSE,
      expiresAt: { gt: new Date() },
      ...(input.field === 'email'
        ? { email: normalizedValue }
        : { phoneE164: normalizedValue }),
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!row) {
    return { ok: false, error: 'Code expired or not found. Request a new one.', status: 400 }
  }

  const pending = row.pendingJson as { userId?: string; field?: string; value?: string } | null
  if (!pending?.userId || pending.userId !== input.userId || pending.value !== normalizedValue) {
    return { ok: false, error: 'Invalid verification session', status: 400 }
  }

  if (!verifyOtpCode(otpKey(input.userId, input.field, normalizedValue), trimmedCode, row.codeHash)) {
    await prisma.authOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    })
    return { ok: false, error: 'Invalid code', status: 400 }
  }

  await prisma.authOtp.delete({ where: { id: row.id } })

  if (input.field === 'email') {
    const updated = await prisma.user.update({
      where: { id: input.userId },
      data: { email: normalizedValue },
      select: { email: true, phoneE164: true },
    })
    return { ok: true, email: updated.email, phone_e164: updated.phoneE164 }
  }

  const current = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  })
  const useSyntheticEmail =
    !current?.email || isSyntheticPhoneEmail(current.email)

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: {
      phoneE164: normalizedValue,
      ...(useSyntheticEmail ? { email: syntheticEmailFromPhoneE164(normalizedValue) } : {}),
    },
    select: { email: true, phoneE164: true },
  })

  return { ok: true, email: updated.email, phone_e164: updated.phoneE164 }
}
