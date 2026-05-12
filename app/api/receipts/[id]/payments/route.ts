import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST record an extra payment toward a part-payment receipt.
// Body: { amount: number, method?: string, note?: string }
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const { amount, method = 'cash', note } = await request.json()

    const amountValue = Math.max(0, Number(amount || 0))
    if (amountValue <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.findFirst({
        where: { id, userId: session.userId },
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
      const netAmount = Number(receipt.netAmount)

      // Cap the credited amount at the outstanding balance.
      const credited = Math.min(amountValue, currentDue)
      const overflow = amountValue - credited
      const newPaid = currentPaid + amountValue
      const newDue = Math.max(0, currentDue - credited)
      const newChange = Number(receipt.changeGiven) + overflow
      const nowPaid = newDue <= 0

      await tx.payment.create({
        data: {
          userId: session.userId,
          receiptId: receipt.id,
          amount: amountValue,
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
          isPartPayment: nowPaid ? false : receipt.isPartPayment,
          updatedAt: new Date(),
        },
        include: {
          sales: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              productId: true,
              productName: true,
              quantitySold: true,
              unitPriceAtSale: true,
              totalAmount: true,
              createdAt: true,
            },
          },
          payments: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              amount: true,
              method: true,
              note: true,
              createdAt: true,
            },
          },
        },
      })

      // Keep linked Sale rows aligned so legacy queries still report receipt totals.
      await tx.sale.updateMany({
        where: { receiptId: receipt.id },
        data: {
          amountPaid: newPaid,
          amountDue: newDue,
          changeGiven: newChange,
          isPartPayment: nowPaid ? false : receipt.isPartPayment,
        },
      })

      return {
        receipt: updated,
        credited,
        overflow,
        netAmount,
      }
    })

    if ('notFound' in result && result.notFound) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }
    if ('notAllowed' in result && result.notAllowed) {
      return NextResponse.json({ error: result.reason || 'Not allowed' }, { status: 400 })
    }

    if (!('receipt' in result)) {
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }

    const receipt = result.receipt
    return NextResponse.json({
      success: true,
      credited: result.credited,
      change: result.overflow,
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
    })
  } catch (error) {
    console.error('Add payment error:', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
