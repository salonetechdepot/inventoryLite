"use client"

import { useEffect } from "react"

function isLocalhost() {
  return (
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  )
}

export function PwaProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    // Skip SW in dev on non-localhost (avoids stale chunk cache on LAN IPs).
    if (process.env.NODE_ENV !== "production" && !isLocalhost()) {
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
