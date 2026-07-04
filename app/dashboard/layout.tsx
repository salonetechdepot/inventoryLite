"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { BottomNav } from "@/components/bottom-nav"
import { ThemeSync } from "@/components/theme-sync"
import { OfflineSync } from "@/components/offline-sync"
import { PwaInstallPrompt } from "@/components/pwa-install-prompt"
import { SessionExpiryGuard } from "@/components/session-expiry-guard"
import { useAuth } from "@/hooks/use-auth"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isLoading, sessionExpired, sessionExpiresAt, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isOffline, setIsOffline] = useState(false)

  const handleExpired = useCallback(() => {
    void logout("expired")
  }, [logout])

  useEffect(() => {
    const sync = () => setIsOffline(!navigator.onLine)
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (navigator.onLine) return
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as Element | null
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return

      const hrefAttr = anchor.getAttribute("href")
      if (!hrefAttr || hrefAttr.startsWith("#") || hrefAttr.startsWith("mailto:")) return

      let url: URL
      try {
        url = new URL(anchor.href, window.location.origin)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return

      if (url.pathname.startsWith("/dashboard/account")) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      event.preventDefault()
      event.stopPropagation()
      window.location.assign(url.pathname + url.search + url.hash)
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  useEffect(() => {
    if (isLoading) return
    if (sessionExpired || !user) {
      router.replace(sessionExpired ? "/login?reason=session_expired" : "/login")
    }
  }, [user, isLoading, sessionExpired, router])

  useEffect(() => {
    if (isOffline && pathname?.startsWith("/dashboard/account")) {
      router.replace("/dashboard")
    }
  }, [isOffline, pathname, router])

  if (isLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-lg font-semibold text-foreground">
          {sessionExpired ? "Session expired" : "Sign in required"}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {sessionExpired
            ? "Your session ended at 5:00 AM. Sign in again with a new code to continue."
            : isOffline
              ? "Sign in once while online so StockEasy can keep working without a connection."
              : "Redirecting to login…"}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <SessionExpiryGuard
        sessionExpiresAt={sessionExpiresAt}
        sessionExpired={sessionExpired}
        onExpired={handleExpired}
      />
      <ThemeSync />
      <OfflineSync />
      <PwaInstallPrompt />
      {children}
      <BottomNav />
    </div>
  )
}
