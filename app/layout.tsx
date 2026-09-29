import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { PwaProvider } from '@/components/pwa-provider'
import { APP_DEFAULT_DESCRIPTION, APP_FULL_NAME } from '@/lib/site'
import './globals.css'

export const metadata: Metadata = {
  title: APP_FULL_NAME,
  description: APP_DEFAULT_DESCRIPTION,
  generator: 'sbm',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
        <PwaProvider />
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
