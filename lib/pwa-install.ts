import { Capacitor } from '@capacitor/core'

const STORAGE_KEY = 'biva-install-prompt-v1'

/** True inside the Capacitor Android shell, so the site does not offer a second install. */
export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false
  if (Capacitor.isNativePlatform()) return true
  return navigator.userAgent.includes('BIVAAndroid')
}

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

/** Show install UI in production and on localhost (dev testing). */
export function canShowInstallPrompt(): boolean {
  if (typeof window === 'undefined') return false
  if (isNativeShell()) return false
  if (process.env.NODE_ENV === 'production') return true
  return (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  )
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredInstallPrompt: InstallPromptEvent | null = null
const installPromptListeners = new Set<(event: InstallPromptEvent | null) => void>()
let installPromptCaptureStarted = false

function emitInstallPrompt() {
  for (const listener of installPromptListeners) listener(deferredInstallPrompt)
}

export function getDeferredInstallPrompt() {
  return deferredInstallPrompt
}

export function subscribeInstallPrompt(
  listener: (event: InstallPromptEvent | null) => void
) {
  installPromptListeners.add(listener)
  return () => installPromptListeners.delete(listener)
}

export function clearDeferredInstallPrompt() {
  deferredInstallPrompt = null
  emitInstallPrompt()
}

/**
 * Catch the browser install banner on the first page and hold it.
 * The banner itself is shown only after sign-in, from the dashboard.
 */
export function startInstallPromptCapture() {
  if (typeof window === 'undefined' || installPromptCaptureStarted) return
  installPromptCaptureStarted = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    if (!canShowInstallPrompt() || isAppInstalled() || getInstallPromptState()) return
    deferredInstallPrompt = event as InstallPromptEvent
    emitInstallPrompt()
  })

  window.addEventListener('appinstalled', () => {
    setInstallPromptState('installed')
    clearDeferredInstallPrompt()
  })
}
