"use client"

import { useEffect, useRef } from "react"
import {
  OFFLINE_BACKGROUND_REFRESH_MS,
  runDeltaSync,
} from "@/lib/offline-sync"
import { prefetchDashboardRoutes } from "@/lib/offline-navigation"
import { useRouter } from "next/navigation"

/**
 * Event-driven delta sync with a slow heartbeat fallback.
 * Keeps offline cache fresh without polling the full database every 30s.
 */
export function BackgroundCacheRefresh() {
  const router = useRouter()
  const busyRef = useRef(false)

  useEffect(() => {
    const runRefresh = async () => {
      if (busyRef.current || !navigator.onLine) return
      if (document.visibilityState === "hidden") return

      busyRef.current = true
      try {
        prefetchDashboardRoutes(router.prefetch.bind(router))
        await runDeltaSync()
      } finally {
        busyRef.current = false
      }
    }

    void runRefresh()

    const intervalId = window.setInterval(() => {
      void runRefresh()
    }, OFFLINE_BACKGROUND_REFRESH_MS)

    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void runRefresh()
      }
    }

    const onOnline = () => {
      void runDeltaSync({ full: false })
    }

    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", onOnline)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", onOnline)
    }
  }, [router])

  return null
}
