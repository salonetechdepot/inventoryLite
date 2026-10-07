import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { prisma } from '@/lib/prisma'
import { newEntityId } from '@/lib/entity-id'

export async function GET() {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const categories = await prisma.category.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: 'asc' },
      include: {
        meta: true,
        _count: { select: { products: true } },
      },
    })

    const formattedCategories = categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.meta?.icon ?? 'package',
        is_default: category.meta?.isDefault ?? false,
        product_count: category._count.products,
        created_at: category.createdAt,
      }))
      .sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    return NextResponse.json({ categories: formattedCategories })
  } catch (error) {
    console.error('Get categories error:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { name, icon } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    const now = new Date()
    const categoryId = newEntityId()

    const category = await prisma.category.create({
      data: {
        id: categoryId,
        tenantId: session.tenantId,
        name,
        createdAt: now,
        updatedAt: now,
        meta: {
          create: {
            tenantId: session.tenantId,
            icon: icon || 'package',
            isDefault: false,
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
        created_at: category.createdAt,
      },
    })
  } catch (error) {
    console.error('Create category error:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
