import { prisma } from '@/lib/prisma'

export type ReturnableLine = {
  product_id: string
  product_name: string
  unit_price_at_sale: number
  sold_quantity: number
  already_returned: number
  returnable_quantity: number
}

/** Quantities still eligible to return against a sale receipt. */
export async function getReturnableLinesForReceipt(
  userId: string,
  originalReceiptId: string
): Promise<
  | {
      ok: true
      lines: ReturnableLine[]
      customer_name: string | null
      customer_phone: string | null
      original_receipt: {
        id: string
        created_at: Date
        net_amount: number
      }
    }
  | { ok: false; error: string; status: number }
> {
  const original = await prisma.receipt.findFirst({
    where: { id: originalReceiptId, userId, type: 'SALE' },
    include: {
      sales: {
        where: { type: 'SALE' },
        select: {
          productId: true,
          productName: true,
          quantitySold: true,
          unitPriceAtSale: true,
        },
      },
    },
  })

  if (!original) {
    return { ok: false, error: 'Original sale receipt not found', status: 404 }
  }

  const soldByProduct = new Map<
    string,
    { product_name: string; unit_price: number; sold: number }
  >()

  for (const line of original.sales) {
    if (!line.productId) continue
    const existing = soldByProduct.get(line.productId) ?? {
      product_name: line.productName,
      unit_price: Number(line.unitPriceAtSale),
      sold: 0,
    }
    existing.sold += line.quantitySold
    soldByProduct.set(line.productId, existing)
  }

  const returnReceipts = await prisma.receipt.findMany({
    where: {
      userId,
      type: 'RETURN',
      originalReceiptId,
    },
    include: {
      sales: {
        where: { type: 'RETURN' },
        select: { productId: true, quantitySold: true },
      },
    },
  })

  const returnedByProduct = new Map<string, number>()
  for (const receipt of returnReceipts) {
    for (const line of receipt.sales) {
      if (!line.productId) continue
      returnedByProduct.set(
        line.productId,
        (returnedByProduct.get(line.productId) ?? 0) + line.quantitySold
      )
    }
  }

  const lines: ReturnableLine[] = []
  for (const [productId, info] of soldByProduct) {
    const already = returnedByProduct.get(productId) ?? 0
    const returnable = Math.max(0, info.sold - already)
    if (returnable <= 0) continue
    lines.push({
      product_id: productId,
      product_name: info.product_name,
      unit_price_at_sale: info.unit_price,
      sold_quantity: info.sold,
      already_returned: already,
      returnable_quantity: returnable,
    })
  }

  return {
    ok: true,
    lines,
    customer_name: original.customerName,
    customer_phone: original.customerPhone,
    original_receipt: {
      id: original.id,
      created_at: original.createdAt,
      net_amount: Number(original.netAmount),
    },
  }
}

export async function validateReturnAgainstOriginalReceipt(
  userId: string,
  originalReceiptId: string,
  items: Array<{ productId: string; quantity: number }>
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const result = await getReturnableLinesForReceipt(userId, originalReceiptId)
  if (!result.ok) return result

  const cap = new Map(result.lines.map((l) => [l.product_id, l.returnable_quantity]))

  for (const item of items) {
    const max = cap.get(item.productId)
    if (max === undefined) {
      return {
        ok: false,
        error: 'One or more items were not on the original sale',
        status: 400,
      }
    }
    if (item.quantity > max) {
      const line = result.lines.find((l) => l.product_id === item.productId)
      return {
        ok: false,
        error: `Cannot return ${item.quantity} of "${line?.product_name ?? 'item'}". Only ${max} left to return on this sale.`,
        status: 400,
      }
    }
  }

  return { ok: true }
}
