const PLACEHOLDER_VALUES = new Set([
  '',
  'change-me',
  'change-me-in-production',
  'change-this-to-a-long-random-secret',
  'your-secret-key-change-in-production',
])

function requireEnv(name: string): string {
  const value = process.env[name]?.trim() ?? ''
  if (!value || PLACEHOLDER_VALUES.has(value)) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value && !PLACEHOLDER_VALUES.has(value) ? value : undefined
}

/** Fix common Neon / psql paste mistakes before Prisma reads DATABASE_URL. */
export function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  let value = raw.trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }
  const psqlMatch = value.match(/^psql\s+(['"])?(postgresql:\/\/.+)\1\s*$/i)
  if (psqlMatch) value = psqlMatch[2]
  // Node pg / Prisma: channel_binding often breaks pooler connections on Windows.
  value = value.replace(/([?&])channel_binding=[^&]*&?/gi, (_, sep) => (sep === '?' ? '?' : ''))
  value = value.replace(/\?&/, '?').replace(/[?&]$/, '')
  return value
}

export function applyDatabaseUrlNormalization() {
  const normalized = normalizeDatabaseUrl(process.env.DATABASE_URL)
  if (normalized) process.env.DATABASE_URL = normalized
}

function requireLongSecret(name: string, minLength = 32): string {
  const value = requireEnv(name)
  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters long`)
  }
  return value
}

export function getJwtSecret(): string {
  return requireLongSecret('JWT_SECRET')
}

export function getOtpPepper(): string {
  return optionalEnv('OTP_PEPPER') ?? getJwtSecret()
}

export function validateServerEnv() {
  requireEnv('DATABASE_URL')
  getJwtSecret()
  return true
}
