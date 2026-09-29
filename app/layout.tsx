import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { PwaProvider } from '@/components/pwa-provider'
import { APP_DEFAULT_DESCRIPTION, APP_FULL_NAME, APP_LOGO_SRC, APP_THEME_COLOR } from '@/lib/site'
import './globals.css'

export const metadata: Metadata = {
  title: APP_FULL_NAME,
  description: APP_DEFAULT_DESCRIPTION,
  generator: 'sbm',
  icons: {
    icon: [{ url: APP_LOGO_SRC, type: 'image/jpeg' }],
    apple: '/apple-icon.jpg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: APP_THEME_COLOR,
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
