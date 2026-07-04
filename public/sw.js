const SW_VERSION = "v4"
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
  "/dashboard/analytics",
  OFFLINE_FALLBACK_URL,
  "/icon.svg",
]

function offlineHtml() {
  return caches.match(OFFLINE_FALLBACK_URL).then((cached) => {
    if (cached) return cached
    return new Response(
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Offline</title></head><body><p>StockEasy is offline. Open the app once while online, then try again.</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  })
}

async function cachedAppShell(pathname) {
  const candidates = [pathname, "/dashboard", "/", OFFLINE_FALLBACK_URL]
  for (const path of candidates) {
    const hit = await caches.match(path)
    if (hit) return hit
  }
  return offlineHtml()
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

  // API is handled by IndexedDB in the app — never intercept.
  if (url.pathname.startsWith("/api/")) return

  const isRsc =
    request.headers.get("rsc") === "1" ||
    request.headers.get("next-router-prefetch") === "1" ||
    url.searchParams.has("_rsc")

  // RSC / flight requests must not receive HTML fallbacks (that crashes React).
  if (isRsc) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response("", {
            status: 503,
            statusText: "Offline",
            headers: { "Content-Type": "text/plain" },
          })
      )
    )
    return
  }

  // Build assets — cache first.
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

  // Navigations and other same-origin GETs — network first, cache fallback.
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseClone = networkResponse.clone()
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone)
            // Also store by pathname for full-page offline loads.
            if (request.mode === "navigate") {
              cache.put(url.pathname, responseClone.clone())
            }
          })
        }
        return networkResponse
      })
      .catch(async () => {
        const exact = await caches.match(request)
        if (exact) return exact
        if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
          return cachedAppShell(url.pathname)
        }
        return new Response("", { status: 503, statusText: "Offline" })
      })
  )
})
