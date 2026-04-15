import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.userId

    // === REVENUE METRICS ===
    
    // Today's revenue
    const today = new Date().toISOString().split('T')[0]
    const todayResult = await sql`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM sales 
      WHERE user_id = ${userId} 
      AND DATE(created_at) = ${today}
    `

    // This week's revenue (last 7 days)
    const weekResult = await sql`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM sales 
      WHERE user_id = ${userId} 
      AND created_at >= NOW() - INTERVAL '7 days'
    `

    // This month's revenue
    const monthResult = await sql`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM sales 
      WHERE user_id = ${userId} 
      AND created_at >= DATE_TRUNC('month', NOW())
    `

    // All time revenue
    const allTimeResult = await sql`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM sales 
      WHERE user_id = ${userId}
    `

    // === TOP SELLING PRODUCTS ===
    const topProducts = await sql`
      SELECT 
        product_name,
        SUM(quantity_sold) as total_quantity,
        SUM(total_amount) as total_revenue,
        COUNT(*) as sale_count
      FROM sales 
      WHERE user_id = ${userId}
      GROUP BY product_name
      ORDER BY total_quantity DESC
      LIMIT 10
    `

    // === DAILY REVENUE (Last 7 days) ===
    const dailyRevenue = await sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM sales 
      WHERE user_id = ${userId} 
      AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `

    // === INVENTORY METRICS ===
    const inventoryStats = await sql`
      SELECT 
        COUNT(*) as total_products,
        COALESCE(SUM(quantity), 0) as total_items,
        COALESCE(SUM(quantity * unit_price), 0) as total_value,
        COUNT(*) FILTER (WHERE quantity <= low_stock_threshold AND quantity > 0) as low_stock,
        COUNT(*) FILTER (WHERE quantity <= 0) as out_of_stock
      FROM products 
      WHERE user_id = ${userId}
    `

    // === CATEGORIES BREAKDOWN ===
    const categoryStats = await sql`
      SELECT 
        COALESCE(c.name, 'Uncategorized') as category_name,
        COUNT(p.id) as product_count,
        COALESCE(SUM(p.quantity), 0) as total_quantity,
        COALESCE(SUM(p.quantity * p.unit_price), 0) as total_value
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.user_id = ${userId}
      GROUP BY c.name
      ORDER BY total_value DESC
    `

    // === RECENT SALES ===
    const recentSales = await sql`
      SELECT 
        id,
        product_name,
        quantity_sold,
        unit_price_at_sale,
        total_amount,
        created_at
      FROM sales 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    `

    // === PROFIT ESTIMATE (Revenue - Cost if available) ===
    // For now, we'll just show revenue since we don't track cost price

    return NextResponse.json({
      revenue: {
        today: {
          amount: Number(todayResult[0].total),
          transactions: Number(todayResult[0].count)
        },
        week: {
          amount: Number(weekResult[0].total),
          transactions: Number(weekResult[0].count)
        },
        month: {
          amount: Number(monthResult[0].total),
          transactions: Number(monthResult[0].count)
        },
        allTime: {
          amount: Number(allTimeResult[0].total),
          transactions: Number(allTimeResult[0].count)
        }
      },
      topProducts: topProducts.map(p => ({
        name: p.product_name,
        quantitySold: Number(p.total_quantity),
        revenue: Number(p.total_revenue),
        saleCount: Number(p.sale_count)
      })),
      dailyRevenue: dailyRevenue.map(d => ({
        date: d.date,
        transactions: Number(d.transactions),
        revenue: Number(d.revenue)
      })),
      inventory: {
        totalProducts: Number(inventoryStats[0].total_products),
        totalItems: Number(inventoryStats[0].total_items),
        totalValue: Number(inventoryStats[0].total_value),
        lowStock: Number(inventoryStats[0].low_stock),
        outOfStock: Number(inventoryStats[0].out_of_stock)
      },
      categories: categoryStats.map(c => ({
        name: c.category_name,
        productCount: Number(c.product_count),
        totalQuantity: Number(c.total_quantity),
        totalValue: Number(c.total_value)
      })),
      recentSales: recentSales.map(s => ({
        id: s.id,
        productName: s.product_name,
        quantity: Number(s.quantity_sold),
        unitPrice: Number(s.unit_price_at_sale),
        total: Number(s.total_amount),
        date: s.created_at
      }))
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
