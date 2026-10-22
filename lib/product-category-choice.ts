import { prisma } from '@/lib/prisma'

export async function assertProductCategoryChoice(
  tenantId: string,
  categoryId: string | null | undefined,
  subCategoryId: string | null | undefined
): Promise<string | null> {
  if (subCategoryId && !categoryId) {
    return 'Choose a category before a subcategory.'
  }

  if (categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, tenantId },
      select: { id: true },
    })
    if (!category) return 'Category not found'
  }

  if (subCategoryId) {
    const subcategory = await prisma.subCategory.findFirst({
      where: { id: subCategoryId, tenantId, categoryId: categoryId ?? undefined },
      select: { id: true },
    })
    if (!subcategory) return 'That subcategory is not under the selected category.'
  }

  return null
}
