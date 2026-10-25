import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

function addOrigin(set: Set<string>, value: string | null | undefined) {
  if (!value?.trim()) return
  try {
    set.add(new URL(value.trim()).origin)
  } catch {
    // ignore malformed URLs
  }
}

/**
 * Rejects cross-site browser calls. Requests with no Origin (same-site navigations,
 * the service worker, and non-browser clients) are allowed.
 * Lives in the route handler because Next.js 16 dev serves a 404 page for any
 * route matched by proxy.ts.
 */
export async function rejectCrossOrigin(): Promise<NextResponse | null> {
  const h = await headers()
  const origin = h.get('origin')
  if (!origin) return null

  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const host = h.get('host')?.split(',')[0]?.trim()
  const forwardedHost = h.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http'

  const allowed = new Set<string>()
  for (const item of [host, forwardedHost]) {
    if (!item) continue
    allowed.add(`${forwardedProto}://${item}`)
    if (forwardedProto === 'http') allowed.add(`https://${item}`)
  }
  addOrigin(allowed, process.env.NEXT_PUBLIC_APP_URL)
  addOrigin(allowed, process.env.APP_URL)

  if (allowed.has(parsed.origin)) return null

  const hosts = new Set([host, forwardedHost].filter(Boolean))
  if (hosts.has(parsed.host)) return null

  return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
}
