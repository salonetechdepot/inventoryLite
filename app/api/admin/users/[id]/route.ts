import { NextResponse } from 'next/server'
import { isAdminEmail, requireAdminSession } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { validateRouteId } from '@/lib/api-validation'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const invalidId = validateRouteId(id)
  if (invalidId) return invalidId

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      phoneE164: true,
      businessName: true,
      themeColor: true,
      shopLogoUrl: true,
      createdAt: true,
      _count: {
        select: {
          products: true,
          receipts: true,
          sales: true,
          categories: true,
          payments: true,
        },
      },
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const recentReceipts = await prisma.receipt.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      type: true,
      netAmount: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      phone_e164: user.phoneE164,
      business_name: user.businessName,
      theme_color: user.themeColor,
      shop_logo_url: user.shopLogoUrl,
      created_at: user.createdAt,
      is_admin: isAdminEmail(user.email),
      counts: {
        products: user._count.products,
        receipts: user._count.receipts,
        sales: user._count.sales,
        categories: user._count.categories,
        payments: user._count.payments,
      },
      recent_receipts: recentReceipts.map((r) => ({
        id: r.id,
        type: r.type,
        net_amount: Number(r.netAmount),
        created_at: r.createdAt,
      })),
    },
  })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const invalidId = validateRouteId(id)
  if (invalidId) return invalidId

  if (session.userId === id) {
    return NextResponse.json(
      { error: 'You cannot delete your own operator account.' },
      { status: 400 }
    )
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, phoneE164: true },
  })

  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (isAdminEmail(target.email)) {
    return NextResponse.json(
      { error: 'Cannot delete another operator account listed in ADMIN_EMAILS.' },
      { status: 400 }
    )
  }

  await prisma.authOtp.deleteMany({
    where: {
      OR: [
        { email: target.email },
        ...(target.phoneE164 ? [{ phoneE164: target.phoneE164 }] : []),
      ],
    },
  })

  await prisma.user.delete({ where: { id } })

  return NextResponse.json({
    success: true,
    deleted: { id: target.id, email: target.email },
  })
}
