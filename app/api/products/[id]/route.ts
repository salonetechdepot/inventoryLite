import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET single product
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const product = await prisma.product.findFirst({
      where: {
        id,
        userId: session.userId
      },
      include: {
        category: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

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
        created_at: product.createdAt,
        updated_at: product.updatedAt,
        category_id: product.category?.id ?? null,
        category_name: product.category?.name ?? null
      }
    })
  } catch (error) {
    console.error('Get product error:', error)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}

// PATCH update product
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
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

    const existingProduct = await prisma.product.findFirst({
      where: { id, userId: session.userId }
    })

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name: name ?? undefined,
        scanCode: scanCode === undefined ? undefined : (scanCode?.trim() || null),
        tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim()) : undefined,
        hasSpecifications: hasSpecifications === undefined ? undefined : Boolean(hasSpecifications),
        quantity: quantity ?? undefined,
        unitPrice: unitPrice ?? undefined,
        lowStockThreshold: lowStockThreshold ?? undefined,
        categoryId: categoryId ?? undefined,
        imageUrl: imageUrl ?? null,
        updatedAt: new Date()
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
        updated_at: product.updatedAt
      }
    })
  } catch (error) {
    console.error('Update product error:', error)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

// DELETE product
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const existingProduct = await prisma.product.findFirst({
      where: { id, userId: session.userId },
      select: { id: true }
    })

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    await prisma.product.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete product error:', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
