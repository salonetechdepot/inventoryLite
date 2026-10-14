"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"

type LoginSsoHandoffProps = {
  onError: (message: string) => void
  onBusyChange: (busy: boolean) => void
}

const PORTAL_TOKEN_QUERY_KEYS = [
  "token",
  "access_token",
  "accessToken",
  "access-token",
] as const

function pickPortalTokenFromSearch(params: URLSearchParams): string | null {
  for (const key of PORTAL_TOKEN_QUERY_KEYS) {
    const value = params.get(key)?.trim()
    if (value) return value
  }
  return null
}

/** Some portals put the JWT in the hash (#access_token=…) instead of ?query=. */
function pickPortalTokenFromHash(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.location.hash.replace(/^#/, "").trim()
  if (!raw) return null
  const hashParams = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw)
  return pickPortalTokenFromSearch(hashParams)
}

function stripTokenFromUrl() {
  const url = new URL(window.location.href)
  for (const key of PORTAL_TOKEN_QUERY_KEYS) {
    url.searchParams.delete(key)
  }
  url.hash = ""
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, "", next)
}

function LoginSsoHandoffInner({ onError, onBusyChange }: LoginSsoHandoffProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const completePortalHandoff = useAuthStore((s) => s.completePortalHandoff)
  const startedRef = useRef(false)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    const token =
      pickPortalTokenFromSearch(searchParams) ?? pickPortalTokenFromHash()
    if (!token) {
      onBusyChange(false)
      return
    }
    if (startedRef.current) return
    startedRef.current = true

    stripTokenFromUrl()
    setSigningIn(true)
    onBusyChange(true)
    onError("")

    void (async () => {
      try {
        const user = await completePortalHandoff(token)
        router.replace("/dashboard")
        void user
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Sign-in link expired or invalid. Use OTP below."
        onError(message)
        setSigningIn(false)
        onBusyChange(false)
      }
    })()
  }, [searchParams, completePortalHandoff, router, onError, onBusyChange])

  if (!signingIn) return null

  return (
    <div
      className="mb-4 flex items-center justify-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
      Signing you in from Roarbyte…
    </div>
  )
}

export function LoginSsoHandoff(props: LoginSsoHandoffProps) {
  return (
    <Suspense fallback={null}>
      <LoginSsoHandoffInner {...props} />
    </Suspense>
  )
}
