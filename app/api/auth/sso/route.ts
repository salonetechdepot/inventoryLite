import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/api-validation'
import { authorizeAccessToken } from '@/lib/roarbyte-api'
import { establishLiteSession } from '@/lib/lite-session'

const ssoSchema = z.object({
  token: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, ssoSchema)
    if (!parsed.ok) return parsed.response

    const auth = await authorizeAccessToken(parsed.data.token)
    if (!auth.ok) {
      const status =
        auth.reason === 'access_denied_role' ||
        auth.reason === 'access_denied_module' ||
        auth.reason === 'access_denied_subscription'
          ? 403
          : 401
      return NextResponse.json({ error: auth.error }, { status })
    }

    const session = await establishLiteSession(auth.tenant)
    if (!session.ok) return session.response

    return NextResponse.json({
      user: session.user,
      sessionExpiresAt: session.sessionExpiresAt,
    })
  } catch (error) {
    console.error('SSO establish error:', error)
    return NextResponse.json({ error: 'Could not sign in from portal link.' }, { status: 500 })
  }
}
