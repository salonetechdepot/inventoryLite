import { NextResponse } from 'next/server'
import type { SessionPayload } from '@/lib/auth'
import { rejectCrossOrigin } from '@/lib/same-origin'
import { lockedAccountResponse, requireActiveSession } from '@/lib/tenant-lock'

/** Returns session or a ready-to-return NextResponse (401 / locked / bad origin). */
export async function getApiSession(): Promise<SessionPayload | NextResponse> {
  const blocked = await rejectCrossOrigin()
  if (blocked) return blocked

  const auth = await requireActiveSession()
  if (!auth.ok) {
    if (auth.reason === 'locked') return lockedAccountResponse(auth.lock)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return auth.session
}
