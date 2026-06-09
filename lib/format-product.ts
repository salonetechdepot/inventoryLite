import type { Product } from '@prisma/client'
import { parseSpecifications } from '@/lib/product-specifications'

type ProductWithCategory = Product & {
  category?: { id: string; name: string; icon?: string | null } | null
}

export function formatProductResponse(product: ProductWithCategory) {
  return {
    id: product.id,
    name: product.name,
    scan_code: product.scanCode,
    tags: product.tags,
    has_specifications: product.hasSpecifications,
    specifications: parseSpecifications(product.specifications),
    quantity: product.quantity ?? 0,
    unit_price: Number(product.unitPrice ?? 0),
    cost_price:
      product.costPrice != null ? Number(product.costPrice) : null,
    low_stock_threshold: product.lowStockThreshold ?? 5,
    image_url: product.imageUrl,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
    category_id: product.category?.id ?? product.categoryId ?? null,
    category_name: product.category?.name ?? null,
    category_icon: product.category?.icon ?? null,
  }
}
