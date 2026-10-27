'use client'

import { startInstallPromptCapture } from '@/lib/pwa-install'

/** Runs on every page so the browser does not ask to install before sign-in. */
export function InstallPromptCapture() {
  startInstallPromptCapture()
  return null
}
