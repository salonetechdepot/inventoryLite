import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'
import { formatProductResponse } from '@/lib/format-product'
import { loadDashboardStatsForTenant } from '@/lib/server/dashboard-stats'
import { formatReceiptForSync, receiptSyncInclude } from '@/lib/server/format-receipt'

export const dynamic = 'force-dynamic'

const FULL_RECEIPT_LIMIT = 500
/** Force a full bootstrap if cursor is older than this (handles deletes / missed deltas). */
const MAX_DELTA_AGE_MS = 24 * 60 * 60 * 1000

function parseSinceParam(raw: string | null): Date | null {
  if (!raw?.trim()) return null
  const date = new Date(raw.trim())
  if (Number.isNaN(date.getTime())) return null
  return date
}

export async function GET(request: Request) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { searchParams } = new URL(request.url)
    const forceFull = searchParams.get('full') === '1'
    const since = parseSinceParam(searchParams.get('since'))
    const now = new Date()
    const cursor = now.toISOString()

    const staleDelta =
      since !== null && now.getTime() - since.getTime() > MAX_DELTA_AGE_MS
    const full = forceFull || since === null || staleDelta

    const stats = await loadDashboardStatsForTenant(session.tenantId)

    const categories = await prisma.category.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: true } },
      },
    })

    const formattedCategories = categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      is_default: category.isDefault ?? false,
      product_count: category._count.products,
      created_at: category.createdAt,
    }))

    let products
    if (full) {
      products = await prisma.product.findMany({
        where: { tenantId: session.tenantId },
        orderBy: { name: 'asc' },
        include: {
          category: {
            select: { id: true, name: true, icon: true },
          },
        },
      })
    } else {
      products = await prisma.product.findMany({
        where: {
          tenantId: session.tenantId,
          updatedAt: { gt: since! },
        },
        orderBy: { updatedAt: 'asc' },
        include: {
          category: {
            select: { id: true, name: true, icon: true },
          },
        },
      })
    }

    const formattedProducts = products.map((product) => formatProductResponse(product))

    let saleReceipts
    let returnReceipts

    if (full) {
      ;[saleReceipts, returnReceipts] = await Promise.all([
        prisma.receipt.findMany({
          where: { tenantId: session.tenantId, type: 'SALE' },
          orderBy: { createdAt: 'desc' },
          take: FULL_RECEIPT_LIMIT,
          include: receiptSyncInclude,
        }),
        prisma.receipt.findMany({
          where: { tenantId: session.tenantId, type: 'RETURN' },
          orderBy: { createdAt: 'desc' },
          take: FULL_RECEIPT_LIMIT,
          include: receiptSyncInclude,
        }),
      ])
    } else {
      const changed = await prisma.receipt.findMany({
        where: {
          tenantId: session.tenantId,
          updatedAt: { gt: since! },
        },
        orderBy: { updatedAt: 'asc' },
        include: receiptSyncInclude,
      })
      saleReceipts = changed.filter((r) => r.type === 'SALE')
      returnReceipts = changed.filter((r) => r.type === 'RETURN')
    }

    return NextResponse.json({
      cursor,
      full,
      tenant_id: session.tenantId,
      products: formattedProducts,
      categories: formattedCategories,
      sale_receipts: saleReceipts.map(formatReceiptForSync),
      return_receipts: returnReceipts.map(formatReceiptForSync),
      stats,
      counts: {
        products: formattedProducts.length,
        sale_receipts: saleReceipts.length,
        return_receipts: returnReceipts.length,
      },
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ error: 'Failed to sync' }, { status: 500 })
  }
}
