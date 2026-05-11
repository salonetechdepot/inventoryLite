import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { BottomNav } from '@/components/bottom-nav'
import { ThemeSync } from '@/components/theme-sync'
import { OfflineSync } from '@/components/offline-sync'
import { PwaInstallPrompt } from '@/components/pwa-install-prompt'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  
  if (!session) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <ThemeSync />
      <OfflineSync />
      <PwaInstallPrompt />
      {children}
      <BottomNav />
    </div>
  )
}
