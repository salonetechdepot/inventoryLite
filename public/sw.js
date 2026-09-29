const SW_VERSION = "v9"
const STATIC_CACHE = `biva-static-${SW_VERSION}`
const RUNTIME_CACHE = `biva-runtime-${SW_VERSION}`
const OFFLINE_FALLBACK_URL = "/offline.html"

const DASHBOARD_SHELL_FALLBACKS = [
  "/dashboard/sell",
  "/dashboard/products",
  "/dashboard/sales",
  "/dashboard/returns",
  "/dashboard",
  "/",
]

/** Public assets only — do not precache authenticated dashboard HTML. */
const PRECACHE_URLS = [
  "/login",
  OFFLINE_FALLBACK_URL,
  "/biva-logo.jpg",
  "/manifest.webmanifest",
]

function rscCacheKey(pathname) {
  return `rsc:${pathname}`
}

function offlineHtml() {
  return caches.match(OFFLINE_FALLBACK_URL).then((cached) => {
    if (cached) return cached
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head><body style="font-family:system-ui,sans-serif;padding:24px;text-align:center"><p>BIVA is offline. Open the app once while online, then try again.</p></body></html>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  })
}

async function cachedAppShell(pathname) {
  const exact = await caches.match(pathname)
  if (exact) return exact

  if (pathname.startsWith("/dashboard")) {
    for (const fallback of DASHBOARD_SHELL_FALLBACKS) {
      const hit = await caches.match(fallback)
      if (hit) return hit
    }
  }

  if (pathname === "/dashboard" || pathname === "/") {
    const dash = await caches.match("/dashboard")
    if (dash) return dash
    const root = await caches.match("/")
    if (root) return root
  }

  return offlineHtml()
}

async function cacheResponse(cache, request, response) {
  if (!response || !response.ok) return
  try {
    await cache.put(request, response.clone())
    const url = new URL(request.url)
    if (request.mode === "navigate" || url.pathname.startsWith("/dashboard")) {
      await cache.put(url.pathname, response.clone())
    }
  } catch {
    // Quota or opaque response — ignore.
  }
}

async function cacheRscResponse(cache, request, response) {
  if (!response || !response.ok) return
  try {
    const url = new URL(request.url)
    await cache.put(request, response.clone())
    await cache.put(rscCacheKey(url.pathname), response.clone())
  } catch {
    // ignore
  }
}

async function matchRsc(request) {
  const exact = await caches.match(request)
  if (exact) return exact
  const url = new URL(request.url)
  const byPath = await caches.match(rscCacheKey(url.pathname))
  if (byPath) return byPath
  if (url.pathname.startsWith("/dashboard")) {
    for (const fallback of DASHBOARD_SHELL_FALLBACKS) {
      const alt = await caches.match(rscCacheKey(fallback))
      if (alt) return alt
    }
  }
  return null
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

  // API + mutations are handled in the app (IndexedDB) — never intercept.
  if (url.pathname.startsWith("/api/")) return

  const isRsc =
    request.headers.get("rsc") === "1" ||
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("next-router-state-tree") != null ||
    url.searchParams.has("_rsc")

  if (isRsc) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE)
        const cached = await matchRsc(request)

        try {
          const networkResponse = await fetch(request)
          if (networkResponse.ok) {
            await cacheRscResponse(cache, request, networkResponse)
            return networkResponse
          }
          if (cached) return cached
          return networkResponse
        } catch {
          if (cached) return cached
          return new Response(null, {
            status: 503,
            statusText: "Offline",
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        }
      })()
    )
    return
  }

  // Build assets — cache first (hashed filenames).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then(async (networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const cache = await caches.open(STATIC_CACHE)
              await cache.put(request, networkResponse.clone())
            }
            return networkResponse
          })
      )
    )
    return
  }

  // Navigations — try cache when network fails or returns an error document.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE)
      const isNavigate =
        request.mode === "navigate" ||
        request.headers.get("accept")?.includes("text/html")

      try {
        const networkResponse = await fetch(request)
        if (networkResponse.ok) {
          await cacheResponse(cache, request, networkResponse)
          return networkResponse
        }
        if (isNavigate) {
          const exact = await caches.match(request)
          if (exact) return exact
          return cachedAppShell(url.pathname)
        }
        return networkResponse
      } catch {
        const exact = await caches.match(request)
        if (exact) return exact
        if (isNavigate) {
          return cachedAppShell(url.pathname)
        }
        return new Response("", { status: 503, statusText: "Offline" })
      }
    })()
  )
})
