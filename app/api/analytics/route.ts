import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { AnalyticsPayload } from '@/lib/analytics-types'

export const dynamic = 'force-dynamic'

function signedAmount(type: string, amount: number) {
  return type === 'RETURN' ? -amount : amount
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = session.tenantId
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - 7)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [allLines, products] = await Promise.all([
      prisma.sale.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          productId: true,
          productName: true,
          quantitySold: true,
          unitPriceAtSale: true,
          totalAmount: true,
          createdAt: true,
        },
      }),
      prisma.product.findMany({
        where: { tenantId },
        include: {
          category: { select: { name: true } },
        },
      }),
    ])

    const costByProduct = new Map(
      products.map((p) => [p.id, p.costPrice != null ? Number(p.costPrice) : null])
    )

    const lineProfit = (line: (typeof allLines)[0]) => {
      const revenue = signedAmount(line.type, Number(line.totalAmount))
      const cost = line.productId ? costByProduct.get(line.productId) : null
      if (cost == null) return revenue
      const units = line.type === 'RETURN' ? -line.quantitySold : line.quantitySold
      return revenue - cost * units
    }

    const sumRevenue = (lines: typeof allLines) =>
      lines.reduce((sum, s) => sum + signedAmount(s.type, Number(s.totalAmount)), 0)
    const sumProfit = (lines: typeof allLines) =>
      lines.reduce((sum, s) => sum + lineProfit(s), 0)

    const todayLines = allLines.filter((s) => (s.createdAt ?? new Date(0)) >= startOfToday)
    const weekLines = allLines.filter((s) => (s.createdAt ?? new Date(0)) >= startOfWeek)
    const monthLines = allLines.filter((s) => (s.createdAt ?? new Date(0)) >= startOfMonth)
    const saleLines = allLines.filter((s) => s.type === 'SALE')

    const topProductMap = new Map<
      string,
      { name: string; totalQuantity: number; totalRevenue: number; saleCount: number }
    >()
    for (const line of saleLines) {
      const existing = topProductMap.get(line.productName) ?? {
        name: line.productName,
        totalQuantity: 0,
        totalRevenue: 0,
        saleCount: 0,
      }
      existing.totalQuantity += line.quantitySold
      existing.totalRevenue += Number(line.totalAmount)
      existing.saleCount += 1
      topProductMap.set(line.productName, existing)
    }

    const topProducts = [...topProductMap.values()]
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10)

    const dailyRevenueMap = new Map<string, { date: string; transactions: number; revenue: number }>()
    for (const line of weekLines) {
      const dateKey = (line.createdAt ?? new Date()).toISOString().split('T')[0]
      const existing = dailyRevenueMap.get(dateKey) ?? {
        date: dateKey,
        transactions: 0,
        revenue: 0,
      }
      existing.transactions += 1
      existing.revenue += signedAmount(line.type, Number(line.totalAmount))
      dailyRevenueMap.set(dateKey, existing)
    }
    const dailyRevenue = [...dailyRevenueMap.values()].sort((a, b) =>
      a.date < b.date ? 1 : -1
    )

    const inventoryStats = {
      total_products: products.length,
      total_items: products.reduce((sum, p) => sum + (p.quantity ?? 0), 0),
      total_value: products.reduce(
        (sum, p) => sum + (p.quantity ?? 0) * Number(p.unitPrice ?? 0),
        0
      ),
      stock_cost_value: products.reduce((sum, p) => {
        const cost = p.costPrice != null ? Number(p.costPrice) : 0
        return sum + (p.quantity ?? 0) * cost
      }, 0),
      low_stock: products.filter(
        (p) => (p.quantity ?? 0) <= (p.lowStockThreshold ?? 0) && (p.quantity ?? 0) > 0
      ).length,
      out_of_stock: products.filter((p) => (p.quantity ?? 0) <= 0).length,
    }

    const categoryMap = new Map<
      string,
      { name: string; productCount: number; totalQuantity: number; totalValue: number }
    >()
    for (const product of products) {
      const categoryName = product.category?.name ?? 'Uncategorized'
      const existing = categoryMap.get(categoryName) ?? {
        name: categoryName,
        productCount: 0,
        totalQuantity: 0,
        totalValue: 0,
      }
      existing.productCount += 1
      existing.totalQuantity += product.quantity ?? 0
      existing.totalValue += (product.quantity ?? 0) * Number(product.unitPrice ?? 0)
      categoryMap.set(categoryName, existing)
    }
    const categoryStats = [...categoryMap.values()].sort((a, b) => b.totalValue - a.totalValue)

    const recentSales = allLines.slice(0, 20)

    const payload: AnalyticsPayload = {
      revenue: {
        today: { amount: sumRevenue(todayLines), transactions: todayLines.length },
        week: { amount: sumRevenue(weekLines), transactions: weekLines.length },
        month: { amount: sumRevenue(monthLines), transactions: monthLines.length },
        allTime: { amount: sumRevenue(allLines), transactions: allLines.length },
      },
      profit: {
        today: sumProfit(todayLines),
        week: sumProfit(weekLines),
        month: sumProfit(monthLines),
        allTime: sumProfit(allLines),
      },
      topProducts: topProducts.map((p) => ({
        name: p.name,
        quantitySold: p.totalQuantity,
        revenue: p.totalRevenue,
        saleCount: p.saleCount,
      })),
      dailyRevenue,
      inventory: {
        totalProducts: inventoryStats.total_products,
        totalItems: inventoryStats.total_items,
        totalValue: inventoryStats.total_value,
        stockCostValue: inventoryStats.stock_cost_value,
        lowStock: inventoryStats.low_stock,
        outOfStock: inventoryStats.out_of_stock,
      },
      categories: categoryStats.map((c) => ({
        name: c.name,
        productCount: c.productCount,
        totalQuantity: c.totalQuantity,
        totalValue: c.totalValue,
      })),
      recentSales: recentSales.map((s) => ({
        id: s.id,
        productName: s.productName,
        quantity: s.quantitySold,
        unitPrice: Number(s.unitPriceAtSale),
        total: signedAmount(s.type, Number(s.totalAmount)),
        type: s.type,
        date: s.createdAt,
      })),
      _cachedAt: new Date().toISOString(),
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
