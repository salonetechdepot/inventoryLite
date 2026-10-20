const SW_VERSION = "v10"
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

/** Login HTML followed from a redirect must not be stored as the dashboard. */
function isUnsafeToCache(request, response) {
  if (!response || !response.ok || response.redirected) return true
  try {
    const requestPath = new URL(request.url).pathname
    const finalPath = new URL(response.url).pathname
    const landedOnLogin = finalPath === "/login" || finalPath.startsWith("/login/")
    if (landedOnLogin && requestPath !== finalPath) return true
    if (requestPath.startsWith("/dashboard") && !finalPath.startsWith("/dashboard")) return true
  } catch {
    return true
  }
  return false
}

async function cacheResponse(cache, request, response) {
  if (isUnsafeToCache(request, response)) return
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
  if (isUnsafeToCache(request, response)) return
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
    (async () => {
      const keys = await caches.keys()
      const runtime = await caches.open(RUNTIME_CACHE)
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map(async (key) => {
            if (key.startsWith("biva-runtime-")) {
              const previous = await caches.open(key)
              const requests = await previous.keys()
              await Promise.all(
                requests.map(async (request) => {
                  const response = await previous.match(request)
                  if (response) await runtime.put(request, response)
                })
              )
            }
            await caches.delete(key)
          })
      )
    })()
  )
  self.clients.claim()
})

function fetchWithTimeout(request, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  // A navigation Request cannot be re-fetched with extra init; rebuild it so cookies are kept.
  const next =
    request.mode === "navigate"
      ? fetch(request.url, {
          credentials: "include",
          redirect: "follow",
          signal: controller.signal,
        })
      : fetch(request, { signal: controller.signal })
  return next.finally(() => clearTimeout(timer))
}

/**
 * Page loads: network first (with cookies) and keep a copy so a reload while
 * offline — e.g. Android discarding the tab during printing — reopens the app.
 */
async function networkFirstPage(request, url) {
  const cached = (await caches.match(request)) || (await caches.match(url.pathname))
  const fallback = () => (cached ? cached : cachedAppShell(url.pathname))

  if (!self.navigator.onLine) return fallback()

  try {
    const networkResponse = await fetchWithTimeout(request, cached ? 6000 : 30000)
    // Navigations must not receive a followed redirect; let the browser redirect itself.
    if (networkResponse.redirected) return Response.redirect(networkResponse.url, 302)
    if (!isUnsafeToCache(request, networkResponse)) {
      const cache = await caches.open(RUNTIME_CACHE)
      await cacheResponse(cache, request, networkResponse)
      return networkResponse
    }
    if (networkResponse.ok || !cached) return networkResponse
    return cached
  } catch {
    return fallback()
  }
}

function isImageRequest(request) {
  return request.destination === "image"
}

async function cacheFirstImage(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  if (!self.navigator.onLine) {
    return new Response("", { status: 503, statusText: "Offline" })
  }
  try {
    const networkResponse = await fetchWithTimeout(request, 8000)
    if (networkResponse && (networkResponse.ok || networkResponse.type === "opaque")) {
      const cache = await caches.open(RUNTIME_CACHE)
      await cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch {
    return new Response("", { status: 503, statusText: "Offline" })
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) {
    if (!isImageRequest(request)) return
    event.respondWith(cacheFirstImage(request))
    return
  }

  // API + mutations are handled in the app (IndexedDB) — never intercept.
  if (url.pathname.startsWith("/api/")) return

  // Login pages reached via redirect are never cached (see isUnsafeToCache), so a
  // stale sign-in screen cannot be replayed for /dashboard.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request, url))
    return
  }

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

        if (!self.navigator.onLine) {
          if (cached) return cached
          return new Response(null, {
            status: 503,
            statusText: "Offline",
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        }

        try {
          const networkResponse = await fetchWithTimeout(request, 4000)
          if (networkResponse.ok && !isUnsafeToCache(request, networkResponse)) {
            await cacheRscResponse(cache, request, networkResponse)
            return networkResponse
          }
          if (isUnsafeToCache(request, networkResponse)) return networkResponse
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

  // Build assets — cache first (hashed filenames). Never hang if the file isn't cached.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (!self.navigator.onLine) {
          return new Response("", { status: 503, statusText: "Offline" })
        }
        try {
          const networkResponse = await fetchWithTimeout(request, 8000)
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE)
            await cache.put(request, networkResponse.clone())
          }
          return networkResponse
        } catch {
          return new Response("", { status: 503, statusText: "Offline" })
        }
      })()
    )
    return
  }

  // Pages — live response while online so login is not replayed from an old cache.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE)
      const isNavigate =
        request.mode === "navigate" ||
        request.headers.get("accept")?.includes("text/html")
      const exact = await caches.match(request)

      if (!self.navigator.onLine) {
        if (exact) return exact
        if (isNavigate) return cachedAppShell(url.pathname)
        return new Response("", { status: 503, statusText: "Offline" })
      }

      try {
        const networkResponse = await fetchWithTimeout(request, 4000)
        if (!isUnsafeToCache(request, networkResponse)) {
          await cacheResponse(cache, request, networkResponse)
          return networkResponse
        }
        if (networkResponse.redirected || networkResponse.ok) return networkResponse
        if (exact) return exact
        if (isNavigate) return cachedAppShell(url.pathname)
        return networkResponse
      } catch {
        if (exact) return exact
        if (isNavigate) return cachedAppShell(url.pathname)
        return new Response("", { status: 503, statusText: "Offline" })
      }
    })()
  )
})
