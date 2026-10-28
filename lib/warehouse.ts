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

/** Products from before stock levels existed only carry products.quantity; seed a row from it. */
async function ensureStockLevelRow(
  tenantId: string,
  productId: string,
  warehouseId: string,
  tx: Tx
) {
  const row = await tx.stockLevel.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
    select: { tenantId: true },
  })
  if (row) return
  const product = await tx.product.findFirst({
    where: { id: productId, tenantId },
    select: { quantity: true },
  })
  await tx.stockLevel.upsert({
    where: { warehouseId_productId: { warehouseId, productId } },
    create: {
      warehouseId,
      productId,
      tenantId,
      quantity: product?.quantity ?? 0,
      updatedAt: new Date(),
    },
    update: {},
  })
}

/**
 * Add `delta` to stock in one UPDATE (quantity = quantity + delta). The row lock
 * makes concurrent syncs from several tills queue up instead of overwriting each
 * other. Returns the new quantity, or null when the guard rejected the change.
 */
async function applyStockDelta(
  tenantId: string,
  productId: string,
  delta: number,
  tx: Tx,
  options: { allowNegative: boolean }
): Promise<number | null> {
  const warehouse = await ensureDefaultWarehouse(tenantId, tx)
  await ensureStockLevelRow(tenantId, productId, warehouse.id, tx)
  const now = new Date()
  const updated = await tx.stockLevel.updateMany({
    where: {
      warehouseId: warehouse.id,
      productId,
      tenantId,
      ...(options.allowNegative || delta >= 0 ? {} : { quantity: { gte: -delta } }),
    },
    data: { quantity: { increment: delta }, updatedAt: now },
  })
  if (updated.count === 0) return null
  const row = await tx.stockLevel.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: warehouse.id, productId } },
    select: { quantity: true },
  })
  await tx.product.updateMany({
    where: { id: productId, tenantId },
    data: { quantity: row.quantity, updatedAt: now },
  })
  return row.quantity
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
  return applyStockDelta(tenantId, productId, delta, tx, { allowNegative: false })
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
  const next = await applyStockDelta(tenantId, productId, -amount, tx, { allowNegative: true })
  return next ?? 0
}
