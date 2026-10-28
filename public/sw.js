const SW_VERSION = "v16"
const STATIC_CACHE = `biva-static-${SW_VERSION}`
// Saved pages survive worker updates so the shop still opens offline right after one.
// Rename only when the way pages are stored changes.
const RUNTIME_CACHE = "biva-runtime-v15"
// Build files have content hashes, so one cache serves every version. Pages saved
// before an update still point at the previous build's files, which stay here.
const ASSET_CACHE = "biva-assets"
const ASSET_CACHE_MAX_ENTRIES = 2000
const OFFLINE_FALLBACK_URL = "/offline.html"

function normalizePath(pathname) {
  if (!pathname) return "/"
  const trimmed = pathname.replace(/\/+$/, "")
  return trimmed === "" ? "/" : trimmed
}

/** Same tab only — never serve Sell HTML for Products. */
function pageCachePaths(pathname) {
  const path = normalizePath(pathname)
  const paths = [path]
  const parts = path.split("/").filter(Boolean)
  if (parts[0] === "dashboard" && parts.length > 2) {
    paths.push(`/${parts[0]}/${parts[1]}`)
  }
  return paths
}

/** Public assets only — do not precache authenticated dashboard HTML. */
const PRECACHE_URLS = [
  "/login",
  OFFLINE_FALLBACK_URL,
  "/biva-logo.svg",
  "/biva-logo.jpg",
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-icon.png",
  "/apple-icon.jpg",
  "/icon-dark-32x32.png",
  "/icon-light-32x32.png",
]

/** Build files referenced from HTML, RSC payloads and CSS (chunk, css and font paths). */
const BUILD_ASSET_PATTERN = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\s\\)<>,]+/g
const CSS_URL_PATTERN = /url\(\s*["']?([^"')]+)["']?\s*\)/g
const assetsInFlight = new Set()

function isBuildAsset(pathname) {
  return pathname.startsWith("/_next/static/")
}

function discoverAssetUrls(text, baseUrl) {
  const found = new Set()
  for (const match of text.matchAll(BUILD_ASSET_PATTERN)) {
    const raw = match[0]
    found.add(raw.startsWith("/_next/") ? raw : `/_next/${raw}`)
  }
  if (baseUrl) {
    for (const match of text.matchAll(CSS_URL_PATTERN)) {
      const ref = match[1].trim()
      if (ref.startsWith("data:")) continue
      try {
        const resolved = new URL(ref, baseUrl)
        if (resolved.origin === self.location.origin && isBuildAsset(resolved.pathname)) {
          found.add(resolved.pathname + resolved.search)
        }
      } catch {
        // Not a URL.
      }
    }
  }
  return [...found]
}

async function pruneAssetCache(cache) {
  const keys = await cache.keys()
  const excess = keys.length - ASSET_CACHE_MAX_ENTRIES
  if (excess <= 0) return
  // Oldest first: files from builds that are no longer in use.
  await Promise.all(keys.slice(0, excess + 200).map((key) => cache.delete(key)))
}

/**
 * Save every JS / CSS / font file a page needs, so a page saved while online
 * also runs offline (not only the files the browser happened to load).
 */
async function cacheAssetsReferencedBy(response, depth = 0) {
  try {
    const contentType = response.headers.get("content-type") || ""
    const isCss = contentType.includes("text/css")
    if (!contentType.includes("text/html") && !contentType.includes("text/x-component") && !isCss) {
      return
    }
    const text = await response.text()
    const urls = discoverAssetUrls(text, isCss ? response.url : null)
    if (urls.length === 0) return
    const cache = await caches.open(ASSET_CACHE)
    for (const url of urls) {
      if (assetsInFlight.has(url)) continue
      if (await cache.match(url, { ignoreSearch: true })) continue
      assetsInFlight.add(url)
      try {
        const assetResponse = await fetchWithTimeout(new Request(url), 8000)
        if (assetResponse.ok) {
          await cache.put(url, assetResponse.clone())
          // Fonts and images are referenced from CSS files, one level down.
          if (depth === 0 && url.includes("/css/")) {
            await cacheAssetsReferencedBy(assetResponse, depth + 1)
          }
        }
      } catch {
        // Offline or slow: the next saved page tries again.
      } finally {
        assetsInFlight.delete(url)
      }
    }
    await pruneAssetCache(cache)
  } catch {
    // Discovery is best-effort.
  }
}

function rscCacheKey(pathname) {
  return `rsc:${pathname}`
}

function offlineHtml() {
  return caches.match(OFFLINE_FALLBACK_URL).then((cached) => {
    if (cached) return cached
    // Status 200 so Android Chrome shows this page. A 503 navigation is replaced
    // with the browser's own "This page couldn't load" screen.
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head><body style="font-family:system-ui,sans-serif;padding:24px;text-align:center"><p>BIVA is offline. Open the app once while online, then try again.</p><p><a href="/dashboard/sell">Reopen Sell</a></p></body></html>',
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  })
}

/** A saved page for this tab, or null. Never the offline notice. */
async function cachedPage(pathname) {
  for (const path of pageCachePaths(pathname)) {
    const hit = await caches.match(path)
    if (hit) return hit
  }
  return null
}

