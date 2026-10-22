import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'
import { newEntityId } from '@/lib/entity-id'
import { validateEntityRouteId } from '@/lib/api-validation'

type RouteContext = { params: Promise<{ id: string }> }

function categoryCode(name: string) {
  const compact = name.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return compact.slice(0, 10) || 'SUB'
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { id: categoryId } = await context.params
    const invalidId = validateEntityRouteId(categoryId)
    if (invalidId) return invalidId

    const body = await request.json()
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Subcategory name is required' }, { status: 400 })
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'Subcategory name is too long' }, { status: 400 })
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, tenantId: session.tenantId },
      select: { id: true },
    })
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const now = new Date()
    const subcategory = await prisma.subCategory.create({
      data: {
        id: newEntityId(),
        tenantId: session.tenantId,
        categoryId,
        name,
        code: categoryCode(name),
        barcode: '',
        price: 0,
        quantity: 0,
        unitOfMeasure: 'each',
        shelfLabel: '',
        tagIds: '[]',
        createdAt: now,
        updatedAt: now,
      },
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
    console.error('Create subcategory error:', error)
    return NextResponse.json({ error: 'Failed to create subcategory' }, { status: 500 })
  }
}
