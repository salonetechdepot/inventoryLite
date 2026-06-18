import { getSession } from '@/lib/auth'

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

/** Check operator access from email only — no database call. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = getAdminEmails()
  if (allowed.length === 0) return false
  return allowed.includes(email.trim().toLowerCase())
}

export async function requireAdminSession() {
  const session = await getSession()
  if (!session) return null
  if (!isAdminEmail(session.email)) return null
  return session
}
