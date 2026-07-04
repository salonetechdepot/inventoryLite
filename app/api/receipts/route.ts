import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

// GET all receipts for current user with their sales + payments.
// Query params: type=sale|return, status=paid|unpaid|all, limit, offset
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500)
    const offset = parseInt(searchParams.get('offset') || '0')
    const typeFilter = searchParams.get('type')
    const statusFilter = searchParams.get('status') || 'all'

    const where: Prisma.ReceiptWhereInput = { tenantId: session.tenantId }
    if (typeFilter === 'sale') where.type = 'SALE'
    if (typeFilter === 'return') where.type = 'RETURN'
    if (statusFilter === 'paid') where.isPaid = true
    if (statusFilter === 'unpaid') where.isPaid = false

    const receipts = await prisma.receipt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        originalReceipt: {
          select: {
            id: true,
            createdAt: true,
            netAmount: true,
          },
        },
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

    const formatted = receipts.map((receipt) => ({
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
      original_receipt: receipt.originalReceipt
        ? {
            id: receipt.originalReceipt.id,
            created_at: receipt.originalReceipt.createdAt,
            net_amount: Number(receipt.originalReceipt.netAmount),
          }
        : null,
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
    }))

    return NextResponse.json({ receipts: formatted })
  } catch (error) {
    console.error('Get receipts error:', error)
    return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
  }
}
