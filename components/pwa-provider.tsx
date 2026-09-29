"use client"

import { useEffect } from "react"

export function PwaProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    // Never register a service worker in dev — it caches routes and breaks Turbopack/HMR.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
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
              if (!navigator.onLine) return
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
