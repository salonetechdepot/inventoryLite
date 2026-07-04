import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET all categories for current user
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const categories = await prisma.category.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: true } },
      },
    })

    const formattedCategories = categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      is_default: category.isDefault ?? false,
      product_count: category._count.products,
      created_at: category.createdAt
    }))

    return NextResponse.json({ categories: formattedCategories })
  } catch (error) {
    console.error('Get categories error:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

// POST create new category
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, icon } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    const category = await prisma.category.create({
      data: {
        tenantId: session.tenantId,
        name,
        icon: icon || 'package'
      }
    })

    return NextResponse.json({
      category: {
        id: category.id,
        name: category.name,
        icon: category.icon,
        created_at: category.createdAt
      }
    })
  } catch (error) {
    console.error('Create category error:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
