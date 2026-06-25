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
} from '@/lib/api-validation'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'

const productCreateSchema = z.object({
  name: trimmedString(255),
  quantity: quantitySchema.optional().default(0),
  unitPrice: moneySchema.optional().default(0),
  costPrice: moneySchema.nullish(),
  lowStockThreshold: quantitySchema.optional().default(5),
  categoryId: uuidSchema.nullish(),
  imageUrl: z.string().trim().max(500).nullish(),
  scanCode: z.string().trim().max(255).nullish(),
  tags: z.array(z.string().trim().min(1).max(50)).max(25).optional().default([]),
  hasSpecifications: z.boolean().optional().default(false),
  specifications: z.unknown().optional(),
})

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

    const parsed = await parseJsonBody(request, productCreateSchema)
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

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId: session.userId },
        select: { id: true },
      })
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
    }

    const product = await prisma.product.create({
      data: {
        userId: session.userId,
        categoryId: categoryId || null,
        name,
        scanCode: scanCode?.trim() || null,
        tags,
        hasSpecifications: Boolean(hasSpecifications),
        specifications: parseSpecifications(specifications) as Prisma.InputJsonValue,
        quantity,
        unitPrice,
        costPrice: costPrice ?? null,
        lowStockThreshold,
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
