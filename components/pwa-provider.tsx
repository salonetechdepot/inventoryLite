"use client"

import { useEffect } from "react"

/** Ask the browser not to evict IndexedDB (unsent sales) when the phone runs low on space. */
async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return
    if (await navigator.storage.persisted()) return
    await navigator.storage.persist()
  } catch {
    // Not supported or refused: data stays but may be evicted under storage pressure.
  }
}

export function PwaProvider() {
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

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
