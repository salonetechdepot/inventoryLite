import { isBrowserOffline } from "@/lib/offline-navigation"

export function loginPath(reason?: "session_expired"): string {
  return reason === "session_expired"
    ? "/login?reason=session_expired"
    : "/login"
}

type AppRouter = {
  replace: (href: string) => void
}

/**
 * Navigate to login reliably in the browser and installed PWA.
 * Offline: full document navigation so the precached login shell loads.
 * Online: client-side router when provided.
 */
export function goToLogin(reason?: "session_expired", router?: AppRouter): void {
  const path = loginPath(reason)

  if (typeof window === "undefined") return

  if (isBrowserOffline() || !router) {
    window.location.assign(path)
    return
  }

  router.replace(path)
}
