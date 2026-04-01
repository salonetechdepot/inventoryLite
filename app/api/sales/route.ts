import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET all sales for current user
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const sales = await sql`
      SELECT id, product_id, product_name, quantity_sold, unit_price_at_sale, total_amount, created_at
      FROM sales
      WHERE user_id = ${session.userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    return NextResponse.json({ sales })
  } catch (error) {
    console.error('Get sales error:', error)
    return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 })
  }
}

// POST record a new sale
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { productId, quantity } = await request.json()

    if (!productId || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Product and valid quantity required' }, { status: 400 })
    }

    // Get product details
    const productResult = await sql`
      SELECT id, name, quantity, unit_price 
      FROM products 
      WHERE id = ${productId} AND user_id = ${session.userId}
    `

    if (productResult.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const product = productResult[0]
    const currentStock = product.quantity as number
    const unitPrice = product.unit_price as number
    const productName = product.name as string

    if (currentStock < quantity) {
      return NextResponse.json({ 
        error: `Not enough stock. Only ${currentStock} available.` 
      }, { status: 400 })
    }

    const totalAmount = quantity * unitPrice

    // Record sale
    const saleResult = await sql`
      INSERT INTO sales (user_id, product_id, product_name, quantity_sold, unit_price_at_sale, total_amount)
      VALUES (${session.userId}, ${productId}, ${productName}, ${quantity}, ${unitPrice}, ${totalAmount})
      RETURNING id, product_name, quantity_sold, total_amount, created_at
    `

    // Update product stock
    await sql`
      UPDATE products 
      SET quantity = quantity - ${quantity}, updated_at = NOW()
      WHERE id = ${productId}
    `

    return NextResponse.json({ 
      sale: saleResult[0],
      newStock: currentStock - quantity
    })
  } catch (error) {
    console.error('Record sale error:', error)
    return NextResponse.json({ error: 'Failed to record sale' }, { status: 500 })
  }
}
