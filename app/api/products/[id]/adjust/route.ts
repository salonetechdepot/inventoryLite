import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'
import { formatProductResponse, productInclude } from '@/lib/format-product'
import { parseJsonBody, quantitySchema, validateEntityRouteId } from '@/lib/api-validation'
import { adjustProductStock } from '@/lib/warehouse'
import { z } from 'zod'

const stockAdjustSchema = z.object({
  delta: z.coerce.number().int().min(-1_000_000_000).max(1_000_000_000).refine((n) => n !== 0),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { id } = await params
    const invalidId = validateEntityRouteId(id)
    if (invalidId) return invalidId

    const parsed = await parseJsonBody(request, stockAdjustSchema)
    if (!parsed.ok) return parsed.response

    const existing = await prisma.product.findFirst({
      where: { id, tenantId: session.tenantId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const next = await adjustProductStock(session.tenantId, id, parsed.data.delta, tx)
      if (next < 0) return { ok: false as const }
      return { ok: true as const }
    })

    if (!result.ok) {
      return NextResponse.json({ error: 'Stock cannot go below zero' }, { status: 400 })
    }

    const product = await prisma.product.findFirstOrThrow({
      where: { id, tenantId: session.tenantId },
      include: productInclude,
    })

    return NextResponse.json({ product: formatProductResponse(product) })
  } catch (error) {
    console.error('Adjust stock error:', error)
    return NextResponse.json({ error: 'Failed to adjust stock' }, { status: 500 })
  }
}
