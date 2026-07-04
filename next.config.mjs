/** @type {import('next').NextConfig} */

function loginApiConnectOrigin() {
  const raw = (process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).origin
  } catch {
    return ''
  }
}

const loginApiOrigin = loginApiConnectOrigin()
const connectSrc = [
  "'self'",
  'https://*.vercel-storage.com',
  'https://*.public.blob.vercel-storage.com',
  ...(loginApiOrigin ? [loginApiOrigin] : []),
].join(' ')

const nextConfig = {
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  images: {
    unoptimized: true,
  },
  async headers() {
    const securityHeaders = [
      {
        key: 'Content-Security-Policy',
        value:
          `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src ${connectSrc}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
      },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
    ]

    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      })
    }

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
