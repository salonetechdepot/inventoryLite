import { NextResponse } from 'next/server'
import { verifyAuthEmailOtp } from '@/lib/auth-email'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const purpose = body.purpose as string
    const email = typeof body.email === 'string' ? body.email : ''
    const code = typeof body.code === 'string' ? body.code : ''

    if (purpose !== 'login' && purpose !== 'register') {
      return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 })
    }

    const result = await verifyAuthEmailOtp({
      rawEmail: email,
      purpose,
      code,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        phone_e164: result.user.phone_e164,
        business_name: result.user.business_name,
        theme_color: result.user.theme_color,
        shop_logo_url: result.user.shop_logo_url,
        created_at: result.user.created_at,
      },
    })
  } catch (error) {
    console.error('email verify error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
