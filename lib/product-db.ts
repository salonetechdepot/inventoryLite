import type { Category, Product, RetailCategoryMeta, RetailProductMeta } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { parseSpecifications } from '@/lib/product-specifications'

export type ProductWithLiteRelations = Product & {
  category?: (Category & { meta?: RetailCategoryMeta | null }) | null
  meta?: RetailProductMeta | null
}

export function productScanCode(product: Product): string | null {
  const code = product.barcode?.trim()
  return code || null
}

export function formatProductResponse(product: ProductWithLiteRelations) {
  const specs = product.meta?.specifications ?? null
  return {
    id: product.id,
    name: product.name,
    scan_code: productScanCode(product),
    tags: product.meta?.tags ?? [],
    has_specifications: product.hasSpecifications,
    specifications: parseSpecifications(specs),
    quantity: product.quantity ?? 0,
    unit_price: Number(product.price ?? 0),
    cost_price:
      product.meta?.costPrice != null ? Number(product.meta.costPrice) : null,
    low_stock_threshold: product.lowStockThreshold ?? 5,
    image_url: product.imageUrl || null,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
    category_id: product.category?.id ?? product.categoryId ?? null,
    category_name: product.category?.name ?? null,
    category_icon: product.category?.meta?.icon ?? null,
  }
}

export const productInclude = {
  category: { include: { meta: true } },
  meta: true,
} satisfies Prisma.ProductInclude

export function defaultProductCreateFields(input: {
  id: string
  tenantId: string
  name: string
  barcode: string
  sku: string
  price: number
  quantity: number
  lowStockThreshold: number
  categoryId?: string | null
  imageUrl?: string | null
  hasSpecifications?: boolean
}) {
  const now = new Date()
  return {
    id: input.id,
    tenantId: input.tenantId,
    name: input.name,
    barcode: input.barcode,
    sku: input.sku,
    price: input.price,
    quantity: input.quantity,
    lowStockThreshold: input.lowStockThreshold,
    categoryId: input.categoryId ?? null,
    imageUrl: input.imageUrl?.trim() || '',
    unitsPerDozen: 12,
    unitOfMeasure: 'each',
    hasSpecifications: input.hasSpecifications ?? false,
    isRetired: false,
    discontinuedBy: '',
    createdAt: now,
    updatedAt: now,
  }
}
