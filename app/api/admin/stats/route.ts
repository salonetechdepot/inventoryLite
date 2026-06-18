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

  const [
    users,
    products,
    receipts,
    salesToday,
    returnsToday,
    pendingOtps,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.product.count(),
    prisma.receipt.count(),
    prisma.receipt.count({
      where: { type: 'SALE', createdAt: { gte: startOfDay } },
    }),
    prisma.receipt.count({
      where: { type: 'RETURN', createdAt: { gte: startOfDay } },
    }),
    prisma.authOtp.count({
      where: { expiresAt: { gt: new Date() } },
    }),
  ])

  return NextResponse.json({
    stats: {
      users,
      products,
      receipts,
      sales_today: salesToday,
      returns_today: returnsToday,
      active_otps: pendingOtps,
    },
  })
}
