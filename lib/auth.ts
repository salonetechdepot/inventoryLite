import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { prisma } from './prisma'
import { getJwtSecret } from './env'
import {
  buildTenantSettingsSeed,
  fetchTenantById,
  type AuthorizedTenant,
} from '@/lib/roarbyte-api'
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

/** Ensure tenant settings + default categories exist for this tenant. */
export async function ensureTenantWorkspace(tenant: AuthorizedTenant): Promise<TenantUser> {
  const existing = await prisma.tenantSettings.findUnique({
    where: { tenantId: tenant.tenantId },
  })

  if (!existing) {
    let externalTenant = null
    try {
      externalTenant = await fetchTenantById(tenant.tenantId, tenant.token)
    } catch (error) {
      console.warn(
        '[ensureTenantWorkspace] Roarbyte GET /api/Tenants/{id} failed, using login payload:',
        error
      )
    }

    const seed = buildTenantSettingsSeed(tenant, externalTenant)

    await prisma.tenantSettings.create({
      data: {
        tenantId: seed.tenantId,
        email: seed.email,
        phoneE164: seed.phoneE164,
        businessName: seed.businessName,
        shopLogoUrl: seed.shopLogoUrl,
        themeColor: seed.themeColor,
      },
    })

    await prisma.category.createMany({
      data: [
        { tenantId: tenant.tenantId, name: 'Food & Drinks', icon: 'utensils', isDefault: true },
        { tenantId: tenant.tenantId, name: 'Electronics', icon: 'smartphone', isDefault: true },
        { tenantId: tenant.tenantId, name: 'Clothing', icon: 'shirt', isDefault: true },
        { tenantId: tenant.tenantId, name: 'Household', icon: 'home', isDefault: true },
        { tenantId: tenant.tenantId, name: 'Other', icon: 'package', isDefault: true },
      ],
    })
  } else {
    let externalTenant = null
    try {
      externalTenant = await fetchTenantById(tenant.tenantId, tenant.token)
    } catch {
      // keep existing row if refresh fails
    }

    const seed = buildTenantSettingsSeed(tenant, externalTenant)

    await prisma.tenantSettings.update({
      where: { tenantId: tenant.tenantId },
      data: {
        email: seed.email || existing.email,
        phoneE164: seed.phoneE164 ?? existing.phoneE164,
        businessName: seed.businessName || existing.businessName,
        shopLogoUrl: seed.shopLogoUrl ?? existing.shopLogoUrl,
      },
    })
  }

  const row = await prisma.tenantSettings.findUniqueOrThrow({
    where: { tenantId: tenant.tenantId },
  })

  return {
    id: row.tenantId,
    tenant_id: row.tenantId,
    email: row.email || tenant.email,
    phone_e164: row.phoneE164,
    business_name: row.businessName || tenant.businessName,
    theme_color: row.themeColor,
    shop_logo_url: row.shopLogoUrl,
    created_at: row.createdAt,
  }
}

export async function getCurrentUser(): Promise<TenantUser | null> {
  const session = await getSession()
  if (!session) return null

  const row = await prisma.tenantSettings.findUnique({
    where: { tenantId: session.tenantId },
  })

  if (!row) {
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
    id: row.tenantId,
    tenant_id: row.tenantId,
    email: row.email || session.email,
    phone_e164: row.phoneE164,
    business_name: row.businessName || session.businessName,
    theme_color: row.themeColor,
    shop_logo_url: row.shopLogoUrl,
    created_at: row.createdAt,
  }
}

/** @deprecated Use TenantUser — kept for gradual UI migration */
export type User = TenantUser
