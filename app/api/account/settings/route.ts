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

    const { themeColor, shopLogoUrl } = await request.json() as {
      themeColor?: string | null
      shopLogoUrl?: string | null
    }

    if (themeColor !== undefined && themeColor !== null && !isValidHexColor(themeColor)) {
      return NextResponse.json({ error: 'Invalid theme color format' }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: {
        themeColor: themeColor === undefined ? undefined : (themeColor || null),
        shopLogoUrl: shopLogoUrl === undefined ? undefined : (shopLogoUrl || null),
      },
      select: {
        id: true,
        email: true,
        businessName: true,
        themeColor: true,
        shopLogoUrl: true,
        createdAt: true,
      }
    })

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        business_name: user.businessName,
        theme_color: user.themeColor,
        shop_logo_url: user.shopLogoUrl,
        created_at: user.createdAt
      }
    })
  } catch (error) {
    console.error('Update account settings error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
