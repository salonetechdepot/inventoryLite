import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseJsonBody, validateRouteId } from '@/lib/api-validation'
import { z } from 'zod'

const stockAdjustSchema = z.object({
  adjustment: z.coerce.number().int().min(-1_000_000_000).max(1_000_000_000),
})

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
    const invalidId = validateRouteId(id)
    if (invalidId) return invalidId

    const parsed = await parseJsonBody(request, stockAdjustSchema)
    if (!parsed.ok) return parsed.response
    const { adjustment } = parsed.data

    // First check if product exists and belongs to user
    const existing = await prisma.product.findFirst({
      where: { id, tenantId: session.tenantId },
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
