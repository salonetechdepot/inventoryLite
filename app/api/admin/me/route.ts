import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ admin: false }, { status: 403 })
  }
  return NextResponse.json({ admin: true, email: session.email })
}
