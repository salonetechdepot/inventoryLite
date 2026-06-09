import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatProductResponse } from '@/lib/format-product'
import { parseSpecifications } from '@/lib/product-specifications'
import type { Prisma } from '@prisma/client'

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

    const formattedProducts = products.map((product) => formatProductResponse(product))

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
      costPrice,
      lowStockThreshold,
      categoryId,
      imageUrl,
      scanCode,
      tags,
      hasSpecifications,
      specifications,
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
        specifications: parseSpecifications(specifications) as Prisma.InputJsonValue,
        quantity: quantity || 0,
        unitPrice: unitPrice || 0,
        costPrice: costPrice != null && costPrice !== '' ? Number(costPrice) : null,
        lowStockThreshold: lowStockThreshold || 5,
        imageUrl: imageUrl || null,
      },
      include: {
        category: { select: { id: true, name: true, icon: true } },
      },
    })

    return NextResponse.json({
      product: formatProductResponse(product),
    })
  } catch (error) {
    console.error('Create product error:', error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
