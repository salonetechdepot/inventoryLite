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

  const tenants = await prisma.tenantSettings.findMany({
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
  })

  const withCounts = await Promise.all(
    tenants.map(async (tenant) => {
      const [products, receipts, sales] = await Promise.all([
        prisma.product.count({ where: { tenantId: tenant.tenantId } }),
        prisma.receipt.count({ where: { tenantId: tenant.tenantId } }),
        prisma.sale.count({ where: { tenantId: tenant.tenantId } }),
      ])
      return {
        id: tenant.tenantId,
        email: tenant.email,
        phone_e164: tenant.phoneE164,
        business_name: tenant.businessName,
        created_at: tenant.createdAt,
        is_admin: isAdminEmail(tenant.email),
        counts: { products, receipts, sales },
      }
    })
  )

  return NextResponse.json({ users: withCounts })
}
