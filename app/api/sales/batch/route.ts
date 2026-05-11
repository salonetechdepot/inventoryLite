import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface SaleItem {
  productId: string
  quantity: number
}

type TransactionType = 'sale' | 'return'

// POST record multiple sales at once (cart checkout)
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
      isPartPayment = false
    } = await request.json() as {
      items: SaleItem[]
      type?: TransactionType
      customerName?: string
      customerPhone?: string
      discountAmount?: number
      amountPaid?: number
      isPartPayment?: boolean
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    // Validate all items have valid quantities
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: 'Invalid item in cart' }, { status: 400 })
      }
    }

    // Get all product details
    const productIds = items.map(item => item.productId)
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        userId: session.userId
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        unitPrice: true
      }
    })

    // Create a map for easy lookup
    const productMap = new Map(products.map(p => [p.id, p]))

    // Validate products exist (allow overselling - stock can go negative)
    for (const item of items) {
      const product = productMap.get(item.productId)
      if (!product) {
        return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 404 })
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

    // Process all transactions
    const salesResults = []
    for (const item of items) {
      const product = productMap.get(item.productId)!
      const unitPrice = Number(product.unitPrice ?? 0)
      const totalAmount = item.quantity * unitPrice
      const quantityUpdate = isReturn
        ? { increment: item.quantity }
        : { decrement: item.quantity }

      // Record sale and update stock in a single transaction for consistency.
      const [saleResult] = await prisma.$transaction([
        prisma.sale.create({
          data: {
            userId: session.userId,
            productId: item.productId,
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
            totalAmount
          }
        }),
        prisma.product.update({
          where: { id: item.productId },
          data: {
            quantity: quantityUpdate,
            updatedAt: new Date()
          }
        })
      ])

      salesResults.push({
        id: saleResult.id,
        type: saleResult.type,
        customer_name: saleResult.customerName,
        customer_phone: saleResult.customerPhone,
        discount_amount: Number(saleResult.discountAmount ?? 0),
        amount_paid: Number(saleResult.amountPaid ?? 0),
        change_given: Number(saleResult.changeGiven ?? 0),
        amount_due: Number(saleResult.amountDue ?? 0),
        is_part_payment: saleResult.isPartPayment,
        product_name: saleResult.productName,
        quantity_sold: saleResult.quantitySold,
        total_amount: Number(saleResult.totalAmount),
        created_at: saleResult.createdAt
      })
    }

    // Calculate total
    const totalAmount = salesResults.reduce((sum, sale) => sum + Number(sale.total_amount), 0)

    return NextResponse.json({ 
      success: true,
      type: isReturn ? 'return' : 'sale',
      sales: salesResults,
      subtotal,
      discountAmount: safeDiscount,
      netAmount,
      amountPaid: safeAmountPaid,
      amountDue,
      changeGiven,
      totalAmount,
      itemCount: items.length
    })
  } catch (error) {
    console.error('Batch sale error:', error)
    return NextResponse.json({ error: 'Failed to process sales' }, { status: 500 })
  }
}
