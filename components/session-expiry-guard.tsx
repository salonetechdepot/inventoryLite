"use client"

import { useEffect, useRef } from "react"
import { hasSessionExpiry, isSessionExpired } from "@/lib/session-expiry"

type SessionExpiryGuardProps = {
  sessionExpiresAt: string | null
  sessionExpired: boolean
  onExpired: () => void
}

/** Single mount: fire once when the 5 AM cutoff passes while the app is open. */
export function SessionExpiryGuard({
  sessionExpiresAt,
  sessionExpired,
  onExpired,
}: SessionExpiryGuardProps) {
  const handledRef = useRef(false)

  useEffect(() => {
    const fire = () => {
      if (handledRef.current) return
      handledRef.current = true
      onExpired()
    }

    if (sessionExpired) {
      fire()
      return
    }

    if (!hasSessionExpiry(sessionExpiresAt) || isSessionExpired(sessionExpiresAt)) {
      return
    }

    const delay = new Date(sessionExpiresAt).getTime() - Date.now()
    if (delay <= 0) {
      fire()
      return
    }

    const timer = window.setTimeout(fire, delay)
    return () => window.clearTimeout(timer)
  }, [sessionExpiresAt, sessionExpired, onExpired])

  return null
}
