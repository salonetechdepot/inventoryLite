import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { getJwtSecret } from './env'
import type { AuthorizedTenant } from '@/lib/roarbyte-api'
import { ensureTenantWorkspace, getTenantProfile } from '@/lib/tenant-workspace'
import {
  computeSessionExpiresAt,
  isSessionExpired,
  secondsUntilExpiry,
  sessionExpiresAtIso,
} from '@/lib/session-expiry'

const JWT_SECRET = new TextEncoder().encode(getJwtSecret())

export interface TenantUser {
  id: string
  tenant_id: string
  email: string
  phone_e164?: string | null
  business_name: string
  theme_color?: string | null
  shop_logo_url?: string | null
  created_at: Date
}

export interface SessionPayload {
  tenantId: string
  email: string
  businessName: string
  accessToken?: string
  expiresAt: string
}

export async function createToken(
  payload: Omit<SessionPayload, 'expiresAt'>,
  expiresAt: Date
): Promise<string> {
  const expSeconds = Math.floor(expiresAt.getTime() / 1000)

  return new SignJWT({ ...payload, expiresAt: sessionExpiresAtIso(expiresAt) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expSeconds)
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    const session = payload as unknown as SessionPayload
    if (isSessionExpired(session.expiresAt)) return null
    return session
  } catch {
    return null
  }
}

export async function createSession(tenant: AuthorizedTenant): Promise<{ expiresAt: string }> {
  const expiresAt = computeSessionExpiresAt()
  const token = await createToken(
    {
      tenantId: tenant.tenantId,
      email: tenant.email,
      businessName: tenant.businessName,
      accessToken: tenant.token,
    },
    expiresAt
  )

  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: secondsUntilExpiry(expiresAt),
    path: '/',
  })

  return { expiresAt: sessionExpiresAtIso(expiresAt) }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return null
  return verifyToken(token)
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}

/** Ensure tenant row, lite settings, default categories, and warehouse exist. */
export { ensureTenantWorkspace }

export async function getCurrentUser(): Promise<TenantUser | null> {
  const session = await getSession()
  if (!session) return null

  const profile = await getTenantProfile(session.tenantId)

  if (!profile) {
    return {
      id: session.tenantId,
      tenant_id: session.tenantId,
      email: session.email,
      phone_e164: null,
      business_name: session.businessName,
      theme_color: null,
      shop_logo_url: null,
      created_at: new Date(),
    }
  }

  return {
    id: profile.id,
    tenant_id: profile.tenant_id,
    email: profile.email || session.email,
    phone_e164: profile.phone_e164,
    business_name: profile.business_name || session.businessName,
    theme_color: profile.theme_color,
    shop_logo_url: profile.shop_logo_url,
    created_at: profile.created_at,
  }
}

/** @deprecated Use TenantUser — kept for gradual UI migration */
export type User = TenantUser
