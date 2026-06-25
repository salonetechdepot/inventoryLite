import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatProductResponse } from '@/lib/format-product'
import { parseSpecifications } from '@/lib/product-specifications'
import {
  moneySchema,
  parseJsonBody,
  quantitySchema,
  trimmedString,
  uuidSchema,
  validateRouteId,
} from '@/lib/api-validation'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'

const productPatchSchema = z.object({
  name: trimmedString(255).optional(),
  quantity: quantitySchema.optional(),
  unitPrice: moneySchema.optional(),
  costPrice: moneySchema.nullish(),
  lowStockThreshold: quantitySchema.optional(),
  categoryId: uuidSchema.nullish(),
  imageUrl: z.string().trim().max(500).nullish(),
  scanCode: z.string().trim().max(255).nullish(),
  tags: z.array(z.string().trim().min(1).max(50)).max(25).optional(),
  hasSpecifications: z.boolean().optional(),
  specifications: z.unknown().optional(),
})

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
    const invalidId = validateRouteId(id)
    if (invalidId) return invalidId

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
    const invalidId = validateRouteId(id)
    if (invalidId) return invalidId

    const parsed = await parseJsonBody(request, productPatchSchema)
    if (!parsed.ok) return parsed.response

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
    } = parsed.data

    const existingProduct = await prisma.product.findFirst({
      where: { id, userId: session.userId }
    })

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId: session.userId },
        select: { id: true },
      })
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
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
        costPrice: costPrice === undefined ? undefined : costPrice,
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
    const invalidId = validateRouteId(id)
    if (invalidId) return invalidId

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
