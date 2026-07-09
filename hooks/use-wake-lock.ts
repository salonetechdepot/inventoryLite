'use client'

import { useEffect } from 'react'

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinel>
  }
}

/**
 * Keep the screen awake during active selling (Screen Wake Lock API).
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return

    const nav = navigator as NavigatorWithWakeLock
    if (!nav.wakeLock?.request) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        if (cancelled) return
        sentinel = await nav.wakeLock!.request('screen')
        sentinel.addEventListener('release', () => {
          if (!cancelled) void acquire()
        })
      } catch {
        // Permission denied or unsupported — ignore.
      }
    }

    void acquire()

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        void acquire()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release()
    }
  }, [enabled])
}
