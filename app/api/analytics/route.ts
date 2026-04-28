import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.userId
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - 7)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [allSales, products] = await Promise.all([
      prisma.sale.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          productName: true,
          quantitySold: true,
          unitPriceAtSale: true,
          totalAmount: true,
          createdAt: true
        }
      }),
      prisma.product.findMany({
        where: { userId },
        include: {
          category: {
            select: { name: true }
          }
        }
      })
    ])

    const sumSales = (sales: typeof allSales) => sales.reduce((sum, s) => sum + Number(s.totalAmount), 0)
    const todaySales = allSales.filter((s) => (s.createdAt ?? new Date(0)) >= startOfToday)
    const weekSales = allSales.filter((s) => (s.createdAt ?? new Date(0)) >= startOfWeek)
    const monthSales = allSales.filter((s) => (s.createdAt ?? new Date(0)) >= startOfMonth)

    const topProductMap = new Map<string, { name: string; totalQuantity: number; totalRevenue: number; saleCount: number }>()
    for (const sale of allSales) {
      const existing = topProductMap.get(sale.productName) ?? {
        name: sale.productName,
        totalQuantity: 0,
        totalRevenue: 0,
        saleCount: 0
      }
      existing.totalQuantity += sale.quantitySold
      existing.totalRevenue += Number(sale.totalAmount)
      existing.saleCount += 1
      topProductMap.set(sale.productName, existing)
    }

    const topProducts = [...topProductMap.values()]
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10)

    const dailyRevenueMap = new Map<string, { date: string; transactions: number; revenue: number }>()
    for (const sale of weekSales) {
      const dateKey = (sale.createdAt ?? new Date()).toISOString().split('T')[0]
      const existing = dailyRevenueMap.get(dateKey) ?? { date: dateKey, transactions: 0, revenue: 0 }
      existing.transactions += 1
      existing.revenue += Number(sale.totalAmount)
      dailyRevenueMap.set(dateKey, existing)
    }
    const dailyRevenue = [...dailyRevenueMap.values()].sort((a, b) => (a.date < b.date ? 1 : -1))

    const inventoryStats = {
      total_products: products.length,
      total_items: products.reduce((sum, p) => sum + (p.quantity ?? 0), 0),
      total_value: products.reduce((sum, p) => sum + (p.quantity ?? 0) * Number(p.unitPrice ?? 0), 0),
      low_stock: products.filter((p) => (p.quantity ?? 0) <= (p.lowStockThreshold ?? 0) && (p.quantity ?? 0) > 0).length,
      out_of_stock: products.filter((p) => (p.quantity ?? 0) <= 0).length
    }

    const categoryMap = new Map<string, { name: string; productCount: number; totalQuantity: number; totalValue: number }>()
    for (const product of products) {
      const categoryName = product.category?.name ?? 'Uncategorized'
      const existing = categoryMap.get(categoryName) ?? { name: categoryName, productCount: 0, totalQuantity: 0, totalValue: 0 }
      existing.productCount += 1
      existing.totalQuantity += product.quantity ?? 0
      existing.totalValue += (product.quantity ?? 0) * Number(product.unitPrice ?? 0)
      categoryMap.set(categoryName, existing)
    }
    const categoryStats = [...categoryMap.values()].sort((a, b) => b.totalValue - a.totalValue)

    const recentSales = allSales.slice(0, 20)

    // === PROFIT ESTIMATE (Revenue - Cost if available) ===
    // For now, we'll just show revenue since we don't track cost price

    return NextResponse.json({
      revenue: {
        today: {
          amount: sumSales(todaySales),
          transactions: todaySales.length
        },
        week: {
          amount: sumSales(weekSales),
          transactions: weekSales.length
        },
        month: {
          amount: sumSales(monthSales),
          transactions: monthSales.length
        },
        allTime: {
          amount: sumSales(allSales),
          transactions: allSales.length
        }
      },
      topProducts: topProducts.map((p) => ({
        name: p.name,
        quantitySold: p.totalQuantity,
        revenue: p.totalRevenue,
        saleCount: p.saleCount
      })),
      dailyRevenue,
      inventory: {
        totalProducts: inventoryStats.total_products,
        totalItems: inventoryStats.total_items,
        totalValue: inventoryStats.total_value,
        lowStock: inventoryStats.low_stock,
        outOfStock: inventoryStats.out_of_stock
      },
      categories: categoryStats.map((c) => ({
        name: c.name,
        productCount: c.productCount,
        totalQuantity: c.totalQuantity,
        totalValue: c.totalValue
      })),
      recentSales: recentSales.map((s) => ({
        id: s.id,
        productName: s.productName,
        quantity: s.quantitySold,
        unitPrice: Number(s.unitPriceAtSale),
        total: Number(s.totalAmount),
        date: s.createdAt
      }))
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
