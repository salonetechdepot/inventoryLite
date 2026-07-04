"use client"

import { useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { fetchWithOfflineCache, SESSION_CACHE_KEY, clearSessionBackup } from "@/lib/offline-sync"
import { hasSessionExpiry, isSessionExpired } from "@/lib/session-expiry"
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

  const { data, error, isLoading, mutate } = useSWR<SessionResponse>(
    SESSION_CACHE_KEY,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
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
      router.push(reason === "expired" ? "/login?reason=session_expired" : "/login")
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
    return null
  }, [data?.user, sessionExpired, storeUser, storeExpiresAt])

  return {
    user,
    sessionExpired,
    sessionExpiresAt,
    isLoading: (!isHydrated && !user) || isLoading,
    isError: error,
    logout,
    mutate,
  }
}
