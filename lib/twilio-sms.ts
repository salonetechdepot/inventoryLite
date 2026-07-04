import { mapTwilioSendError } from '@/lib/auth-provider-errors'

function appName() {
  return process.env.APP_NAME?.trim() || 'StockEasy'
}

/**
 * Send a one-time code via Twilio SMS.
 *
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either
 * TWILIO_FROM_NUMBER (E.164) or TWILIO_MESSAGING_SERVICE_SID.
 *
 * @see https://www.twilio.com/docs/sms/api/message-resource
 */
export async function sendTwilioSmsOtp(
  toE164: string,
  otp: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim()
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()

  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Twilio SMS] Missing TWILIO config. Dev fallback — to=${toE164} code=${otp}`)
      return { ok: true }
    }
    return {
      ok: false,
      error:
        'SMS verification is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID).',
    }
  }

  const body = new URLSearchParams()
  body.set('To', toE164)
  if (messagingServiceSid) {
    body.set('MessagingServiceSid', messagingServiceSid)
  } else if (fromNumber) {
    body.set('From', fromNumber)
  }
  body.set(
    'Body',
    `Your ${appName()} verification code is ${otp}. It expires in 10 minutes.`
  )

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const json = (await res.json().catch(() => ({}))) as {
    sid?: string
    status?: string
    code?: number
    message?: string
    error_code?: number | null
    error_message?: string | null
  }

  if (!res.ok) {
    const msg = json.message || json.error_message || res.statusText || 'Twilio API error'
    const code = json.code ?? json.error_code ?? undefined
    console.error('[Twilio SMS] API error:', msg, json)
    return { ok: false, error: mapTwilioSendError(msg, typeof code === 'number' ? code : undefined) }
  }

  if (!json.sid) {
    console.warn('[Twilio SMS] OK response but no message sid:', json)
    return {
      ok: false,
      error: 'SMS provider accepted the request but did not queue a message. Try again.',
    }
  }

  const digits = toE164.replace(/\D/g, '')
  const maskedTo = digits.length > 4 ? `***${digits.slice(-4)}` : '****'
  console.info(`[Twilio SMS] queued sid=${json.sid} to=${maskedTo} status=${json.status ?? 'unknown'}`)

  if (process.env.NODE_ENV === 'development' && process.env.TWILIO_OTP_LOG_IN_DEV === 'true') {
    console.warn(`[Twilio SMS] DEV ONLY — code for ${maskedTo}: ${otp}`)
  }

  return { ok: true }
}
