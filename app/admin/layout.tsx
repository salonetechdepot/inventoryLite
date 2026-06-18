import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'
import { Shield, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'StockEasy Operator',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) {
    redirect('/login?next=/admin')
  }

  if (!isAdminEmail(session.email)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            <div>
              <p className="font-semibold">StockEasy Operator Console</p>
              <p className="text-xs text-muted-foreground">
                Developer / platform control · {session.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin">Overview</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/users">
                <Users className="mr-1 size-4" />
                Users
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">Open shop app</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 pb-12">{children}</main>
    </div>
  )
}
