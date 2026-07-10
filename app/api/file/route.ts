import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { getApiSession } from '@/lib/api-session'

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const pathname = request.nextUrl.searchParams.get('pathname')

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    // Verify the pathname belongs to the current user (security check)
    const userPathPrefixes = [`products/${session.tenantId}/`, `branding/${session.tenantId}/`]
    if (!userPathPrefixes.some((prefix) => pathname.startsWith(prefix))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await get(pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })

    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }

    // Blob hasn't changed — tell the browser to use its cached copy
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
