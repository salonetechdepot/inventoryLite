import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [tenants, products, receipts, salesToday, returnsToday] = await Promise.all([
    prisma.tenant.count(),
    prisma.product.count({ where: { isRetired: false } }),
    prisma.receipt.count(),
    prisma.receipt.count({
      where: { type: 'SALE', createdAt: { gte: startOfDay } },
    }),
    prisma.receipt.count({
      where: { type: 'RETURN', createdAt: { gte: startOfDay } },
    }),
  ])

  return NextResponse.json({
    stats: {
      users: tenants,
      tenants,
      products,
      receipts,
      sales_today: salesToday,
      returns_today: returnsToday,
      active_otps: 0,
    },
  })
}
