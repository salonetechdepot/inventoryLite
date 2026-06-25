import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { PwaProvider } from '@/components/pwa-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'StockEasy - Simple Inventory for Sierra Leone SMEs',
  description: 'Easy inventory management for small businesses in Sierra Leone. Track products, manage stock, record sales.',
  generator: 'v0.app',
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
