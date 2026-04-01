import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'

// POST adjust stock quantity (add or subtract)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { adjustment } = await request.json()

    if (typeof adjustment !== 'number') {
      return NextResponse.json({ error: 'Invalid adjustment value' }, { status: 400 })
    }

    // First check if product exists and belongs to user
    const existing = await sql`
      SELECT quantity FROM products 
      WHERE id = ${id} AND user_id = ${session.userId}
    `

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const currentQty = existing[0].quantity as number
    const newQty = Math.max(0, currentQty + adjustment) // Prevent negative stock

    const result = await sql`
      UPDATE products 
      SET quantity = ${newQty}, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${session.userId}
      RETURNING id, name, quantity
    `

    return NextResponse.json({ product: result[0] })
  } catch (error) {
    console.error('Adjust stock error:', error)
    return NextResponse.json({ error: 'Failed to adjust stock' }, { status: 500 })
  }
}
