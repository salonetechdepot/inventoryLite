import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatProductResponse } from '@/lib/format-product'
import { parseSpecifications } from '@/lib/product-specifications'
import type { Prisma } from '@prisma/client'

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
      product: formatProductResponse(product),
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
      costPrice,
      lowStockThreshold,
      categoryId,
      imageUrl,
      scanCode,
      tags,
      hasSpecifications,
      specifications,
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
        specifications:
          specifications === undefined
            ? undefined
            : (parseSpecifications(specifications) as Prisma.InputJsonValue),
        quantity: quantity ?? undefined,
        unitPrice: unitPrice ?? undefined,
        costPrice:
          costPrice === undefined
            ? undefined
            : costPrice === null || costPrice === ''
              ? null
              : Number(costPrice),
        lowStockThreshold: lowStockThreshold ?? undefined,
        categoryId: categoryId ?? undefined,
        imageUrl: imageUrl ?? null,
        updatedAt: new Date(),
      },
      include: {
        category: { select: { id: true, name: true, icon: true } },
      },
    })

    return NextResponse.json({
      product: formatProductResponse(product),
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
