"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import {
  pickPortalTokenFromSearch,
  readPortalTokenFromLocation,
  stripPortalTokenFromUrl,
} from "@/lib/portal-token"

type LoginSsoHandoffProps = {
  onError: (message: string) => void
  onBusyChange: (busy: boolean) => void
}

function LoginSsoHandoffInner({ onError, onBusyChange }: LoginSsoHandoffProps) {
  const searchParams = useSearchParams()
  const completePortalHandoff = useAuthStore((s) => s.completePortalHandoff)
  const startedRef = useRef(false)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    const token = pickPortalTokenFromSearch(searchParams) ?? readPortalTokenFromLocation()
    if (!token) {
      onBusyChange(false)
      return
    }
    if (startedRef.current) return
    startedRef.current = true

    stripPortalTokenFromUrl()
    setSigningIn(true)
    onBusyChange(true)
    onError("")

    void (async () => {
      try {
        const user = await completePortalHandoff(token)
        window.location.assign("/dashboard")
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
  }, [searchParams, completePortalHandoff, onError, onBusyChange])

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
