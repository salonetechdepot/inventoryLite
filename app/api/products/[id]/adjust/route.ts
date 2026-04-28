import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
    const existing = await prisma.product.findFirst({
      where: { id, userId: session.userId },
      select: { quantity: true, name: true }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const currentQty = existing.quantity ?? 0
    const newQty = Math.max(0, currentQty + adjustment) // Prevent negative stock

    const product = await prisma.product.update({
      where: { id },
      data: {
        quantity: newQty,
        updatedAt: new Date()
      },
      select: {
        id: true,
        name: true,
        quantity: true
      }
    })

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Adjust stock error:', error)
    return NextResponse.json({ error: 'Failed to adjust stock' }, { status: 500 })
  }
}
