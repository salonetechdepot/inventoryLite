import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'
import { formatProductResponse, productInclude } from '@/lib/format-product'
import { parseSpecifications } from '@/lib/product-specifications'
import {
  entityIdSchema,
  moneySchema,
  parseJsonBody,
  quantitySchema,
  trimmedString,
  validateEntityRouteId,
} from '@/lib/api-validation'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { isValidScanCode } from '@/lib/scan-code'
import { ensureDefaultWarehouse, setProductStock } from '@/lib/warehouse'

const productPatchSchema = z.object({
  name: trimmedString(255).optional(),
  quantity: quantitySchema.optional(),
  unitPrice: moneySchema.optional(),
  costPrice: moneySchema.nullish(),
  lowStockThreshold: quantitySchema.optional(),
  categoryId: entityIdSchema.nullish(),
  imageUrl: z.string().trim().max(500).nullish(),
  scanCode: z
    .string()
    .trim()
    .max(255)
    .nullish()
    .refine((val) => !val || isValidScanCode(val), {
      message: 'Scan code may only use letters, numbers, hyphen, underscore, or dot.',
    }),
  tags: z.array(z.string().trim().min(1).max(50)).max(25).optional(),
  hasSpecifications: z.boolean().optional(),
  specifications: z.unknown().optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { id } = await params
    const invalidId = validateEntityRouteId(id)
    if (invalidId) return invalidId

    const product = await prisma.product.findFirst({
      where: { id, tenantId: session.tenantId },
      include: productInclude,
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ product: formatProductResponse(product) })
  } catch (error) {
    console.error('Get product error:', error)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { id } = await params
    const invalidId = validateEntityRouteId(id)
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
      where: { id, tenantId: session.tenantId },
    })

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, tenantId: session.tenantId },
        select: { id: true },
      })
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
    }

    const metaUpdate = {
      tags: Array.isArray(tags)
        ? tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim())
        : undefined,
      costPrice: costPrice === undefined ? undefined : costPrice,
      specifications:
        specifications === undefined
          ? undefined
          : (parseSpecifications(specifications) as Prisma.InputJsonValue),
    }

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          name: name ?? undefined,
          barcode: scanCode === undefined ? undefined : scanCode?.trim() || existingProduct.barcode,
          sku:
            scanCode === undefined
              ? undefined
              : scanCode?.trim() || existingProduct.sku,
          hasSpecifications:
            hasSpecifications === undefined ? undefined : Boolean(hasSpecifications),
          quantity: quantity ?? undefined,
          price: unitPrice ?? undefined,
          lowStockThreshold: lowStockThreshold ?? undefined,
          categoryId: categoryId ?? undefined,
          imageUrl: imageUrl === undefined ? undefined : imageUrl || '',
          updatedAt: new Date(),
          meta: {
            upsert: {
              create: {
                tenantId: session.tenantId,
                tags: metaUpdate.tags ?? [],
                costPrice: metaUpdate.costPrice ?? null,
                specifications: metaUpdate.specifications ?? Prisma.JsonNull,
              },
              update: {
                tags: metaUpdate.tags,
                costPrice: metaUpdate.costPrice,
                specifications: metaUpdate.specifications,
              },
            },
          },
        },
        include: productInclude,
      })

      if (quantity !== undefined) {
        const warehouse = await ensureDefaultWarehouse(session.tenantId, tx)
        await setProductStock(session.tenantId, id, warehouse.id, quantity, tx)
      }

      return updated
    })

    return NextResponse.json({ product: formatProductResponse(product) })
  } catch (error) {
    console.error('Update product error:', error)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'This scan code is already used by another product.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { id } = await params
    const invalidId = validateEntityRouteId(id)
    if (invalidId) return invalidId

    const existingProduct = await prisma.product.findFirst({
      where: { id, tenantId: session.tenantId },
      select: { id: true },
    })

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    await prisma.product.update({
      where: { id },
      data: { isRetired: true, updatedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete product error:', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
