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
        const registration = await navigator.serviceWorker.register("/sw.js")

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing
          if (!worker) return
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated" && navigator.serviceWorker.controller) {
              // New SW (e.g. offline fix) — reload once to use fresh caches.
              window.location.reload()
            }
          })
        })
      } catch {
        // Ignore registration errors to avoid interrupting app usage.
      }
    }

    void register()
  }, [])

  return null
}
