import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { verifyAccountContactOtp } from '@/lib/account-contact'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const field = body.field as string
    const value = typeof body.value === 'string' ? body.value : ''
    const code = typeof body.code === 'string' ? body.code : ''

    if (field !== 'email' && field !== 'phone') {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
    }

    const result = await verifyAccountContactOtp({
      userId: session.userId,
      field,
      rawValue: value,
      code,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      user: {
        email: result.email,
        phone_e164: result.phone_e164,
      },
    })
  } catch (error) {
    console.error('contact verify error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
