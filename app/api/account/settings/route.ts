import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function isValidHexColor(value: string) {
  return /^#([0-9A-Fa-f]{6})$/.test(value)
}

export async function PATCH(request: Request) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { themeColor, shopLogoUrl } = (await request.json()) as {
      themeColor?: string | null
      shopLogoUrl?: string | null
    }

    if (themeColor !== undefined && themeColor !== null && !isValidHexColor(themeColor)) {
      return NextResponse.json({ error: 'Invalid theme color format' }, { status: 400 })
    }

    const tenant = await prisma.tenant.update({
      where: { id: session.tenantId },
      data: {
        themeColor: themeColor === undefined ? undefined : themeColor || null,
        imageUrl: shopLogoUrl === undefined ? undefined : shopLogoUrl || null,
      },
    })

    return NextResponse.json({
      user: {
        id: tenant.id,
        tenant_id: tenant.id,
        email: tenant.email || session.email,
        phone_e164: tenant.phone,
        business_name: tenant.name || session.businessName,
        theme_color: tenant.themeColor,
        shop_logo_url: tenant.imageUrl,
        created_at: tenant.createdAt,
      },
    })
  } catch (error) {
    console.error('Update account settings error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
