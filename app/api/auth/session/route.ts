import { NextResponse } from 'next/server'
import { getCurrentUser, getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ user: null, sessionExpiresAt: null })
    }

    const user = await getCurrentUser()
    return NextResponse.json({
      user,
      sessionExpiresAt: session.expiresAt,
    })
  } catch (error) {
    console.error('Session API error:', error)
    return NextResponse.json({ user: null, sessionExpiresAt: null })
  }
}
