import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function isValidHexColor(value: string) {
  return /^#([0-9A-Fa-f]{6})$/.test(value)
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { themeColor, shopLogoUrl } = (await request.json()) as {
      themeColor?: string | null
      shopLogoUrl?: string | null
    }

    if (themeColor !== undefined && themeColor !== null && !isValidHexColor(themeColor)) {
      return NextResponse.json({ error: 'Invalid theme color format' }, { status: 400 })
    }

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId: session.tenantId },
      create: {
        tenantId: session.tenantId,
        email: session.email,
        businessName: session.businessName,
        themeColor: themeColor === undefined ? null : themeColor || null,
        shopLogoUrl: shopLogoUrl === undefined ? null : shopLogoUrl || null,
      },
      update: {
        themeColor: themeColor === undefined ? undefined : themeColor || null,
        shopLogoUrl: shopLogoUrl === undefined ? undefined : shopLogoUrl || null,
      },
    })

    return NextResponse.json({
      user: {
        id: settings.tenantId,
        tenant_id: settings.tenantId,
        email: settings.email || session.email,
        phone_e164: settings.phoneE164,
        business_name: settings.businessName || session.businessName,
        theme_color: settings.themeColor,
        shop_logo_url: settings.shopLogoUrl,
        created_at: settings.createdAt,
      },
    })
  } catch (error) {
    console.error('Update account settings error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
