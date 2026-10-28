import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import {
  idempotencyKeyFromRequest,
  moneySchema,
  parseJsonBody,
  positiveQuantitySchema,
  trimmedString,
  entityIdSchema,
  uuidSchema,
} from '@/lib/api-validation'
import { decrementProductStockForSale, adjustProductStock } from '@/lib/warehouse'
import {
  isReturnCondition,
  isReturnDisposition,
  restockQuantityForLine,
  type ReturnCondition,
  type ReturnDisposition,
} from '@/lib/return-inventory'
import { validateReturnAgainstOriginalReceipt } from '@/lib/return-from-sale'
import { parseSpecifications, saleLineProductName } from '@/lib/product-specifications'
import { resolveCheckoutPayment } from '@/lib/checkout-payment'
import { describeDbError } from '@/lib/db-error'
import {
  findIdempotentResponse,
  replayAfterUniqueConflict,
  saveIdempotentResponse,
} from '@/lib/server/idempotency'
import { z } from 'zod'

const IDEMPOTENCY_ROUTE = 'sales.batch'

interface SaleItem {
  productId: string
  quantity: number
  returnCondition?: ReturnCondition
  returnDisposition?: ReturnDisposition
}

type TransactionType = 'sale' | 'return'

const saleItemSchema = z.object({
  productId: entityIdSchema,
  quantity: positiveQuantitySchema,
  returnCondition: z.enum(['SEALED', 'OPENED', 'DAMAGED']).optional(),
  returnDisposition: z.enum(['RESTOCK', 'DISCARD']).optional(),
})

const batchSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1).max(100),
  type: z.enum(['sale', 'return']).optional().default('sale'),
  customerName: z.string().trim().max(255).nullish(),
  customerPhone: z.string().trim().max(50).nullish(),
  discountAmount: moneySchema.optional().default(0),
  amountPaid: moneySchema.optional().default(0),
  isPartPayment: z.boolean().optional().default(false),
  paymentMethod: trimmedString(50).nullish().default('cash'),
  notes: z.string().trim().max(500).nullish(),
  originalReceiptId: uuidSchema.nullish(),
  // Client-only fields used while offline — ignore if present
  _offlineReceiptId: z.string().optional(),
  _offlineTempId: z.string().optional(),
})

class InsufficientStockError extends Error {
  constructor(productName: string) {
    super(`Not enough stock for ${productName}`)
  }
}

