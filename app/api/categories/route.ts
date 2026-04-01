import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET all categories for current user
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const categories = await sql`
      SELECT id, name, icon, is_default, created_at
      FROM categories
      WHERE user_id = ${session.userId}
      ORDER BY is_default DESC, name ASC
    `

    return NextResponse.json({ categories })
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

    const result = await sql`
      INSERT INTO categories (user_id, name, icon)
      VALUES (${session.userId}, ${name}, ${icon || 'package'})
      RETURNING id, name, icon, created_at
    `

    return NextResponse.json({ category: result[0] })
  } catch (error) {
    console.error('Create category error:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
