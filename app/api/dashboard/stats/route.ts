import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [
      products,
      todaySales,
      lowStockProductsRaw
    ] = await Promise.all([
      prisma.product.findMany({
        where: { userId: session.userId },
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
          userId: session.userId,
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
        where: { userId: session.userId },
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
