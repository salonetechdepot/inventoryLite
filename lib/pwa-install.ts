const STORAGE_KEY = 'stockeasy-install-prompt-v1'

export type InstallPromptState = 'dismissed' | 'installed'

export function getInstallPromptState(): InstallPromptState | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === 'dismissed' || raw === 'installed') return raw
  return null
}

export function setInstallPromptState(state: InstallPromptState) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, state)
}

export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  )
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'unknown'

export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Windows|Macintosh|Linux/i.test(ua)) return 'desktop'
  return 'unknown'
}

export function isProductionClient(): boolean {
  return process.env.NODE_ENV === 'production'
}
