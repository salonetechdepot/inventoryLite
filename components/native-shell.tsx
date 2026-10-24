"use client"

import { useEffect } from "react"
import { Capacitor } from "@capacitor/core"
import { APP_THEME_COLOR } from "@/lib/site"

/** Status bar for the Android shell. The browser and the installed PWA skip this. */
export function NativeShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let cancelled = false
    ;(async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar")
        if (cancelled) return
        await StatusBar.setOverlaysWebView({ overlay: false })
        await StatusBar.setBackgroundColor({ color: APP_THEME_COLOR })
        await StatusBar.setStyle({ style: Style.Dark })
      } catch {
        // Older Android builds ignore the status bar. Safe-area padding still applies.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
