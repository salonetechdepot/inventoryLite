"use client"

import { useEffect, useState, type ComponentType } from "react"
import { BarcodeSvg } from "@/components/barcode-svg"
import { cn } from "@/lib/utils"
import {
  formatLabelPrice,
  isValidScanCode,
  type ScanCodeDisplayMode,
} from "@/lib/scan-code"

const THERMAL_LABEL_BARCODE_WIDTH = 200

type QrProps = {
  value: string
  size?: number
  level?: "L" | "M" | "Q" | "H"
  marginSize?: number
}

type Props = {
  scanCode: string
  mode: ScanCodeDisplayMode
  productName?: string
  unitPrice?: number | string
  categoryName?: string
  className?: string
}

export function ProductLabelPreview({
  scanCode,
  mode,
  productName,
  unitPrice,
  categoryName,
  className,
}: Props) {
  const [QrCode, setQrCode] = useState<ComponentType<QrProps> | null>(null)
  const [loadError, setLoadError] = useState(false)
  const trimmed = scanCode.trim()
  const valid = isValidScanCode(trimmed)

  useEffect(() => {
    if (!valid || mode !== "qr") {
      setQrCode(null)
      setLoadError(false)
      return
    }

    let cancelled = false
    setLoadError(false)
    setQrCode(null)

    async function load() {
      try {
        const mod = await import("qrcode.react")
        if (!cancelled) setQrCode(() => mod.QRCodeSVG)
      } catch {
        if (!cancelled) setLoadError(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [mode, trimmed, valid])

  if (!valid) return null

  const nameLine = productName?.trim() || "Product"
  const priceLine = `NLe ${formatLabelPrice(unitPrice)}`
  const categoryLine = categoryName?.trim() || "Uncategorized"

  return (
    <div
      className={cn(
        "product-label-print-root flex flex-col items-center gap-1.5 text-center rounded-lg border bg-white p-4",
        className
      )}
    >
      <p className="product-label-name font-semibold text-sm leading-tight line-clamp-2 w-full">
        {nameLine}
      </p>
      <p className="product-label-price text-sm font-bold text-primary w-full">{priceLine}</p>
      <p className="product-label-category text-xs text-muted-foreground w-full">
        {categoryLine}
      </p>

      <div className="flex justify-center w-full min-h-[56px] product-label-code-graphic">
        {mode === "barcode" && (
          <BarcodeSvg value={trimmed} maxWidth={THERMAL_LABEL_BARCODE_WIDTH} />
        )}
        {mode === "qr" && loadError && (
          <p className="text-xs text-destructive">Could not load label preview.</p>
        )}
        {mode === "qr" && !loadError && !QrCode && (
          <p className="text-xs text-muted-foreground">Loading preview…</p>
        )}
        {mode === "qr" && !loadError && QrCode && (
          <QrCode value={trimmed} size={100} level="M" marginSize={1} />
        )}
      </div>

      <p className="product-label-code text-[10px] font-mono tracking-wide break-all w-full">
        {trimmed}
      </p>
    </div>
  )
}
