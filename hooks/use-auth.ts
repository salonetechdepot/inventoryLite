import useSWR from "swr"
import { useRouter } from "next/navigation"
import { useCallback } from "react"
import { fetchWithOfflineCache } from "@/lib/offline-sync"

interface User {
  id: string
  email: string
  phone_e164?: string | null
  business_name: string
  theme_color?: string | null
  shop_logo_url?: string | null
  created_at: string
}

const fetcher = fetchWithOfflineCache

export function useAuth() {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR<{ user: User | null }>(
    "/api/auth/session",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    mutate({ user: null }, false)
    router.push("/login")
  }, [mutate, router])

  return {
    user: data?.user ?? null,
    isLoading,
    isError: error,
    logout,
    mutate,
  }
}
