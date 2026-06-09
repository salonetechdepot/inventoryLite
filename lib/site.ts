/** Public-facing site name and legal contact (override via env). */
export function getAppDisplayName() {
  return process.env.APP_NAME?.trim() || 'StockEasy'
}

export function getPrivacyContactEmail(): string | null {
  const email = process.env.PRIVACY_CONTACT_EMAIL?.trim()
  return email || null
}
