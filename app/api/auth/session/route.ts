import { NextResponse } from 'next/server'
import { clearSession, getCurrentUser, getSession } from '@/lib/auth'
import { getTenantLockInfo, lockedAccountPayload } from '@/lib/tenant-lock'

export async function GET() {
  try {
    const session = await getSession()
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
    return NextResponse.json({ user: null, sessionExpiresAt: null })
  }
}
