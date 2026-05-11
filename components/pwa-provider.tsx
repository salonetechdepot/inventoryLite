"use client"

import { useEffect } from "react"

export function PwaProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js")
      } catch {
        // Ignore registration errors to avoid interrupting app usage.
      }
    }

    void register()
  }, [])

  return null
}
