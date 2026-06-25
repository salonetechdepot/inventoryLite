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
