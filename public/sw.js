const SW_VERSION = "v3"
const STATIC_CACHE = `stockeasy-static-${SW_VERSION}`
const RUNTIME_CACHE = `stockeasy-runtime-${SW_VERSION}`
const OFFLINE_FALLBACK_URL = "/offline.html"

const PRECACHE_URLS = [
  "/",
  "/login",
  "/dashboard",
  "/dashboard/sell",
  "/dashboard/products",
  "/dashboard/sales",
  "/dashboard/returns",
  OFFLINE_FALLBACK_URL,
  "/icon.svg",
]

function offlineResponse() {
  return caches.match(OFFLINE_FALLBACK_URL).then((cached) => {
    if (cached) return cached
    return new Response(
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Offline</title></head><body><p>StockEasy is offline. Check your connection and try again.</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  })
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {
        // Precache best-effort; missing entries must not brick install.
      })
    )
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // API reads/writes are handled by IndexedDB in the app — do not intercept.
  if (url.pathname.startsWith("/api/")) return

  // Immutable build assets — cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const responseClone = networkResponse.clone()
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, responseClone)
              })
            }
            return networkResponse
          })
      )
    )
    return
  }

  // Pages and other assets — network first, cache fallback when offline.
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseClone = networkResponse.clone()
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
        }
        return networkResponse
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached
          if (request.mode === "navigate") return offlineResponse()
          return offlineResponse()
        })
      )
  )
})
