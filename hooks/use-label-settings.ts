'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_LABEL_SETTINGS,
  getLabelSettings,
  LABEL_SETTINGS_CHANGED,
  resolveLabelSize,
  saveLabelSettings,
  type LabelSettings,
} from '@/lib/label-settings'

/** Product label options (size, price) — remembered on this device. */
export function useLabelSettings() {
  const [settings, setSettings] = useState<LabelSettings>(DEFAULT_LABEL_SETTINGS)

  useEffect(() => {
    setSettings(getLabelSettings())
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<LabelSettings>).detail
      setSettings(detail ?? getLabelSettings())
    }
    window.addEventListener(LABEL_SETTINGS_CHANGED, onChange)
    return () => window.removeEventListener(LABEL_SETTINGS_CHANGED, onChange)
  }, [])

  const update = useCallback((patch: Partial<LabelSettings>) => {
    setSettings(saveLabelSettings(patch))
  }, [])

  return { settings, size: resolveLabelSize(settings), update }
}
