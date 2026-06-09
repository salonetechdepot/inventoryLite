"use client"

import { useEffect } from "react"

export function PwaProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    // In development the SW's stale-while-revalidate cache serves outdated JS
    // chunks, which breaks hydration. Unregister any existing SW and skip it.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => void registration.unregister())
      })
      return
    }

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
