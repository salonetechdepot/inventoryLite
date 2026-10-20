'use client'

import { useEffect, useRef } from 'react'
import {
  attachHardwareScanner,
  type ScanDiagnostics,
  type ScanSource,
} from '@/lib/hardware-scanner'

type Options = {
  enabled: boolean
  paused?: boolean
  allowedInputRef?: React.RefObject<HTMLInputElement | null>
  maxKeyGapMs?: number
  /** Return false to leave the keystrokes to the focused field. */
  onScan: (code: string, source: ScanSource) => boolean | void
  onDiagnostics?: (info: ScanDiagnostics) => void
}

export function useHardwareScanner({
  enabled,
  paused = false,
  allowedInputRef,
  maxKeyGapMs,
  onScan,
  onDiagnostics,
}: Options) {
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const onDiagnosticsRef = useRef(onDiagnostics)
  onDiagnosticsRef.current = onDiagnostics

  useEffect(() => {
    if (!enabled) return
    return attachHardwareScanner({
      enabled: true,
      paused,
      allowedInputRef,
      maxKeyGapMs,
      onScan: (code, source) => onScanRef.current(code, source),
      onDiagnostics: (info) => onDiagnosticsRef.current?.(info),
    })
  }, [enabled, paused, allowedInputRef, maxKeyGapMs])
}
