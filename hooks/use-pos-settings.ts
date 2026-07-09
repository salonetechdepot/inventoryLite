'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getPosSettings,
  POS_SETTINGS_CHANGED,
  savePosSettings,
  type PosSettings,
} from '@/lib/pos-settings'

export function usePosSettings() {
  const [settings, setSettings] = useState<PosSettings>(() => getPosSettings())

  useEffect(() => {
    const sync = () => setSettings(getPosSettings())
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<PosSettings>).detail
      if (detail) setSettings(detail)
      else sync()
    }
    window.addEventListener(POS_SETTINGS_CHANGED, onCustom)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(POS_SETTINGS_CHANGED, onCustom)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const update = useCallback((patch: Partial<PosSettings>) => {
    setSettings(savePosSettings(patch))
  }, [])

  return { settings, update }
}
