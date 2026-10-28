import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'
import { formatProductResponse, productInclude } from '@/lib/format-product'
import {
  idempotencyKeyFromRequest,
  parseJsonBody,
  validateEntityRouteId,
} from '@/lib/api-validation'
import { adjustProductStock } from '@/lib/warehouse'
import {
  findIdempotentResponse,
  replayAfterUniqueConflict,
  saveIdempotentResponse,
} from '@/lib/server/idempotency'
import { z } from 'zod'

const IDEMPOTENCY_ROUTE = 'products.adjust'

const stockChangeSchema = z.coerce
  .number()
  .int()
  .min(-1_000_000_000)
  .max(1_000_000_000)
  .refine((n) => n !== 0)

/** Clients send `adjustment`; `delta` is accepted for older callers. */
const stockAdjustSchema = z
  .object({
    adjustment: stockChangeSchema.optional(),
    delta: stockChangeSchema.optional(),
  })
  .refine((body) => body.adjustment !== undefined || body.delta !== undefined, {
    message: 'adjustment is required',
  })
  .transform((body) => ({ delta: (body.adjustment ?? body.delta) as number }))

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const idempotencyKey = idempotencyKeyFromRequest(request)
  let tenantId: string | null = null
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult
    tenantId = session.tenantId

    const { id } = await params
    const invalidId = validateEntityRouteId(id)
    if (invalidId) return invalidId

    const existingResponse = await findIdempotentResponse(
      session.tenantId,
      IDEMPOTENCY_ROUTE,
      idempotencyKey
    )
    if (existingResponse) return NextResponse.json(existingResponse)

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
      if (next === null) return { ok: false as const }
      const product = await tx.product.findFirstOrThrow({
        where: { id, tenantId: session.tenantId },
        include: productInclude,
      })
      const responseJson = { product: formatProductResponse(product) }
      await saveIdempotentResponse(tx, session.tenantId, IDEMPOTENCY_ROUTE, idempotencyKey, responseJson)
      return { ok: true as const, responseJson }
    })

    if (!result.ok) {
      return NextResponse.json({ error: 'Stock cannot go below zero' }, { status: 422 })
    }

    return NextResponse.json(result.responseJson)
  } catch (error) {
    if (tenantId) {
      const replay = await replayAfterUniqueConflict(error, tenantId, IDEMPOTENCY_ROUTE, idempotencyKey)
      if (replay) return NextResponse.json(replay)
    }
    console.error('Adjust stock error:', error)
    return NextResponse.json({ error: 'Failed to adjust stock' }, { status: 500 })
  }
}
