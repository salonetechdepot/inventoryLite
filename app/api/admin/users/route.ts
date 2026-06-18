import { NextResponse } from 'next/server'
import { requireAdminSession, isAdminEmail } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
  const q = (searchParams.get('q') || '').trim().toLowerCase()

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { businessName: { contains: q, mode: 'insensitive' } },
            { phoneE164: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      email: true,
      phoneE164: true,
      businessName: true,
      createdAt: true,
      _count: {
        select: {
          products: true,
          receipts: true,
          sales: true,
        },
      },
    },
  })

  const rows = users.map((user) => ({
      id: user.id,
      email: user.email,
      phone_e164: user.phoneE164,
      business_name: user.businessName,
      created_at: user.createdAt,
      product_count: user._count.products,
      receipt_count: user._count.receipts,
      sale_count: user._count.sales,
      is_admin: isAdminEmail(user.email),
    }))

  return NextResponse.json({ users: rows, total: rows.length })
}
