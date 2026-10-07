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

  const tenants = await prisma.tenant.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { retailSettings: true },
  })

  const withCounts = await Promise.all(
    tenants.map(async (tenant) => {
      const [products, receipts, sales] = await Promise.all([
        prisma.product.count({ where: { tenantId: tenant.id, isRetired: false } }),
        prisma.receipt.count({ where: { tenantId: tenant.id } }),
        prisma.sale.count({ where: { tenantId: tenant.id } }),
      ])
      return {
        id: tenant.id,
        email: tenant.email,
        phone_e164: tenant.phone,
        business_name: tenant.name,
        is_locked: tenant.retailSettings?.isLocked ?? false,
        created_at: tenant.createdAt,
        is_admin: isAdminEmail(tenant.email),
        product_count: products,
        receipt_count: receipts,
        sale_count: sales,
      }
    })
  )

  return NextResponse.json({ users: withCounts })
}
