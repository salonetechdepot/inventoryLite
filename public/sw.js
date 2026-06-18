const SW_VERSION = "v2"
const STATIC_CACHE = `stockeasy-static-${SW_VERSION}`
const RUNTIME_CACHE = `stockeasy-runtime-${SW_VERSION}`
const OFFLINE_FALLBACK_URL = "/offline.html"

const PRECACHE_URLS = ["/", "/login", "/dashboard", OFFLINE_FALLBACK_URL, "/icon.svg"]

/** Always return a valid Response so the browser never shows ERR_FAILED. */
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

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone()
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
          return networkResponse
        })
        .catch(() => caches.match(request).then((c) => c || offlineResponse()))
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone()
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return networkResponse
        })
        .catch(() => {
          if (request.mode === "navigate") return offlineResponse()
          return cachedResponse || offlineResponse()
        })

      return cachedResponse || networkFetch
    })
  )
})
