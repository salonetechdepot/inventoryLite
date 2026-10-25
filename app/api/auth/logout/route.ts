import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth'
import { rejectCrossOrigin } from '@/lib/same-origin'

export async function POST() {
  const blocked = await rejectCrossOrigin()
  if (blocked) return blocked

  await clearSession()
  return NextResponse.json({ ok: true })
}
