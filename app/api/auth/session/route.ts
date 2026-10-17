import { NextResponse } from 'next/server'
import { clearSession, getCurrentUser, getSession } from '@/lib/auth'
import { getTenantLockInfo, lockedAccountPayload } from '@/lib/tenant-lock'

export async function GET() {
  let session: Awaited<ReturnType<typeof getSession>> = null
  try {
    session = await getSession()
    if (!session) {
      return NextResponse.json({ user: null, sessionExpiresAt: null })
    }

    const lock = await getTenantLockInfo(session.tenantId)
    if (lock.isLocked) {
      await clearSession()
      return NextResponse.json({
        user: null,
        sessionExpiresAt: null,
        ...lockedAccountPayload(lock),
      })
    }

    const user = await getCurrentUser()
    return NextResponse.json({
      user,
      sessionExpiresAt: session.expiresAt,
      locked: false,
    })
  } catch (error) {
    console.error('Session API error:', error)
    if (!session) {
      return NextResponse.json({ user: null, sessionExpiresAt: null })
    }
    return NextResponse.json({
      user: {
        id: session.tenantId,
        tenant_id: session.tenantId,
        email: session.email,
        phone_e164: null,
        business_name: session.businessName,
        theme_color: null,
        shop_logo_url: null,
      },
      sessionExpiresAt: session.expiresAt,
      locked: false,
    })
  }
}
