import { NextResponse, type NextRequest } from 'next/server'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function proxy(request: NextRequest) {
  if (!MUTATION_METHODS.has(request.method)) {
    return NextResponse.next()
  }

  const origin = request.headers.get('origin')
  if (!origin) {
    return NextResponse.next()
  }

  const expectedOrigin = request.nextUrl.origin
  if (origin !== expectedOrigin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
