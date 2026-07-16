/** Dashboard routes that should work offline after one online visit. */
export const DASHBOARD_OFFLINE_ROUTES = [
  "/login",
  "/dashboard",
  "/dashboard/products",
  "/dashboard/sell",
  "/dashboard/sales",
  "/dashboard/returns",
  "/dashboard/debtors",
  "/dashboard/categories",
  "/dashboard/analytics",
  "/dashboard/sync-conflicts",
] as const

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine
}

export function isDashboardOfflinePath(pathname: string): boolean {
  if (pathname === "/dashboard/account") return false
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/products") ||
    pathname.startsWith("/dashboard/sell") ||
    pathname.startsWith("/dashboard/sales") ||
    pathname.startsWith("/dashboard/returns") ||
    pathname.startsWith("/dashboard/debtors") ||
    pathname.startsWith("/dashboard/categories") ||
    pathname.startsWith("/dashboard/analytics") ||
    pathname.startsWith("/dashboard/sync-conflicts")
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

/** Cache App Router flight payloads in the service worker (supplements prefetch). */
export async function warmDashboardRscCache(): Promise<void> {
  if (isBrowserOffline()) return
  await Promise.allSettled(
    DASHBOARD_OFFLINE_ROUTES.map((route) =>
      fetch(route, {
        credentials: "same-origin",
        headers: {
          RSC: "1",
          "Next-Router-Prefetch": "1",
        },
      })
    )
  )
}
