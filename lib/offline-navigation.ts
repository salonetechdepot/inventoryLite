/** Dashboard routes that should work offline after one online visit. */
export const DASHBOARD_OFFLINE_ROUTES = [
  "/login",
  "/dashboard",
  "/dashboard/products",
  "/dashboard/products/new",
  "/dashboard/sell",
  "/dashboard/sales",
  "/dashboard/returns",
  "/dashboard/debtors",
  "/dashboard/day-close",
  "/dashboard/categories",
  "/dashboard/analytics",
  "/dashboard/sync-conflicts",
  "/dashboard/account",
] as const

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine
}

export function isDashboardOfflinePath(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/products") ||
    pathname.startsWith("/dashboard/sell") ||
    pathname.startsWith("/dashboard/sales") ||
    pathname.startsWith("/dashboard/returns") ||
    pathname.startsWith("/dashboard/debtors") ||
    pathname.startsWith("/dashboard/day-close") ||
    pathname.startsWith("/dashboard/categories") ||
    pathname.startsWith("/dashboard/analytics") ||
    pathname.startsWith("/dashboard/sync-conflicts") ||
    pathname.startsWith("/dashboard/account")
  )
}

/** Warm Next.js client route cache while online so tab switches work offline. */
export function prefetchDashboardRoutes(
  prefetch: (href: string) => void
): void {
  if (isBrowserOffline()) return
  for (const route of DASHBOARD_OFFLINE_ROUTES) {
    try {
      prefetch(route)
    } catch {
      // Ignore — prefetch is best-effort across browsers.
    }
  }
}

function warmRoute(route: string, headers: Record<string, string>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4_000)
  return fetch(route, {
    credentials: "same-origin",
    headers,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))
}

/**
 * Cache App Router flight payloads and page HTML in the service worker
 * (supplements prefetch) so a full reload offline still opens the app.
 */
export async function warmDashboardRscCache(): Promise<void> {
  if (isBrowserOffline()) return
  await Promise.allSettled(
    DASHBOARD_OFFLINE_ROUTES.flatMap((route) => [
      warmRoute(route, { RSC: "1", "Next-Router-Prefetch": "1" }),
      warmRoute(route, { Accept: "text/html" }),
    ])
  )
}
