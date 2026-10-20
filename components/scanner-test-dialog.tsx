"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, CheckCircle2, ScanLine } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useHardwareScanner } from "@/hooks/use-hardware-scanner"
import { usePosSettings } from "@/hooks/use-pos-settings"
import { fetchWithOfflineCache } from "@/lib/offline-sync"
import { SCANNER_SPEEDS } from "@/lib/pos-settings"
import { playScanBeep } from "@/lib/scan-feedback"
import type { ScanDiagnostics } from "@/lib/hardware-scanner"

/** Generous during the test so slow scanners still register and can be measured. */
const TEST_MAX_KEY_GAP_MS = 500

type Verdict = {
  ok: boolean
  title: string
  detail: string
  suggestedGapMs?: number
}

function verdictFor(result: ScanDiagnostics, currentGapMs: number): Verdict {
  if (result.method === "fill") {
    return {
      ok: true,
      title: "Scanner works",
      detail: "Your scanner puts the whole code in at once. BIVA picks it up on the Sell screen.",
    }
  }
  if (!result.terminator) {
    return {
      ok: false,
      title: "Turn on the Enter suffix",
      detail:
        "The barcode arrived, but nothing came after it. In your device's scanner settings, set the suffix (end character) to Enter, CR or LF.",
    }
  }
  const slowest = result.maxGapMs ?? 0
  if (slowest > currentGapMs) {
    const speed = SCANNER_SPEEDS.find((s) => s.keyGapMs >= slowest * 1.25)
    if (!speed) {
      return {
        ok: false,
        title: "Scanner is very slow",
        detail: `It paused up to ${slowest} ms between characters. In the scanner settings, look for "inter-character delay" or "transmission speed" and make it faster.`,
      }
    }
    return {
      ok: false,
      title: "Scanner is slower than the current setting",
      detail: `It paused up to ${slowest} ms between characters, but BIVA currently expects ${currentGapMs} ms or less.`,
      suggestedGapMs: speed.keyGapMs,
    }
  }
  return {
    ok: true,
    title: "Scanner works",
    detail: `Barcode received character by character, ending with ${result.terminator}.`,
  }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ScannerTestDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ScanDiagnostics | null>(null)
  const { settings, update } = usePosSettings()
  const { data } = useSWR<{ products: Array<{ name: string; scan_code: string | null }> }>(
    open ? "/api/products" : null,
    fetchWithOfflineCache
  )

  useEffect(() => {
    if (!open) {
      setResult(null)
      return
    }
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 150)
    return () => window.clearTimeout(timer)
  }, [open])

  useHardwareScanner({
    enabled: open,
    allowedInputRef: inputRef,
    maxKeyGapMs: TEST_MAX_KEY_GAP_MS,
    onScan: () => true,
    onDiagnostics: (info) => {
      setResult(info)
      if (settings.scanBeep) playScanBeep(Boolean(info.method === "fill" || info.terminator))
    },
  })

  const verdict = result ? verdictFor(result, settings.scannerKeyGapMs) : null
  const matchedProduct = result
    ? data?.products.find(
        (product) => product.scan_code?.toLowerCase() === result.code.toLowerCase()
      )
    : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test scanner</DialogTitle>
          <DialogDescription>
            Press the scan button on your device and scan any product barcode.
          </DialogDescription>
        </DialogHeader>

        <Input
          ref={inputRef}
          inputMode="none"
          autoComplete="off"
          placeholder="Waiting for a scan…"
          className="h-12 text-base"
          aria-label="Scanner test input"
        />

        {!settings.hardwareScanner && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <span>Hardware scanner is turned off on the Sell screen.</span>
            <Button size="sm" variant="outline" onClick={() => update({ hardwareScanner: true })}>
              Turn on
            </Button>
          </div>
        )}

        {result && verdict ? (
          <div className="space-y-3">
            <div
              className={cn(
                "rounded-lg border p-3",
                verdict.ok
                  ? "border-primary/40 bg-primary/5"
                  : "border-warning/40 bg-warning/10"
              )}
            >
              <p className="flex items-center gap-2 font-semibold">
                {verdict.ok ? (
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                ) : (
                  <AlertTriangle className="size-5 shrink-0 text-warning" />
                )}
                {verdict.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{verdict.detail}</p>
              {verdict.suggestedGapMs && (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => update({ scannerKeyGapMs: verdict.suggestedGapMs })}
                >
                  Use{" "}
                  {SCANNER_SPEEDS.find((s) => s.keyGapMs === verdict.suggestedGapMs)?.label}{" "}
                  scanner speed
                </Button>
              )}
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border p-3 text-sm">
              <dt className="text-muted-foreground">Code</dt>
              <dd className="break-all font-mono">{result.code}</dd>
              <dt className="text-muted-foreground">Product</dt>
              <dd>
                {matchedProduct ? (
                  matchedProduct.name
                ) : (
                  <span className="text-muted-foreground">
                    No product has this scan code yet
                  </span>
                )}
              </dd>
              <dt className="text-muted-foreground">Input</dt>
              <dd>{result.method === "fill" ? "Whole code at once" : "Typed key by key"}</dd>
              <dt className="text-muted-foreground">Ends with</dt>
              <dd>{result.method === "fill" ? "—" : (result.terminator ?? "Nothing")}</dd>
              {result.maxGapMs !== null && (
                <>
                  <dt className="text-muted-foreground">Speed</dt>
                  <dd>
                    avg {result.avgGapMs} ms, slowest {result.maxGapMs} ms between characters
                  </dd>
                </>
              )}
            </dl>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4 text-center text-sm text-muted-foreground">
            <ScanLine className="size-10" />
            Waiting for a scan…
          </div>
        )}

        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Nothing happens when you scan?</p>
          <p>Open the scanner settings app on your device (often called Scanner, ScanWedge or Barcode settings) and set:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Output mode: Keyboard / keystroke (not Broadcast)</li>
            <li>Suffix: Enter (CR or LF)</li>
            <li>Prefix: none</li>
          </ul>
          <p>Bluetooth scanners on phones: pair them as a keyboard (HID mode).</p>
        </div>

        <DialogFooter>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
