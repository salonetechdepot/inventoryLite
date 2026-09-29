import { mapResendSendError } from '@/lib/auth-provider-errors'
import { APP_SHORT_NAME } from '@/lib/site'

/**
 * Send OTP via Resend (https://resend.com/docs/api-reference/emails/send-email)
 */
export async function sendEmailOtp(  to: string,
  otp: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Resend OTP] Missing RESEND config. Dev fallback — to=${to} code=${otp}`)
      return { ok: true }
    }
    return {
      ok: false,
      error: mapResendSendError('Email verification is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL)'),
    }
  }

  const appName = process.env.APP_NAME || APP_SHORT_NAME

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${appName} — your sign-in code`,
      html: `
        <p>Your verification code is:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;margin:16px 0">${otp}</p>
        <p style="color:#666;font-size:14px">This code expires in 10 minutes. If you did not request it, ignore this email.</p>
      `.trim(),
    }),
  })

  const json = (await res.json().catch(() => ({}))) as { message?: string }
  if (!res.ok) {
    const msg = json.message || res.statusText || 'Resend API error'
    console.error('[Resend OTP] API error:', msg, json)
    return { ok: false, error: mapResendSendError(msg, res.status) }
  }

  return { ok: true }
}
