import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'
import { validateEntityRouteId } from '@/lib/api-validation'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { id } = await context.params
    const invalidId = validateEntityRouteId(id)
    if (invalidId) return invalidId

    const existing = await prisma.subCategory.findFirst({
      where: { id, tenantId: session.tenantId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Subcategory not found' }, { status: 404 })
    }

    const body = await request.json()
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Subcategory name is required' }, { status: 400 })
    }

    const subcategory = await prisma.subCategory.update({
      where: { id },
      data: { name, updatedAt: new Date() },
      select: { id: true, name: true, categoryId: true },
    })

    return NextResponse.json({
      subcategory: {
        id: subcategory.id,
        name: subcategory.name,
        category_id: subcategory.categoryId,
      },
    })
  } catch (error) {
    console.error('Update subcategory error:', error)
    return NextResponse.json({ error: 'Failed to update subcategory' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { id } = await context.params
    const invalidId = validateEntityRouteId(id)
    if (invalidId) return invalidId

    const existing = await prisma.subCategory.findFirst({
      where: { id, tenantId: session.tenantId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Subcategory not found' }, { status: 404 })
    }

    const usedBy = await prisma.product.count({
      where: { tenantId: session.tenantId, subCategoryId: id, isRetired: false },
    })
    if (usedBy > 0) {
      return NextResponse.json(
        { error: 'A product still uses this subcategory.' },
        { status: 409 }
      )
    }

    await prisma.subCategory.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete subcategory error:', error)
    return NextResponse.json({ error: 'Failed to delete subcategory' }, { status: 500 })
  }
}
