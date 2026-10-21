import type { Prisma } from '@prisma/client'
import { newEntityId } from '@/lib/entity-id'

type Tx = Prisma.TransactionClient

const DEFAULT_WAREHOUSE_CODE = 'MAIN'
const DEFAULT_WAREHOUSE_NAME = 'Main store'

/** Resolve the warehouse used for lite stock movements (first active, else create MAIN). */
export async function ensureDefaultWarehouse(tenantId: string, tx?: Tx) {
  const db = tx ?? (await import('@/lib/prisma')).prisma

  const existing = await db.warehouse.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) return existing

  const now = new Date()
  return db.warehouse.create({
    data: {
      id: newEntityId(),
      tenantId,
      name: DEFAULT_WAREHOUSE_NAME,
      code: DEFAULT_WAREHOUSE_CODE,
      locationCode: 'SL',
      siteCode: 'MAIN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  })
}

export async function getStockQuantity(
  tenantId: string,
  productId: string,
  warehouseId: string,
  tx?: Tx
): Promise<number> {
  const db = tx ?? (await import('@/lib/prisma')).prisma
  const row = await db.stockLevel.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  })
  if (row && row.tenantId === tenantId) return row.quantity
  const product = await db.product.findFirst({
    where: { id: productId, tenantId },
    select: { quantity: true },
  })
  return product?.quantity ?? 0
}

export async function setProductStock(
  tenantId: string,
  productId: string,
  warehouseId: string,
  quantity: number,
  tx: Tx
) {
  const now = new Date()
  await tx.stockLevel.upsert({
    where: { warehouseId_productId: { warehouseId, productId } },
    create: {
      warehouseId,
      productId,
      tenantId,
      quantity,
      updatedAt: now,
    },
    update: { quantity, updatedAt: now },
  })
  await tx.product.updateMany({
    where: { id: productId, tenantId },
    data: { quantity, updatedAt: now },
  })
}

/**
 * Apply a stock change. Returns the new quantity, or null when a decrease would take
 * stock below zero. Increases are always allowed, so restocking an oversold item works.
 */
export async function adjustProductStock(
  tenantId: string,
  productId: string,
  delta: number,
  tx: Tx
): Promise<number | null> {
  const warehouse = await ensureDefaultWarehouse(tenantId, tx)
  const current = await getStockQuantity(tenantId, productId, warehouse.id, tx)
  const next = current + delta
  if (delta < 0 && next < 0) return null
  await setProductStock(tenantId, productId, warehouse.id, next, tx)
  return next
}

/**
 * Record goods leaving with a sale. Stock may go below zero: the cashier confirms
 * overselling on Sell, and offline sales from several tills must never be rejected
 * after the customer has paid. Negative stock shows as out of stock until restocked.
 */
export async function decrementProductStockForSale(
  tenantId: string,
  productId: string,
  amount: number,
  tx: Tx
): Promise<number> {
  const warehouse = await ensureDefaultWarehouse(tenantId, tx)
  const current = await getStockQuantity(tenantId, productId, warehouse.id, tx)
  const next = current - amount
  await setProductStock(tenantId, productId, warehouse.id, next, tx)
  return next
}
