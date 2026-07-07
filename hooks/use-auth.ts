"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { fetchWithOfflineCache, SESSION_CACHE_KEY, clearSessionBackup } from "@/lib/offline-sync"
import { hasSessionExpiry, isSessionExpired } from "@/lib/session-expiry"
import { isBrowserOffline } from "@/lib/offline-navigation"
import { goToLogin } from "@/lib/auth-navigation"
import { useAuthStore } from "@/stores/auth-store"

interface User {
  id: string
  tenant_id?: string
  email: string
  phone_e164?: string | null
  business_name: string
  theme_color?: string | null
  shop_logo_url?: string | null
  created_at?: string
}

type SessionResponse = {
  user: User | null
  sessionExpiresAt: string | null
}

const fetcher = fetchWithOfflineCache

export function useAuth() {
  const router = useRouter()
  const storeUser = useAuthStore((s) => s.user)
  const storeExpiresAt = useAuthStore((s) => s.sessionExpiresAt)
  const logoutStore = useAuthStore((s) => s.logout)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const markHydrated = () => {
      if (!useAuthStore.getState().isHydrated) {
        useAuthStore.setState({ isHydrated: true })
      }
    }

    if (useAuthStore.persist.hasHydrated()) {
      markHydrated()
    }

    const unsub = useAuthStore.persist.onFinishHydration(markHydrated)
    const fallback = window.setTimeout(markHydrated, 800)

    return () => {
      unsub()
      window.clearTimeout(fallback)
    }
  }, [])

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

  const { data, error, isLoading: swrLoading, mutate } = useSWR<SessionResponse>(
    SESSION_CACHE_KEY,
    fetcher,
    {
      revalidateOnFocus: !isOffline,
      revalidateOnReconnect: true,
      shouldRetryOnError: !isOffline,
      dedupingInterval: isOffline ? 60_000 : 2_000,
    }
  )

  const sessionExpiresAt = data?.sessionExpiresAt ?? storeExpiresAt ?? null
  const sessionExpired =
    hasSessionExpiry(sessionExpiresAt) && isSessionExpired(sessionExpiresAt)

  const logout = useCallback(
    async (reason?: "expired") => {
      await logoutStore()
      await clearSessionBackup()
      await mutate({ user: null, sessionExpiresAt: null }, { revalidate: false })
      goToLogin(reason === "expired" ? "session_expired" : undefined, router)
    },
    [logoutStore, mutate, router]
  )

  const user = useMemo(() => {
    if (sessionExpired) return null
    if (data?.user) return data.user
    if (
      storeUser &&
      hasSessionExpiry(storeExpiresAt) &&
      !isSessionExpired(storeExpiresAt)
    ) {
      return storeUser as User
    }
    if (isOffline && storeUser && !sessionExpired) {
      return storeUser as User
    }
    return null
  }, [data?.user, sessionExpired, storeUser, storeExpiresAt, isOffline])

  const isLoading = useMemo(() => {
    if (user) return false
    if (!isHydrated) return true
    // Signed out — don't block on a network session check (especially offline).
    if (!storeUser && !data?.user) return false
    if (isOffline) return false
    return swrLoading
  }, [user, isHydrated, storeUser, data?.user, isOffline, swrLoading])

  return {
    user,
    sessionExpired,
    sessionExpiresAt,
    isLoading,
    isError: error,
    logout,
    mutate,
  }
}
