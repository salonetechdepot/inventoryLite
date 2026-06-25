import { NextResponse } from 'next/server'
import { z } from 'zod'

export const uuidSchema = z.string().uuid()

export const moneySchema = z.coerce
  .number()
  .finite()
  .min(0)
  .max(999_999_999_999.99)

export const quantitySchema = z.coerce.number().int().min(0).max(1_000_000_000)

export const positiveQuantitySchema = z.coerce.number().int().min(1).max(1_000_000_000)

export const trimmedString = (max: number) => z.string().trim().min(1).max(max)

export function validationError(error: z.ZodError) {
  return NextResponse.json(
    {
      error: 'Invalid request',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
    { status: 400 }
  )
}

export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  try {
    const json = await request.json()
    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      return { ok: false, response: validationError(parsed.error) }
    }

    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    }
  }
}

export function validateRouteId(id: string) {
  const parsed = uuidSchema.safeParse(id)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  return null
}

export function idempotencyKeyFromRequest(request: Request): string | null {
  const value = request.headers.get('idempotency-key') ?? request.headers.get('x-idempotency-key')
  const trimmed = value?.trim()
  return trimmed && trimmed.length <= 128 ? trimmed : null
}
