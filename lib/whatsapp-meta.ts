import { mapWhatsAppSendError } from '@/lib/auth-provider-errors'

type TemplateComponent =
  | { type: 'body'; parameters: { type: 'text'; text: string }[] }
  | {
      type: 'button'
      sub_type: 'url'
      index: string
      parameters: { type: 'text'; text: string }[]
    }

/** Comma-separated button indices, e.g. "0" or "0,1". Empty / "none" = no URL buttons. */
function parseUrlButtonIndices(raw: string | undefined): string[] {
  if (raw === undefined) return []
  const trimmed = raw.trim()
  if (!trimmed || trimmed === 'none' || trimmed === 'false') return []
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
}

function buildOtpTemplateComponents(otp: string): TemplateComponent[] {
  const components: TemplateComponent[] = [
    {
      type: 'body',
      parameters: [{ type: 'text', text: otp }],
    },
  ]

  const buttonParam = process.env.WHATSAPP_OTP_URL_BUTTON_PARAM?.trim() || otp
  for (const index of parseUrlButtonIndices(process.env.WHATSAPP_OTP_URL_BUTTON_INDEX)) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index,
      parameters: [{ type: 'text', text: buttonParam }],
    })
  }

  return components
}

/**
 * Send a one-time code via Meta WhatsApp Cloud API using an approved template.
 *
 * Meta Business: create an authentication or utility template with a body
 * variable for the code (e.g. "Your verification code is {{1}}").
 * If the template has a dynamic URL button, set WHATSAPP_OTP_URL_BUTTON_INDEX=0.
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
      components: buildOtpTemplateComponents(otp),
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

  const messageId = json.messages?.[0]?.id
  if (!messageId) {
    console.warn('[WhatsApp OTP] OK response but no message id:', json)
    return {
      ok: false,
      error: 'WhatsApp accepted the request but did not queue a message. Check template and recipient in Meta.',
    }
  }

  const maskedTo =
    toDigits.length > 4 ? `***${toDigits.slice(-4)}` : '****'
  console.info(
    `[WhatsApp OTP] queued message_id=${messageId} to=${maskedTo} template=${templateName} (${languageCode})`
  )

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.WHATSAPP_OTP_LOG_IN_DEV === 'true'
  ) {
    console.warn(`[WhatsApp OTP] DEV ONLY — code for ${maskedTo}: ${otp}`)
  }

  return { ok: true }
}
