"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  barcodeDetectorSupported,
  createBarcodeDetector,
  scanVideoForBarcode,
  startCameraStream,
} from "@/lib/barcode-scanner"

type Props = {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
}

export function SellBarcodeScannerDialog({ open, onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const stopScanRef = useRef<(() => void) | null>(null)
  const onScanRef = useRef(onScan)
  const onCloseRef = useRef(onClose)
  const [error, setError] = useState("")
  const [cameraReady, setCameraReady] = useState(false)
  const canAutoScan = barcodeDetectorSupported()

  onScanRef.current = onScan
  onCloseRef.current = onClose

  const stopAll = () => {
    stopScanRef.current?.()
    stopScanRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraReady(false)
  }

  useEffect(() => {
    if (!open) {
      stopAll()
      setError("")
      return
    }

    let cancelled = false

    const boot = async () => {
      setError("")
      try {
        const stream = await startCameraStream()
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setCameraReady(true)

        if (!canAutoScan) return

        const detector = await createBarcodeDetector()
        if (!detector || cancelled) return

        stopScanRef.current = scanVideoForBarcode(
          video,
          detector,
          (code) => {
            onScanRef.current(code)
            onCloseRef.current()
          },
          (msg) => setError(msg)
        )
      } catch {
        setError(
          'Could not use the camera. Allow camera access, or use a handheld scanner in the search box below.'
        )
      }
    }

    void boot()

    return () => {
      cancelled = true
      stopAll()
    }
  }, [open, canAutoScan])

  const submitManual = (value: string) => {
    const code = value.trim()
    if (!code) return
    onScan(code)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan product</DialogTitle>
          <DialogDescription>
            {canAutoScan
              ? "Point the camera at the barcode. It should add the product automatically."
              : "This browser cannot auto-scan from the camera. Use a Bluetooth/USB scanner in the search box, or type the code below."}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">
            {error}
          </div>
        ) : (
          <div className="relative aspect-square max-h-[50vh] bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="size-full object-cover"
            />
            {cameraReady && canAutoScan && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-4/5 h-1/3 border-2 border-primary rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-center text-xs text-muted-foreground">
            Handheld scanner: focus the <strong>Search</strong> box on Sell and scan — most
            Bluetooth/USB guns work without opening this dialog.
          </p>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Or type / paste barcode here…"
            className="h-12 text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                submitManual(e.currentTarget.value)
                e.currentTarget.value = ""
              }
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
