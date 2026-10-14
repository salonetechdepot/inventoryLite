import { NextResponse, type NextRequest } from 'next/server'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function addOrigin(set: Set<string>, value: string | null | undefined) {
  if (!value?.trim()) return
  try {
    set.add(new URL(value.trim()).origin)
  } catch {
    // ignore malformed URLs
  }
}

/** Browser Origin vs NextRequest.nextUrl.origin often disagree behind Render/Vercel proxies. */
function allowedMutationOrigins(request: NextRequest): Set<string> {
  const allowed = new Set<string>()
  addOrigin(allowed, request.nextUrl.origin)

  const host = request.headers.get('host')?.split(',')[0]?.trim()
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    (request.nextUrl.protocol === 'https:' ? 'https' : 'http')

  for (const h of [host, forwardedHost]) {
    if (!h) continue
    allowed.add(`${forwardedProto}://${h}`)
    if (forwardedProto === 'http') {
      allowed.add(`https://${h}`)
    }
  }

  addOrigin(allowed, process.env.NEXT_PUBLIC_APP_URL)
  addOrigin(allowed, process.env.APP_URL)

  return allowed
}

function isSameOriginMutation(request: NextRequest, origin: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }

  const allowed = allowedMutationOrigins(request)
  if (allowed.has(parsed.origin)) return true

  const host = request.headers.get('host')?.split(',')[0]?.trim()
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const hosts = new Set([host, forwardedHost, request.nextUrl.host].filter(Boolean))
  return hosts.has(parsed.host)
}

export function proxy(request: NextRequest) {
  if (!MUTATION_METHODS.has(request.method)) {
    return NextResponse.next()
  }

  const origin = request.headers.get('origin')
  if (!origin) {
    return NextResponse.next()
  }

  if (!isSameOriginMutation(request, origin)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
