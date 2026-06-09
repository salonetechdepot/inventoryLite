import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET a single receipt by id with its sales and payments (used to reprint).
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params

    const receipt = await prisma.receipt.findFirst({
      where: { id, userId: session.userId },
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
            returnCondition: true,
            returnDisposition: true,
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

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    return NextResponse.json({
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
    })
  } catch (error) {
    console.error('Get receipt error:', error)
    return NextResponse.json({ error: 'Failed to fetch receipt' }, { status: 500 })
  }
}