async function cachedAppShell(pathname) {
  return (await cachedPage(pathname)) || offlineHtml()
}

/** Login HTML followed from a redirect must not be stored as the dashboard. */
function isUnsafeToCache(request, response) {
  if (!response || !response.ok || response.redirected) return true
  try {
    const requestPath = normalizePath(new URL(request.url).pathname)
    const finalPath = normalizePath(new URL(response.url).pathname)
    const landedOnLogin = finalPath === "/login" || finalPath.startsWith("/login/")
    if (landedOnLogin && requestPath !== finalPath) return true
    if (requestPath.startsWith("/dashboard") && requestPath !== finalPath) return true
  } catch {
    return true
  }
  return false
}

async function cacheResponse(cache, request, response) {
  if (isUnsafeToCache(request, response)) return
  try {
    const forAssets = response.clone()
    await cache.put(request, response.clone())
    const url = new URL(request.url)
    if (request.mode === "navigate" || url.pathname.startsWith("/dashboard")) {
      await cache.put(url.pathname, response.clone())
    }
    void cacheAssetsReferencedBy(forAssets)
  } catch {
    // Quota or opaque response — ignore.
  }
}

async function cacheRscResponse(cache, request, response) {
  if (isUnsafeToCache(request, response)) return
  try {
    const forAssets = response.clone()
    const url = new URL(request.url)
    await cache.put(request, response.clone())
    await cache.put(rscCacheKey(url.pathname), response.clone())
    void cacheAssetsReferencedBy(forAssets)
  } catch {
    // ignore
  }
}

async function matchRsc(request) {
  const exact = await caches.match(request)
  if (exact) return exact
  const url = new URL(request.url)
  for (const path of pageCachePaths(url.pathname)) {
    const byPath = await caches.match(rscCacheKey(path))
    if (byPath) return byPath
  }
  return null
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // One by one: a single missing file must not leave offline.html unsaved.
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, RUNTIME_CACHE, ASSET_CACHE])
      const stale = (await caches.keys()).filter((key) => !keep.has(key))
      const assets = await caches.open(ASSET_CACHE)
      // Earlier workers kept build files in their versioned static cache. Move them,
      // since saved pages still need them, before deleting that cache.
      for (const key of stale) {
        if (!key.startsWith("biva-static-")) continue
        const old = await caches.open(key)
        for (const request of await old.keys()) {
          if (!isBuildAsset(new URL(request.url).pathname)) continue
          const response = await old.match(request)
          if (response) await assets.put(request, response)
        }
      }
      // Older runtime caches stored Sell HTML under Products / History, and
      // copying that forward kept every tab on Sell, so they are dropped.
      await Promise.all(stale.map((key) => caches.delete(key)))
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

async function updatePageCache(request, url) {
  try {
    const networkResponse = await fetchWithTimeout(request, 4000)
    if (networkResponse.redirected || isUnsafeToCache(request, networkResponse)) return
    const cache = await caches.open(RUNTIME_CACHE)
    await cacheResponse(cache, request, networkResponse)
  } catch {
    // Stay on the saved page.
  }
}

/**
 * Dashboard pages: saved copy first. Waiting on a dead radio makes Chrome
 * show "This page couldn't load" even when the receipt is already on the phone.
 */
async function networkFirstPage(request, url) {
  const cached = (await caches.match(request)) || (await caches.match(url.pathname))
  const fallback = () => (cached ? cached : cachedAppShell(url.pathname))
  const isDashboard =
    url.pathname === "/" || url.pathname.startsWith("/dashboard")

  // This exact page is saved: open it at once and refresh it in the background.
  if (isDashboard && cached && cached.ok) {
    if (self.navigator.onLine) void updatePageCache(request, url)
    return cached
  }

  if (!self.navigator.onLine) return fallback()

  try {
    // A page not saved yet gets longer to load before the offline fallback.
    const networkResponse = await fetchWithTimeout(request, isDashboard ? 4000 : 1500)
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
        // The parent tab's payload is only an offline stand-in; online, load the real page.
        const cached =
          (await caches.match(request)) ||
          (await caches.match(rscCacheKey(normalizePath(url.pathname))))

        if (cached) {
          if (self.navigator.onLine) {
            void (async () => {
              try {
                const networkResponse = await fetchWithTimeout(request, 4000)
                if (networkResponse.ok && !isUnsafeToCache(request, networkResponse)) {
                  await cacheRscResponse(cache, request, networkResponse)
                }
              } catch {
                // Keep the saved copy.
              }
            })()
          }
          return cached
        }

        if (!self.navigator.onLine) {
          const standIn = await matchRsc(request)
          if (standIn) return standIn
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
          return networkResponse
        } catch {
          const standIn = await matchRsc(request)
          if (standIn) return standIn
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
  if (isBuildAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        // Hashed names: the ?dpl= deployment query does not change the file.
        const cached = await caches.match(request, { ignoreSearch: true })
        if (cached) return cached
        if (!self.navigator.onLine) {
          return new Response("", { status: 503, statusText: "Offline" })
        }
        try {
          const networkResponse = await fetchWithTimeout(request, 8000)
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(ASSET_CACHE)
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
