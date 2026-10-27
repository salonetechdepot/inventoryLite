"use client"

import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import {
  isShopReadyForOffline,
  OFFLINE_CACHE_REFRESHED_EVENT,
} from "@/lib/offline-sync"

const SHOWN_KEY = "biva-data-synced-shown"
const HIDE_MS = 5_000

/** Short notice after the shop download and tab pages are saved on this phone. */
export function DataSyncedBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const showIfReady = async () => {
      if (sessionStorage.getItem(SHOWN_KEY) === "1") return
      if (!navigator.onLine) return
      if (!(await isShopReadyForOffline())) return
      sessionStorage.setItem(SHOWN_KEY, "1")
      setVisible(true)
    }

    const onRefreshed = (event: Event) => {
      const full = (event as CustomEvent<{ full?: boolean }>).detail?.full
      if (full) sessionStorage.removeItem(SHOWN_KEY)
      void showIfReady()
    }

    void showIfReady()
    window.addEventListener(OFFLINE_CACHE_REFRESHED_EVENT, onRefreshed)
    return () => {
      window.removeEventListener(OFFLINE_CACHE_REFRESHED_EVENT, onRefreshed)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(() => setVisible(false), HIDE_MS)
    return () => window.clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <div
      className="mx-4 mt-3 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-center text-xs text-foreground"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5 text-primary" aria-hidden />
        Data synced
      </span>
    </div>
  )
}
