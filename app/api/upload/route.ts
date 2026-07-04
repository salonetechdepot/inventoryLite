import { put, del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const VALID_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

function userOwnsPath(pathname: string, tenantId: string) {
  return [`products/${tenantId}/`, `branding/${tenantId}/`].some((prefix) =>
    pathname.startsWith(prefix)
  )
}

function pathnameFromUploadUrl(url: string): string | null {
  try {
    const parsed = new URL(url, 'https://local.invalid')
    if (parsed.pathname === '/api/file') {
      return parsed.searchParams.get('pathname')
    }
    return url
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const folder = String(formData.get('folder') || 'products')

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const extension = VALID_IMAGE_TYPES.get(file.type)
    if (!extension) {
      return NextResponse.json({ error: 'Invalid file type. Please upload an image.' }, { status: 400 })
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 })
    }

    // Create unique filename with user id prefix
    const safeFolder = folder === 'branding' ? 'branding' : 'products'
    const filename = `${safeFolder}/${session.tenantId}/${Date.now()}-${crypto.randomUUID()}.${extension}`

    const blob = await put(filename, file, {
      access: 'private',
    })

    // Return the pathname instead of the URL for private blobs
    // The pathname will be used with the /api/file route to deliver the image
    return NextResponse.json({ url: `/api/file?pathname=${encodeURIComponent(blob.pathname)}` })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
    }

    const pathname = pathnameFromUploadUrl(String(url))
    if (!pathname || !userOwnsPath(pathname, session.tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await del(pathname)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
