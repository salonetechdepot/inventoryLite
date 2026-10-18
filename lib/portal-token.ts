const PORTAL_TOKEN_QUERY_KEYS = [
  "token",
  "access_token",
  "accessToken",
  "access-token",
] as const

export function pickPortalTokenFromSearch(params: URLSearchParams): string | null {
  for (const key of PORTAL_TOKEN_QUERY_KEYS) {
    const value = params.get(key)?.trim()
    if (value) return value
  }
  return null
}

function pickPortalTokenFromHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "").trim()
  if (!raw) return null
  const hashParams = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw)
  return pickPortalTokenFromSearch(hashParams)
}

/** Token the main app appends when it opens Lite, including `/dashboard?token=`. */
export function readPortalTokenFromLocation(): string | null {
  if (typeof window === "undefined") return null
  return (
    pickPortalTokenFromSearch(new URLSearchParams(window.location.search)) ??
    pickPortalTokenFromHash(window.location.hash)
  )
}

export function stripPortalTokenFromUrl() {
  const url = new URL(window.location.href)
  for (const key of PORTAL_TOKEN_QUERY_KEYS) {
    url.searchParams.delete(key)
  }
  url.hash = ""
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, "", next)
}
