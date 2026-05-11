const SW_VERSION = "v1"
const STATIC_CACHE = `stockeasy-static-${SW_VERSION}`
const RUNTIME_CACHE = `stockeasy-runtime-${SW_VERSION}`
const OFFLINE_FALLBACK_URL = "/offline.html"

const PRECACHE_URLS = ["/", "/login", "/dashboard", OFFLINE_FALLBACK_URL, "/icon.svg"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
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
  const isSameOrigin = url.origin === self.location.origin

  if (!isSameOrigin) return

  // Network-first for API reads to keep data fresh.
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
        .catch(() => caches.match(request))
    )
    return
  }

  // Stale-while-revalidate for app shell pages/assets.
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone()
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
          return networkResponse
        })
        .catch(async () => {
          if (request.mode === "navigate") {
            return caches.match(OFFLINE_FALLBACK_URL)
          }
          return cachedResponse
        })

      return cachedResponse || fetchPromise
    })
  )
})
