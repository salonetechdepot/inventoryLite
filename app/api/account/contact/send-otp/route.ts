import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sendAccountContactOtp } from '@/lib/account-contact'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const field = body.field as string
    const value = typeof body.value === 'string' ? body.value : ''

    if (field !== 'email' && field !== 'phone') {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
    }

    const result = await sendAccountContactOtp({
      userId: session.userId,
      field,
      rawValue: value,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('contact send-otp error:', error)
    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 })
  }
}
