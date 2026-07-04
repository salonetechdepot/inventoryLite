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

  const tenant = await prisma.tenantSettings.findUnique({
    where: { tenantId: id },
  })

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const [products, receipts, sales, categories, payments, recentReceipts] =
    await Promise.all([
      prisma.product.count({ where: { tenantId: id } }),
      prisma.receipt.count({ where: { tenantId: id } }),
      prisma.sale.count({ where: { tenantId: id } }),
      prisma.category.count({ where: { tenantId: id } }),
      prisma.payment.count({ where: { tenantId: id } }),
      prisma.receipt.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          netAmount: true,
          createdAt: true,
        },
      }),
    ])

  return NextResponse.json({
    user: {
      id: tenant.tenantId,
      email: tenant.email,
      phone_e164: tenant.phoneE164,
      business_name: tenant.businessName,
      theme_color: tenant.themeColor,
      shop_logo_url: tenant.shopLogoUrl,
      created_at: tenant.createdAt,
      is_admin: isAdminEmail(tenant.email),
      counts: { products, receipts, sales, categories, payments },
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

  if (session.tenantId === id) {
    return NextResponse.json(
      { error: 'You cannot delete your own tenant data.' },
      { status: 400 }
    )
  }

  const target = await prisma.tenantSettings.findUnique({
    where: { tenantId: id },
  })
  if (!target) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }
  if (isAdminEmail(target.email)) {
    return NextResponse.json(
      { error: 'Cannot delete an operator tenant listed in ADMIN_EMAILS.' },
      { status: 400 }
    )
  }

  await prisma.$transaction([
    prisma.payment.deleteMany({ where: { tenantId: id } }),
    prisma.sale.deleteMany({ where: { tenantId: id } }),
    prisma.receipt.deleteMany({ where: { tenantId: id } }),
    prisma.product.deleteMany({ where: { tenantId: id } }),
    prisma.category.deleteMany({ where: { tenantId: id } }),
    prisma.idempotencyKey.deleteMany({ where: { tenantId: id } }),
    prisma.tenantSettings.delete({ where: { tenantId: id } }),
  ])

  return NextResponse.json({ ok: true })
}
