import { mapWhatsAppSendError } from '@/lib/auth-provider-errors'

/**
 * Send a one-time code via Meta WhatsApp Cloud API using an approved template.
 *
 * Meta Business: create an authentication or utility template with a body
 * variable for the code (e.g. "Your verification code is {{1}}").
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */
export async function sendWhatsAppOtpTemplate(
  toDigits: string,
  otp: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'otp_verification'
  const languageCode =
    process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'en_US'

  if (!phoneNumberId || !token) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[WhatsApp OTP] Missing WHATSAPP config. Dev fallback — to=${toDigits} code=${otp}`)
      return { ok: true }
    }
    return {
      ok: false,
      error: 'WhatsApp verification is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.',
    }
  }

  const version = process.env.WHATSAPP_GRAPH_VERSION || 'v22.0'
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toDigits,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: otp }],
        },
      ],
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }
    messages?: { id: string }[]
  }

  if (!res.ok) {
    const msg = json.error?.message || res.statusText || 'WhatsApp API error'
    const code = (json.error as { code?: number } | undefined)?.code
    console.error('[WhatsApp OTP] API error:', msg, json)
    return { ok: false, error: mapWhatsAppSendError(msg, code) }
  }

  return { ok: true }
}
