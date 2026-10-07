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

    const { name, icon } = await request.json()

    const existing = await prisma.category.findFirst({
      where: { id, tenantId: session.tenantId },
      include: { meta: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const trimmedName = typeof name === 'string' ? name.trim() : existing.name
    if (!trimmedName) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        name: trimmedName,
        updatedAt: new Date(),
        meta: {
          upsert: {
            create: {
              tenantId: session.tenantId,
              icon: typeof icon === 'string' && icon.trim() ? icon.trim() : 'package',
              isDefault: false,
            },
            update: {
              icon:
                typeof icon === 'string' && icon.trim()
                  ? icon.trim()
                  : existing.meta?.icon,
            },
          },
        },
      },
      include: { meta: true },
    })

    return NextResponse.json({
      category: {
        id: category.id,
        name: category.name,
        icon: category.meta?.icon ?? 'package',
        is_default: category.meta?.isDefault ?? false,
        created_at: category.createdAt,
      },
    })
  } catch (error) {
    console.error('Update category error:', error)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
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

    const existing = await prisma.category.findFirst({
      where: { id, tenantId: session.tenantId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    await prisma.category.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete category error:', error)
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
