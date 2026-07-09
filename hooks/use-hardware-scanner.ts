'use client'

import { useEffect, useRef } from 'react'
import { attachHardwareScanner } from '@/lib/hardware-scanner'

type Options = {
  enabled: boolean
  paused?: boolean
  allowedInputRef?: React.RefObject<HTMLInputElement | null>
  onScan: (code: string) => void
}

export function useHardwareScanner({
  enabled,
  paused = false,
  allowedInputRef,
  onScan,
}: Options) {
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) return
    return attachHardwareScanner({
      enabled: true,
      paused,
      allowedInputRef,
      onScan: (code) => onScanRef.current(code),
    })
  }, [enabled, paused, allowedInputRef])
}
