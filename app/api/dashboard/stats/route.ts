import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const [
      products,
      todaySales,
      lowStockProductsRaw
    ] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId: session.tenantId },
        select: {
          id: true,
          name: true,
          quantity: true,
          lowStockThreshold: true,
          unitPrice: true
        }
      }),
      prisma.sale.findMany({
        where: {
          tenantId: session.tenantId,
          type: 'SALE',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999))
          }
        },
        select: {
          totalAmount: true
        }
      }),
      prisma.product.findMany({
        where: { tenantId: session.tenantId },
        orderBy: { quantity: 'asc' },
        select: {
          id: true,
          name: true,
          quantity: true,
          lowStockThreshold: true
        }
      })
    ])

    const lowStockProducts = lowStockProductsRaw
      .filter((product) => (product.quantity ?? 0) <= (product.lowStockThreshold ?? 0))
      .slice(0, 5)
      .map((product) => ({
        id: product.id,
        name: product.name,
        quantity: product.quantity ?? 0,
        low_stock_threshold: product.lowStockThreshold ?? 0
      }))

    const totalProducts = products.length
    const lowStockCount = products.filter((p) => (p.quantity ?? 0) <= (p.lowStockThreshold ?? 0)).length
    const outOfStockCount = products.filter((p) => (p.quantity ?? 0) === 0).length
    const inventoryValue = products.reduce((sum, p) => sum + (p.quantity ?? 0) * Number(p.unitPrice ?? 0), 0)
    const todaySalesCount = todaySales.length
    const todaySalesTotal = todaySales.reduce((sum, s) => sum + Number(s.totalAmount), 0)

    return NextResponse.json({
      stats: {
        totalProducts,
        lowStockCount,
        outOfStockCount,
        inventoryValue,
        todaySalesCount,
        todaySalesTotal,
      },
      lowStockProducts
    })
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
