import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'

interface SaleItem {
  productId: string
  quantity: number
}

// POST record multiple sales at once (cart checkout)
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { items } = await request.json() as { items: SaleItem[] }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    // Validate all items have valid quantities
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: 'Invalid item in cart' }, { status: 400 })
      }
    }

    // Get all product details
    const productIds = items.map(item => item.productId)
    const products = await sql`
      SELECT id, name, quantity, unit_price 
      FROM products 
      WHERE id = ANY(${productIds}) AND user_id = ${session.userId}
    `

    // Create a map for easy lookup
    const productMap = new Map(products.map(p => [p.id, p]))

    // Validate products exist (allow overselling - stock can go negative)
    for (const item of items) {
      const product = productMap.get(item.productId)
      if (!product) {
        return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 404 })
      }
    }

    // Process all sales
    const salesResults = []
    for (const item of items) {
      const product = productMap.get(item.productId)!
      const unitPrice = product.unit_price as number
      const totalAmount = item.quantity * unitPrice

      // Record sale
      const saleResult = await sql`
        INSERT INTO sales (user_id, product_id, product_name, quantity_sold, unit_price_at_sale, total_amount)
        VALUES (${session.userId}, ${item.productId}, ${product.name}, ${item.quantity}, ${unitPrice}, ${totalAmount})
        RETURNING id, product_name, quantity_sold, total_amount, created_at
      `

      // Update product stock
      await sql`
        UPDATE products 
        SET quantity = quantity - ${item.quantity}, updated_at = NOW()
        WHERE id = ${item.productId}
      `

      salesResults.push(saleResult[0])
    }

    // Calculate total
    const totalAmount = salesResults.reduce((sum, sale) => sum + Number(sale.total_amount), 0)

    return NextResponse.json({ 
      success: true,
      sales: salesResults,
      totalAmount,
      itemCount: items.length
    })
  } catch (error) {
    console.error('Batch sale error:', error)
    return NextResponse.json({ error: 'Failed to process sales' }, { status: 500 })
  }
}
