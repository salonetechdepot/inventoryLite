import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET all products for current user
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const products = await prisma.product.findMany({
      where: { userId: session.userId },
      orderBy: { name: 'asc' },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            icon: true
          }
        }
      }
    })

    const formattedProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      scan_code: product.scanCode,
      tags: product.tags,
      has_specifications: product.hasSpecifications,
      quantity: product.quantity ?? 0,
      unit_price: Number(product.unitPrice ?? 0),
      low_stock_threshold: product.lowStockThreshold ?? 5,
      image_url: product.imageUrl,
      created_at: product.createdAt,
      updated_at: product.updatedAt,
      category_id: product.category?.id ?? null,
      category_name: product.category?.name ?? null,
      category_icon: product.category?.icon ?? null
    }))

    return NextResponse.json({ products: formattedProducts })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

// POST create new product
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      name,
      quantity,
      unitPrice,
      lowStockThreshold,
      categoryId,
      imageUrl,
      scanCode,
      tags,
      hasSpecifications
    } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    const product = await prisma.product.create({
      data: {
        userId: session.userId,
        categoryId: categoryId || null,
        name,
        scanCode: scanCode?.trim() || null,
        tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim()) : [],
        hasSpecifications: Boolean(hasSpecifications),
        quantity: quantity || 0,
        unitPrice: unitPrice || 0,
        lowStockThreshold: lowStockThreshold || 5,
        imageUrl: imageUrl || null
      }
    })

    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        scan_code: product.scanCode,
        tags: product.tags,
        has_specifications: product.hasSpecifications,
        quantity: product.quantity ?? 0,
        unit_price: Number(product.unitPrice ?? 0),
        low_stock_threshold: product.lowStockThreshold ?? 5,
        image_url: product.imageUrl,
        created_at: product.createdAt
      }
    })
  } catch (error) {
    console.error('Create product error:', error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
