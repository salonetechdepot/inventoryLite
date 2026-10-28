import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Replay support for offline retries: the first successful response for a
 * (tenant, route, key) is stored in the same transaction as the change, and a
 * repeated request gets that stored response instead of applying it twice.
 */

export async function findIdempotentResponse(
  tenantId: string,
  route: string,
  key: string | null
): Promise<Prisma.JsonValue | null> {
  if (!key) return null
  const row = await prisma.idempotencyKey.findUnique({
    where: { tenantId_route_key: { tenantId, route, key } },
    select: { responseJson: true },
  })
  return row?.responseJson ?? null
}

export async function saveIdempotentResponse(
  tx: Prisma.TransactionClient,
  tenantId: string,
  route: string,
  key: string | null,
  responseJson: unknown
) {
  if (!key) return
  await tx.idempotencyKey.create({
    data: { tenantId, route, key, responseJson: responseJson as Prisma.InputJsonValue },
  })
}

/**
 * Two copies of the same request ran at once and this one lost the unique-key
 * race (its transaction rolled back). Returns the winner's stored response.
 */
export async function replayAfterUniqueConflict(
  error: unknown,
  tenantId: string,
  route: string,
  key: string | null
): Promise<Prisma.JsonValue | null> {
  if (!key) return null
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null
  }
  return findIdempotentResponse(tenantId, route, key)
}
