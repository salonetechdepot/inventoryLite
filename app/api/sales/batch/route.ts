import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface SaleItem {
  productId: string
  quantity: number
}

// POST record multiple sales at once (cart checkout)
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { items } = await request.json() as { items: SaleItem[] }

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

    // Process all sales
    const salesResults = []
    for (const item of items) {
      const product = productMap.get(item.productId)!
      const unitPrice = Number(product.unitPrice ?? 0)
      const totalAmount = item.quantity * unitPrice

      // Record sale and update stock in a single transaction for consistency.
      const [saleResult] = await prisma.$transaction([
        prisma.sale.create({
          data: {
            userId: session.userId,
            productId: item.productId,
            productName: product.name,
            quantitySold: item.quantity,
            unitPriceAtSale: unitPrice,
            totalAmount
          }
        }),
        prisma.product.update({
          where: { id: item.productId },
          data: {
            quantity: {
              decrement: item.quantity
            },
            updatedAt: new Date()
          }
        })
      ])

      salesResults.push({
        id: saleResult.id,
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
      sales: salesResults,
      totalAmount,
      itemCount: items.length
    })
  } catch (error) {
    console.error('Batch sale error:', error)
    return NextResponse.json({ error: 'Failed to process sales' }, { status: 500 })
  }
}
