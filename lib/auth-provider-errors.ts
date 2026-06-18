/** User-facing messages for WhatsApp Cloud API failures. */
export function mapWhatsAppSendError(message: string, code?: number): string {
  const lower = message.toLowerCase()
  if (code === 190 || lower.includes('authentication')) {
    return 'WhatsApp sign-in is temporarily unavailable (server token expired). Try email sign-in, or ask the shop admin to refresh the WhatsApp token in Meta Business.'
  }
  if (code === 131008 || lower.includes('button') && lower.includes('parameter')) {
    return 'WhatsApp template has a URL button that needs a value. Add WHATSAPP_OTP_URL_BUTTON_INDEX=0 to .env and restart the server, or use a body-only template in Meta.'
  }
  if (code === 132001 || lower.includes('does not exist in the translation')) {
    return 'WhatsApp template name or language does not match Meta. In .env set WHATSAPP_OTP_TEMPLATE_NAME and WHATSAPP_OTP_TEMPLATE_LANGUAGE to exactly what appears under WhatsApp Manager → Message templates (name + language code, e.g. en not en_US). Try email sign-in meanwhile.'
  }
  if (lower.includes('template') || code === 132000) {
    return 'WhatsApp could not send the code (template issue). Try email sign-in or contact support.'
  }
  if (lower.includes('recipient') || lower.includes('not in allowed list')) {
    return 'This phone number cannot receive WhatsApp codes yet. Add it as a test number in Meta WhatsApp setup, or use email sign-in.'
  }
  if (lower.includes('rate limit') || code === 4 || code === 80007) {
    return 'WhatsApp is rate-limiting messages. Wait a few minutes and try again, or use email sign-in.'
  }
  return `Could not send WhatsApp code: ${message}`
}

/** User-facing messages for Resend email failures. */
export function mapResendSendError(message: string, status?: number): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('not configured') ||
    lower.includes('resend_api_key') ||
    lower.includes('resend_from_email')
  ) {
    return 'Email sign-in is not set up on this server. Use WhatsApp sign-in, or ask the admin to configure Resend (API key and verified sender).'
  }
  if (status === 401 || status === 403 || lower.includes('unauthorized') || lower.includes('api key')) {
    return 'Email sign-in failed (invalid Resend API key). Use WhatsApp sign-in or contact support.'
  }
  if (lower.includes('domain') || lower.includes('verified') || lower.includes('from')) {
    return 'Email could not be sent (sender not verified in Resend). Use WhatsApp sign-in or fix RESEND_FROM_EMAIL.'
  }
  if (lower.includes('rate') || status === 429) {
    return 'Too many emails sent. Wait a few minutes and try again.'
  }
  return `Could not send email code: ${message}`
}
