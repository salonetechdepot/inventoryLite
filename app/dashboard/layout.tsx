"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { BottomNav } from "@/components/bottom-nav"
import { ThemeSync } from "@/components/theme-sync"
import { OfflineSync } from "@/components/offline-sync"
import { BackgroundCacheRefresh } from "@/components/background-cache-refresh"
import { PwaInstallPrompt } from "@/components/pwa-install-prompt"
import { SessionExpiryGuard } from "@/components/session-expiry-guard"
import { useAuth } from "@/hooks/use-auth"
import { goToLogin } from "@/lib/auth-navigation"
import {
  isBrowserOffline,
  isDashboardOfflinePath,
} from "@/lib/offline-navigation"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isLoading, sessionExpired, sessionExpiresAt, logout, accountLocked } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isOffline, setIsOffline] = useState(false)

  const handleExpired = useCallback(() => {
    void logout("expired")
  }, [logout])

  useEffect(() => {
    const sync = () => setIsOffline(isBrowserOffline())
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])

  useEffect(() => {
    if (isLoading) return
    if (accountLocked) {
      router.replace("/account-locked")
      return
    }
    // Keep dashboard when offline with a valid persisted session (production PWA).
    if (isOffline && user) return
    if (sessionExpired || !user) {
      goToLogin(sessionExpired ? "session_expired" : undefined, router)
    }
  }, [user, isLoading, accountLocked, sessionExpired, router, isOffline])

  if (isLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Redirecting to login…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <SessionExpiryGuard
        sessionExpiresAt={sessionExpiresAt}
        sessionExpired={sessionExpired}
        onExpired={handleExpired}
      />
      <ThemeSync />
      <OfflineSync />
      <BackgroundCacheRefresh />
      <PwaInstallPrompt />
      {isOffline && pathname && !isDashboardOfflinePath(pathname) ? (
        <div className="mx-4 mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-center text-xs text-warning-foreground">
          This page was not saved for offline use. Open it once while online, or go
          back to a main tab below.
        </div>
      ) : null}
      {children}
      <BottomNav />
    </div>
  )
}
