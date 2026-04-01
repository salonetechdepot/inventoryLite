import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get total products count
    const productsResult = await sql`
      SELECT COUNT(*) as total FROM products WHERE user_id = ${session.userId}
    `

    // Get low stock products count
    const lowStockResult = await sql`
      SELECT COUNT(*) as total FROM products 
      WHERE user_id = ${session.userId} AND quantity <= low_stock_threshold
    `

    // Get out of stock products count
    const outOfStockResult = await sql`
      SELECT COUNT(*) as total FROM products 
      WHERE user_id = ${session.userId} AND quantity = 0
    `

    // Get total inventory value
    const valueResult = await sql`
      SELECT COALESCE(SUM(quantity * unit_price), 0) as total 
      FROM products WHERE user_id = ${session.userId}
    `

    // Get today's sales count and total
    const today = new Date().toISOString().split('T')[0]
    const salesResult = await sql`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM sales 
      WHERE user_id = ${session.userId} 
      AND DATE(created_at) = ${today}
    `

    // Get low stock products list
    const lowStockProducts = await sql`
      SELECT id, name, quantity, low_stock_threshold
      FROM products 
      WHERE user_id = ${session.userId} AND quantity <= low_stock_threshold
      ORDER BY quantity ASC
      LIMIT 5
    `

    return NextResponse.json({
      stats: {
        totalProducts: Number(productsResult[0].total),
        lowStockCount: Number(lowStockResult[0].total),
        outOfStockCount: Number(outOfStockResult[0].total),
        inventoryValue: Number(valueResult[0].total),
        todaySalesCount: Number(salesResult[0].count),
        todaySalesTotal: Number(salesResult[0].total),
      },
      lowStockProducts
    })
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
