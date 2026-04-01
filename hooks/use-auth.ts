import useSWR from "swr"
import { useRouter } from "next/navigation"
import { useCallback } from "react"

interface User {
  id: string
  email: string
  business_name: string
  created_at: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

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
