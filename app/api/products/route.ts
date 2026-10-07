import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'
import {
  defaultProductCreateFields,
  formatProductResponse,
  productInclude,
} from '@/lib/product-db'
import { parseSpecifications } from '@/lib/product-specifications'
import {
  entityIdSchema,
  moneySchema,
  parseJsonBody,
  quantitySchema,
  trimmedString,
} from '@/lib/api-validation'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { isValidScanCode } from '@/lib/scan-code'
import { newEntityId } from '@/lib/entity-id'
import { ensureDefaultWarehouse, setProductStock } from '@/lib/warehouse'

const productCreateSchema = z.object({
  name: trimmedString(255),
  quantity: quantitySchema.optional().default(0),
  unitPrice: moneySchema.optional().default(0),
  costPrice: moneySchema.nullish(),
  lowStockThreshold: quantitySchema.optional().default(5),
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
  tags: z.array(z.string().trim().min(1).max(50)).max(25).optional().default([]),
  hasSpecifications: z.boolean().optional().default(false),
  specifications: z.unknown().optional(),
})

export async function GET() {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const products = await prisma.product.findMany({
      where: { tenantId: session.tenantId, isRetired: false },
      orderBy: { name: 'asc' },
      include: productInclude,
    })

    return NextResponse.json({
      products: products.map((product) => formatProductResponse(product)),
    })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

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
        where: { id: categoryId, tenantId: session.tenantId },
        select: { id: true },
      })
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
    }

    const productId = newEntityId()
    const barcode = scanCode?.trim() || `LITE-${productId.slice(0, 12)}`
    const sku = barcode

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...defaultProductCreateFields({
            id: productId,
            tenantId: session.tenantId,
            name,
            barcode,
            sku,
            price: unitPrice,
            quantity,
            lowStockThreshold,
            categoryId,
            imageUrl,
            hasSpecifications,
          }),
          meta: {
            create: {
              tenantId: session.tenantId,
              tags,
              costPrice: costPrice ?? null,
              specifications: parseSpecifications(specifications) as Prisma.InputJsonValue,
            },
          },
        },
        include: productInclude,
      })

      const warehouse = await ensureDefaultWarehouse(session.tenantId, tx)
      await setProductStock(session.tenantId, productId, warehouse.id, quantity, tx)
      return created
    })

    return NextResponse.json({
      product: formatProductResponse(product),
    })
  } catch (error) {
    console.error('Create product error:', error)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'This scan code is already used by another product.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
