import { NextResponse } from 'next/server'
import { sendAuthEmailOtp } from '@/lib/auth-email'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const purpose = body.purpose as string
    const email = typeof body.email === 'string' ? body.email : ''
    const businessName = typeof body.businessName === 'string' ? body.businessName : ''

    if (purpose !== 'login' && purpose !== 'register') {
      return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 })
    }

    const result = await sendAuthEmailOtp({
      rawEmail: email,
      purpose,
      businessName: purpose === 'register' ? businessName : undefined,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('email send-otp error:', error)
    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 })
  }
}
