import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET all products for current user
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const products = await sql`
      SELECT 
        p.id, p.name, p.quantity, p.unit_price, p.low_stock_threshold,
        p.image_url, p.created_at, p.updated_at,
        c.id as category_id, c.name as category_name, c.icon as category_icon
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.user_id = ${session.userId}
      ORDER BY p.name ASC
    `

    return NextResponse.json({ products })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

// POST create new product
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, quantity, unitPrice, lowStockThreshold, categoryId, imageUrl } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO products (user_id, category_id, name, quantity, unit_price, low_stock_threshold, image_url)
      VALUES (
        ${session.userId}, 
        ${categoryId || null}, 
        ${name}, 
        ${quantity || 0}, 
        ${unitPrice || 0},
        ${lowStockThreshold || 5},
        ${imageUrl || null}
      )
      RETURNING id, name, quantity, unit_price, low_stock_threshold, image_url, created_at
    `

    return NextResponse.json({ product: result[0] })
  } catch (error) {
    console.error('Create product error:', error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
