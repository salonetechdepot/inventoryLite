import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'
import { resolveCheckoutPayment } from '@/lib/checkout-payment'

// GET all sales for current user
export async function GET(request: Request) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const typeFilter = searchParams.get('type')

    const sales = await prisma.sale.findMany({
      where: {
        tenantId: session.tenantId,
        ...(typeFilter === 'sale' ? { type: 'SALE' } : {}),
        ...(typeFilter === 'return' ? { type: 'RETURN' } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    })

    const formattedSales = sales.map((sale) => ({
      id: sale.id,
      type: sale.type,
      product_id: sale.productId,
      product_name: sale.productName,
      customer_name: sale.customerName,
      customer_phone: sale.customerPhone,
      discount_amount: Number(sale.discountAmount ?? 0),
      amount_paid: Number(sale.amountPaid ?? 0),
      change_given: Number(sale.changeGiven ?? 0),
      amount_due: Number(sale.amountDue ?? 0),
      is_part_payment: sale.isPartPayment,
      quantity_sold: sale.quantitySold,
      unit_price_at_sale: Number(sale.unitPriceAtSale),
      total_amount: Number(sale.totalAmount),
      created_at: sale.createdAt
    }))

    return NextResponse.json({ sales: formattedSales })
  } catch (error) {
    console.error('Get sales error:', error)
    return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 })
  }
}

// POST record a new sale
export async function POST(request: Request) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const {
      productId,
      quantity,
      customerName,
      customerPhone,
      discountAmount = 0,
      amountPaid = 0,
      isPartPayment = false
    } = await request.json()

    if (!productId || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Product and valid quantity required' }, { status: 400 })
    }

    // Get product details
    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId: session.tenantId },
      select: { id: true, name: true, quantity: true, unitPrice: true }
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const currentStock = product.quantity ?? 0
    const unitPrice = Number(product.unitPrice ?? 0)
    const productName = product.name

    if (currentStock < quantity) {
      return NextResponse.json({ 
        error: `Not enough stock. Only ${currentStock} available.` 
      }, { status: 400 })
    }

    const totalAmount = quantity * unitPrice
    const safeDiscount = Math.max(0, Number(discountAmount || 0))
    const netAmount = Math.max(0, totalAmount - safeDiscount)
  const {
    amountReceived,
    changeGiven,
    amountDue,
  } = resolveCheckoutPayment({
    netAmount,
    amountTendered: Number(amountPaid || 0),
    isPartPayment: Boolean(isPartPayment),
  })
  const storeIsPartPayment = amountDue > 0

  if (amountDue > 0) {
    const name = typeof customerName === 'string' ? customerName.trim() : ''
    const phone = typeof customerPhone === 'string' ? customerPhone.trim() : ''
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

  // Record sale
  const [saleResult] = await prisma.$transaction([
    prisma.sale.create({
      data: {
        tenantId: session.tenantId,
        productId,
        type: 'SALE',
        productName,
        customerName: customerName?.trim() || null,
        customerPhone: customerPhone?.trim() || null,
        discountAmount: safeDiscount,
        amountPaid: amountReceived,
        amountDue,
        changeGiven,
        isPartPayment: storeIsPartPayment,
          quantitySold: quantity,
          unitPriceAtSale: unitPrice,
          totalAmount
        }
      }),
      prisma.product.update({
        where: { id: productId },
        data: {
          quantity: {
            decrement: quantity
          },
          updatedAt: new Date()
        }
      })
    ])

    return NextResponse.json({ 
      sale: {
        id: saleResult.id,
        product_name: saleResult.productName,
        quantity_sold: saleResult.quantitySold,
        total_amount: Number(saleResult.totalAmount),
        created_at: saleResult.createdAt
      },
      newStock: currentStock - quantity
    })
  } catch (error) {
    console.error('Record sale error:', error)
    return NextResponse.json({ error: 'Failed to record sale' }, { status: 500 })
  }
}