// POST record a checkout (cart -> single Receipt with multiple Sale lines + initial Payment)
export async function POST(request: Request) {
  const idempotencyKey = idempotencyKeyFromRequest(request)
  let tenantId: string | null = null
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult
    tenantId = session.tenantId

    const existing = await findIdempotentResponse(session.tenantId, IDEMPOTENCY_ROUTE, idempotencyKey)
    if (existing) {
      return NextResponse.json(existing)
    }

    const parsed = await parseJsonBody(request, batchSaleSchema)
    if (!parsed.ok) return parsed.response

    const {
      items,
      type = 'sale',
      customerName,
      customerPhone,
      discountAmount = 0,
      amountPaid = 0,
      isPartPayment = false,
      paymentMethod = 'cash',
      notes,
      originalReceiptId,
    } = parsed.data

    const isReturn = type === 'return'

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: 'Invalid item in cart' }, { status: 400 })
      }
      if (isReturn) {
        if (!isReturnCondition(item.returnCondition)) {
          return NextResponse.json(
            { error: 'Each returned item needs a condition (sealed, opened, or damaged)' },
            { status: 400 }
          )
        }
        if (!isReturnDisposition(item.returnDisposition)) {
          return NextResponse.json(
            { error: 'Each returned item needs restock or discard disposition' },
            { status: 400 }
          )
        }
      }
    }

    const productIds = items.map((item) => item.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: session.tenantId },
      select: {
        id: true,
        name: true,
        quantity: true,
        price: true,
        meta: { select: { specifications: true } },
      },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    for (const item of items) {
      if (!productMap.get(item.productId)) {
        return NextResponse.json(
          { error: `Product not found: ${item.productId}` },
          { status: 404 }
        )
      }
    }

    const linkedOriginalId =
      isReturn && typeof originalReceiptId === 'string' && originalReceiptId.trim()
        ? originalReceiptId.trim()
        : null

    if (linkedOriginalId) {
      const validation = await validateReturnAgainstOriginalReceipt(
        session.tenantId,
        linkedOriginalId,
        items
      )
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: validation.status })
      }
    }

    const subtotal = items.reduce((sum, item) => {
      const product = productMap.get(item.productId)!
      return sum + item.quantity * Number(product.price ?? 0)
    }, 0)
    const safeDiscount = Math.max(0, Number(discountAmount || 0))
    const netAmount = Math.max(0, subtotal - safeDiscount)
    const {
      amountReceived,
      changeGiven,
      amountDue,
      isPaid,
      isPartPayment: storeIsPartPayment,
    } = resolveCheckoutPayment({
      netAmount,
      amountTendered: Number(amountPaid || 0),
      isPartPayment: Boolean(isPartPayment),
    })

    if (!isReturn && amountDue > 0) {
      const name = customerName?.trim() || ''
      const phone = customerPhone?.trim() || ''
      if (!name && !phone) {
        return NextResponse.json(
          {
            error:
              'Customer name or phone is required for credit / part payment so you can track who owes the balance.',
          },
          { status: 400 }
        )
      }
    }

    // Single DB transaction: receipt + sales + product stock updates + initial payment
    const response = await prisma.$transaction(async (tx) => {
      const now = new Date()
      const receipt = await tx.receipt.create({
        data: {
          tenantId: session.tenantId,
          type: isReturn ? 'RETURN' : 'SALE',
          customerName: customerName?.trim() || null,
          customerPhone: customerPhone?.trim() || null,
          subtotal,
          discountAmount: safeDiscount,
          netAmount,
          amountPaid: amountReceived,
          amountDue,
          changeGiven,
          isPartPayment: storeIsPartPayment,
          isPaid,
          notes: notes?.trim() || null,
          originalReceiptId: linkedOriginalId,
          createdAt: now,
          updatedAt: now,
        },
      })

      const createdSales: Prisma.SaleGetPayload<Prisma.SaleDefaultArgs>[] = []
      for (const item of items) {
        const product = productMap.get(item.productId)!
        const unitPrice = Number(product.price ?? 0)
        const totalAmount = item.quantity * unitPrice
        const restockQty = isReturn
          ? restockQuantityForLine(item.quantity, item.returnDisposition)
          : 0
        const lineProductName = saleLineProductName(
          product.name,
          parseSpecifications(product.meta?.specifications)
        )

        const sale = await tx.sale.create({
          data: {
            tenantId: session.tenantId,
            productId: item.productId,
            receiptId: receipt.id,
            type: isReturn ? 'RETURN' : 'SALE',
            productName: lineProductName,
            customerName: customerName?.trim() || null,
            customerPhone: customerPhone?.trim() || null,
            discountAmount: safeDiscount,
            amountPaid: amountReceived,
            changeGiven,
            amountDue,
            isPartPayment: storeIsPartPayment,
            quantitySold: item.quantity,
            unitPriceAtSale: unitPrice,
            totalAmount,
            returnCondition: isReturn ? item.returnCondition : null,
            returnDisposition: isReturn ? item.returnDisposition : null,
          },
        })
        createdSales.push(sale)

        if (isReturn) {
          if (restockQty > 0) {
            const next = await adjustProductStock(
              session.tenantId,
              item.productId,
              restockQty,
              tx
            )
            if (next === null) throw new InsufficientStockError(product.name)
          }
        } else {
          await decrementProductStockForSale(
            session.tenantId,
            item.productId,
            item.quantity,
            tx
          )
        }
      }

      if (amountReceived > 0) {
        await tx.payment.create({
          data: {
            tenantId: session.tenantId,
            receiptId: receipt.id,
            amount: amountReceived,
            method: paymentMethod?.trim() || 'cash',
            note: 'initial payment',
          },
        })
      }

      const responseJson = {
        success: true,
        type: isReturn ? 'return' : 'sale',
        receipt: {
          id: receipt.id,
          type: receipt.type,
          customer_name: receipt.customerName,
          customer_phone: receipt.customerPhone,
          subtotal: Number(receipt.subtotal),
          discount_amount: Number(receipt.discountAmount),
          net_amount: Number(receipt.netAmount),
          amount_paid: Number(receipt.amountPaid),
          amount_due: Number(receipt.amountDue),
          change_given: Number(receipt.changeGiven),
          is_part_payment: receipt.isPartPayment,
          is_paid: receipt.isPaid,
          notes: receipt.notes,
          original_receipt_id: receipt.originalReceiptId,
          created_at: receipt.createdAt,
        },
        sales: createdSales.map((sale) => ({
          id: sale.id,
          receipt_id: sale.receiptId,
          type: sale.type,
          product_name: sale.productName,
          quantity_sold: sale.quantitySold,
          unit_price_at_sale: Number(sale.unitPriceAtSale),
          total_amount: Number(sale.totalAmount),
          return_condition: sale.returnCondition,
          return_disposition: sale.returnDisposition,
          created_at: sale.createdAt,
        })),
        itemCount: items.length,
      }

      await saveIdempotentResponse(
        tx,
        session.tenantId,
        IDEMPOTENCY_ROUTE,
        idempotencyKey,
        responseJson
      )

      return responseJson
    })

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (tenantId) {
      const replay = await replayAfterUniqueConflict(error, tenantId, IDEMPOTENCY_ROUTE, idempotencyKey)
      if (replay) return NextResponse.json(replay)
    }
    console.error('Batch sale error:', error)
    return NextResponse.json(
      { error: describeDbError(error, 'Could not save this sale') },
      { status: 500 }
    )
  }
}
