/** Public product name (override display via APP_NAME env). */
export const APP_SHORT_NAME = 'BIVA'

/** Full product name shown in metadata and install prompts. */
export const APP_FULL_NAME = 'BIVA — Business Inventory & Value Assistant'

export const APP_TAGLINE = 'Business Inventory & Value Assistant'

export const APP_DEFAULT_DESCRIPTION =
  'Inventory and point-of-sale for small businesses in Sierra Leone. Track stock, sell offline, print receipts.'

/** Public-facing site name and legal contact (override via env). */
export function getAppDisplayName() {
  return process.env.APP_NAME?.trim() || APP_SHORT_NAME
}

export function getPrivacyContactEmail(): string | null {
  const email = process.env.PRIVACY_CONTACT_EMAIL?.trim()
  return email || null
}
