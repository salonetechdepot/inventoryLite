import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET all sales for current user
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const sales = await prisma.sale.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    })

    const formattedSales = sales.map((sale) => ({
      id: sale.id,
      product_id: sale.productId,
      product_name: sale.productName,
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
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { productId, quantity } = await request.json()

    if (!productId || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Product and valid quantity required' }, { status: 400 })
    }

    // Get product details
    const product = await prisma.product.findFirst({
      where: { id: productId, userId: session.userId },
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

    // Record sale
    const [saleResult] = await prisma.$transaction([
      prisma.sale.create({
        data: {
          userId: session.userId,
          productId,
          productName,
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
