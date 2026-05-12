import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

interface SaleItem {
  productId: string
  quantity: number
}

type TransactionType = 'sale' | 'return'

// POST record a checkout (cart -> single Receipt with multiple Sale lines + initial Payment)
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
    } = (await request.json()) as {
      items: SaleItem[]
      type?: TransactionType
      customerName?: string
      customerPhone?: string
      discountAmount?: number
      amountPaid?: number
      isPartPayment?: boolean
      paymentMethod?: string
      notes?: string
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: 'Invalid item in cart' }, { status: 400 })
      }
    }

    const productIds = items.map((item) => item.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, userId: session.userId },
      select: { id: true, name: true, quantity: true, unitPrice: true },
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

    const isReturn = type === 'return'
    const subtotal = items.reduce((sum, item) => {
      const product = productMap.get(item.productId)!
      return sum + item.quantity * Number(product.unitPrice ?? 0)
    }, 0)
    const safeDiscount = Math.max(0, Number(discountAmount || 0))
    const netAmount = Math.max(0, subtotal - safeDiscount)
    const safeAmountPaid = Math.max(0, Number(amountPaid || 0))
    const negotiatedShortfall = Math.max(0, netAmount - safeAmountPaid)
    const amountDue = isPartPayment ? negotiatedShortfall : 0
    const changeGiven = Math.max(0, safeAmountPaid - netAmount)
    const isPaid = amountDue <= 0

    // Single DB transaction: receipt + sales + product stock updates + initial payment
    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          userId: session.userId,
          type: isReturn ? 'RETURN' : 'SALE',
          customerName: customerName?.trim() || null,
          customerPhone: customerPhone?.trim() || null,
          subtotal,
          discountAmount: safeDiscount,
          netAmount,
          amountPaid: safeAmountPaid,
          amountDue,
          changeGiven,
          isPartPayment: Boolean(isPartPayment),
          isPaid,
          notes: notes?.trim() || null,
        },
      })

      const createdSales: Prisma.SaleGetPayload<Prisma.SaleDefaultArgs>[] = []
      for (const item of items) {
        const product = productMap.get(item.productId)!
        const unitPrice = Number(product.unitPrice ?? 0)
        const totalAmount = item.quantity * unitPrice
        const quantityUpdate = isReturn
          ? { increment: item.quantity }
          : { decrement: item.quantity }

        const sale = await tx.sale.create({
          data: {
            userId: session.userId,
            productId: item.productId,
            receiptId: receipt.id,
            type: isReturn ? 'RETURN' : 'SALE',
            productName: product.name,
            customerName: customerName?.trim() || null,
            customerPhone: customerPhone?.trim() || null,
            discountAmount: safeDiscount,
            amountPaid: safeAmountPaid,
            changeGiven,
            amountDue,
            isPartPayment: Boolean(isPartPayment),
            quantitySold: item.quantity,
            unitPriceAtSale: unitPrice,
            totalAmount,
          },
        })
        createdSales.push(sale)

        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: quantityUpdate, updatedAt: new Date() },
        })
      }

      if (safeAmountPaid > 0) {
        await tx.payment.create({
          data: {
            userId: session.userId,
            receiptId: receipt.id,
            amount: safeAmountPaid,
            method: paymentMethod?.trim() || 'cash',
            note: 'initial payment',
          },
        })
      }

      return { receipt, sales: createdSales }
    })

    return NextResponse.json({
      success: true,
      type: isReturn ? 'return' : 'sale',
      receipt: {
        id: result.receipt.id,
        type: result.receipt.type,
        customer_name: result.receipt.customerName,
        customer_phone: result.receipt.customerPhone,
        subtotal: Number(result.receipt.subtotal),
        discount_amount: Number(result.receipt.discountAmount),
        net_amount: Number(result.receipt.netAmount),
        amount_paid: Number(result.receipt.amountPaid),
        amount_due: Number(result.receipt.amountDue),
        change_given: Number(result.receipt.changeGiven),
        is_part_payment: result.receipt.isPartPayment,
        is_paid: result.receipt.isPaid,
        notes: result.receipt.notes,
        created_at: result.receipt.createdAt,
      },
      sales: result.sales.map((sale) => ({
        id: sale.id,
        receipt_id: sale.receiptId,
        type: sale.type,
        product_name: sale.productName,
        quantity_sold: sale.quantitySold,
        unit_price_at_sale: Number(sale.unitPriceAtSale),
        total_amount: Number(sale.totalAmount),
        created_at: sale.createdAt,
      })),
      itemCount: items.length,
    })
  } catch (error) {
    console.error('Batch sale error:', error)
    return NextResponse.json({ error: 'Failed to process sales' }, { status: 500 })
  }
}
