/** User-facing messages for Twilio SMS failures. */
export function mapTwilioSendError(message: string, code?: number): string {
  const lower = message.toLowerCase()

  if (code === 20003 || lower.includes('authenticate') || lower.includes('authorization')) {
    return 'SMS sign-in is temporarily unavailable (Twilio credentials invalid). Try email sign-in, or ask the admin to check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
  }
  if (code === 21211 || lower.includes('not a valid phone number')) {
    return 'That phone number is not valid for SMS. Check the number and try again.'
  }
  if (code === 21608 || lower.includes('unverified')) {
    return 'This number cannot receive SMS yet on the trial account. Verify it in Twilio, or use email sign-in.'
  }
  if (code === 21614 || lower.includes('not a mobile')) {
    return 'SMS codes can only be sent to mobile numbers. Use a mobile number or email sign-in.'
  }
  if (code === 21408 || lower.includes('permission to send') || lower.includes('region')) {
    return 'SMS is not enabled for this country on the Twilio account. Ask the admin to enable Sierra Leone, or use email sign-in.'
  }
  if (code === 20429 || lower.includes('rate limit') || lower.includes('too many')) {
    return 'SMS is rate-limiting messages. Wait a few minutes and try again, or use email sign-in.'
  }
  if (lower.includes('not configured') || lower.includes('twilio_')) {
    return 'SMS sign-in is not set up on this server. Use email sign-in, or ask the admin to configure Twilio.'
  }

  return `Could not send SMS code: ${message}`
}

/** User-facing messages for Resend email failures. */
export function mapResendSendError(message: string, status?: number): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('not configured') ||
    lower.includes('resend_api_key') ||
    lower.includes('resend_from_email')
  ) {
    return 'Email sign-in is not set up on this server. Use phone sign-in, or ask the admin to configure Resend (API key and verified sender).'
  }
  if (status === 401 || status === 403 || lower.includes('unauthorized') || lower.includes('api key')) {
    return 'Email sign-in failed (invalid Resend API key). Use phone sign-in or contact support.'
  }
  if (lower.includes('domain') || lower.includes('verified') || lower.includes('from')) {
    return 'Email could not be sent (sender not verified in Resend). Use phone sign-in or fix RESEND_FROM_EMAIL.'
  }
  if (lower.includes('rate') || status === 429) {
    return 'Too many emails sent. Wait a few minutes and try again.'
  }
  return `Could not send email code: ${message}`
}
