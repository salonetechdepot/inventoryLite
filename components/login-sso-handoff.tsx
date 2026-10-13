"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"

type LoginSsoHandoffProps = {
  onError: (message: string) => void
  onBusyChange: (busy: boolean) => void
}

function pickPortalToken(params: URLSearchParams): string | null {
  const token = params.get("token")?.trim() || params.get("access_token")?.trim()
  return token || null
}

function stripTokenFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete("token")
  url.searchParams.delete("access_token")
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
    const token = pickPortalToken(searchParams)
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
