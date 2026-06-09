export function normalizeEmail(raw: string):
  | { ok: true; email: string }
  | { ok: false; error: string } {
  const email = raw.trim().toLowerCase()
  if (!email) {
    return { ok: false, error: 'Enter your email address' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address' }
  }
  return { ok: true, email }
}

export function otpKeyForEmail(email: string): string {
  return `email:${email}`
}
