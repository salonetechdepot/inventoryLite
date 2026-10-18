"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { BottomNav } from "@/components/bottom-nav"
import { ThemeSync } from "@/components/theme-sync"
import { OfflineSync } from "@/components/offline-sync"
import { BackgroundCacheRefresh } from "@/components/background-cache-refresh"
import { PwaInstallPrompt } from "@/components/pwa-install-prompt"
import { SessionExpiryGuard } from "@/components/session-expiry-guard"
import { useAuth } from "@/hooks/use-auth"
import { goToLogin } from "@/lib/auth-navigation"
import { readPortalTokenFromLocation, stripPortalTokenFromUrl } from "@/lib/portal-token"
import { useAuthStore } from "@/stores/auth-store"
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
  const [portalSigningIn, setPortalSigningIn] = useState(false)
  const [portalError, setPortalError] = useState("")
  const portalTokenRef = useRef<string | null>(null)
  const portalCheckedRef = useRef(false)
  const handoffActiveRef = useRef(false)
  if (!portalCheckedRef.current && typeof window !== "undefined") {
    portalCheckedRef.current = true
    portalTokenRef.current = readPortalTokenFromLocation()
  }
  const completePortalHandoff = useAuthStore((s) => s.completePortalHandoff)

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
    const token = portalTokenRef.current
    if (!token) return
    handoffActiveRef.current = true
    portalTokenRef.current = null
    setPortalSigningIn(true)
    stripPortalTokenFromUrl()

    void (async () => {
      try {
        await completePortalHandoff(token)
      } catch (error) {
        setPortalError(
          error instanceof Error
            ? error.message
            : "Sign-in link expired or invalid."
        )
      } finally {
        handoffActiveRef.current = false
        setPortalSigningIn(false)
      }
    })()
  }, [completePortalHandoff])

  useEffect(() => {
    if (portalTokenRef.current || handoffActiveRef.current || portalSigningIn || portalError) return
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
  }, [user, isLoading, accountLocked, sessionExpired, router, isOffline, portalSigningIn, portalError])

  if (portalSigningIn || (isLoading && !user)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        {portalSigningIn ? "Signing you in from Roarbyte…" : "Loading…"}
      </div>
    )
  }

  if (portalError && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm text-destructive">{portalError}</p>
        <button
          type="button"
          className="text-sm font-medium text-primary underline"
          onClick={() => goToLogin(undefined, router)}
        >
          Continue to login
        </button>
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
