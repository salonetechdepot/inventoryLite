import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma, type Prisma } from '@/lib/prisma'
import {
  idempotencyKeyFromRequest,
  moneySchema,
  parseJsonBody,
  validateRouteId,
} from '@/lib/api-validation'
import { describeDbError } from '@/lib/db-error'
import {
  findIdempotentResponse,
  replayAfterUniqueConflict,
  saveIdempotentResponse,
} from '@/lib/server/idempotency'
import { z } from 'zod'

const IDEMPOTENCY_ROUTE = 'receipts.payments'

const paymentReceiptInclude = {
  sales: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      productId: true,
      productName: true,
      quantitySold: true,
      unitPriceAtSale: true,
      totalAmount: true,
      returnCondition: true,
      returnDisposition: true,
      createdAt: true,
    },
  },
  payments: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      amount: true,
      method: true,
      note: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ReceiptInclude

const paymentCreateSchema = z.object({
  amount: moneySchema.refine((amount) => amount > 0, 'Amount must be greater than zero'),
  method: z.string().trim().min(1).max(32).optional().default('cash'),
  // The collect form sends null when the note box is empty.
  note: z.string().trim().max(255).nullish(),
})

// POST record an extra payment toward a part-payment receipt.
// Body: { amount: number, method?: string, note?: string }
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const idempotencyKey = idempotencyKeyFromRequest(request)
  let tenantId: string | null = null
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult
    tenantId = session.tenantId

    const { id } = await context.params
    const invalidId = validateRouteId(id)
    if (invalidId) return invalidId

    const existing = await findIdempotentResponse(session.tenantId, IDEMPOTENCY_ROUTE, idempotencyKey)
    if (existing) return NextResponse.json(existing)

    const parsed = await parseJsonBody(request, paymentCreateSchema)
    if (!parsed.ok) return parsed.response

    const { amount: amountValue, method, note } = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.findFirst({
        where: { id, tenantId: session.tenantId },
        include: { payments: true },
      })
      if (!receipt) return { notFound: true as const }

      if (receipt.type !== 'SALE') {
        return { notAllowed: true as const, reason: 'Only sales can receive additional payments' }
      }
      if (receipt.isPaid) {
        return { notAllowed: true as const, reason: 'Receipt is already fully paid' }
      }

      const currentPaid = Number(receipt.amountPaid)
      const currentDue = Number(receipt.amountDue)
      // Cap the credited amount at the outstanding balance.
      const credited = Math.min(amountValue, currentDue)
      if (credited <= 0) {
        return { notAllowed: true as const, reason: 'No outstanding balance on this receipt' }
      }
      const overflow = amountValue - credited
      const newPaid = currentPaid + credited
      const newDue = Math.max(0, currentDue - credited)
      const newChange = Number(receipt.changeGiven) + overflow
      const nowPaid = newDue <= 0

      await tx.payment.create({
        data: {
          tenantId: session.tenantId,
          receiptId: receipt.id,
          amount: credited,
          method: (method || 'cash').toString().slice(0, 50),
          note: note ? note.toString().slice(0, 255) : null,
        },
      })

      const updated = await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          amountPaid: newPaid,
          amountDue: newDue,
          changeGiven: newChange,
          isPaid: nowPaid,
          isPartPayment: nowPaid ? false : true,
          updatedAt: new Date(),
        },
        include: paymentReceiptInclude,
      })

      // Keep linked Sale rows aligned so legacy queries still report receipt totals.
      await tx.sale.updateMany({
        where: { receiptId: receipt.id },
        data: {
          amountPaid: newPaid,
          amountDue: newDue,
          changeGiven: newChange,
          isPartPayment: nowPaid ? false : true,
        },
      })

      const responseJson = paymentResponse(updated, credited, overflow)
      await saveIdempotentResponse(tx, session.tenantId, IDEMPOTENCY_ROUTE, idempotencyKey, responseJson)
      return { responseJson }
    })

    if ('notFound' in result && result.notFound) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }
    if ('notAllowed' in result && result.notAllowed) {
      return NextResponse.json({ error: result.reason || 'Not allowed' }, { status: 400 })
    }

    if (!('responseJson' in result)) {
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }

    return NextResponse.json(result.responseJson)
  } catch (error) {
    if (tenantId) {
      const replay = await replayAfterUniqueConflict(error, tenantId, IDEMPOTENCY_ROUTE, idempotencyKey)
      if (replay) return NextResponse.json(replay)
    }
    console.error('Add payment error:', error)
    return NextResponse.json(
      { error: describeDbError(error, 'Could not record this payment') },
      { status: 500 }
    )
  }
}

function paymentResponse(
  receipt: Prisma.ReceiptGetPayload<{ include: typeof paymentReceiptInclude }>,
  credited: number,
  overflow: number
) {
  return {
    success: true,
    credited,
    change: overflow,
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
      created_at: receipt.createdAt,
      updated_at: receipt.updatedAt,
      item_count: receipt.sales.length,
      sales: receipt.sales.map((sale) => ({
        id: sale.id,
        product_id: sale.productId,
        product_name: sale.productName,
        quantity_sold: sale.quantitySold,
        unit_price_at_sale: Number(sale.unitPriceAtSale),
        total_amount: Number(sale.totalAmount),
        return_condition: sale.returnCondition,
        return_disposition: sale.returnDisposition,
        created_at: sale.createdAt,
      })),
      payments: receipt.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        note: p.note,
        created_at: p.createdAt,
      })),
    },
  }
}
