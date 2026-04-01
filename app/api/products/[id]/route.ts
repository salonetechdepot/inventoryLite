import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET single product
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const result = await sql`
      SELECT 
        p.id, p.name, p.quantity, p.unit_price, p.low_stock_threshold,
        p.image_url, p.created_at, p.updated_at,
        c.id as category_id, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ${id} AND p.user_id = ${session.userId}
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ product: result[0] })
  } catch (error) {
    console.error('Get product error:', error)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}

// PATCH update product
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { name, quantity, unitPrice, lowStockThreshold, categoryId } = await request.json()

    const result = await sql`
      UPDATE products 
      SET 
        name = COALESCE(${name}, name),
        quantity = COALESCE(${quantity}, quantity),
        unit_price = COALESCE(${unitPrice}, unit_price),
        low_stock_threshold = COALESCE(${lowStockThreshold}, low_stock_threshold),
        category_id = COALESCE(${categoryId}, category_id),
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${session.userId}
      RETURNING id, name, quantity, unit_price, low_stock_threshold, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ product: result[0] })
  } catch (error) {
    console.error('Update product error:', error)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

// DELETE product
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const result = await sql`
      DELETE FROM products 
      WHERE id = ${id} AND user_id = ${session.userId}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete product error:', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
