"use client"

import { useEffect, useState, type ComponentType } from "react"
import { BarcodeSvg } from "@/components/barcode-svg"
import { cn } from "@/lib/utils"
import { formatLabelPrice, isValidScanCode } from "@/lib/scan-code"

/** On-screen height of both codes; print CSS sets 15mm. */
const LABEL_CODE_SIZE = 96

type QrProps = {
  value: string
  size?: number
  level?: "L" | "M" | "Q" | "H"
  marginSize?: number
}

type Props = {
  scanCode: string
  productName?: string
  categoryName?: string
  unitPrice?: number | string
  showPrice?: boolean
  className?: string
}

export function labelTitle(productName?: string, categoryName?: string): string {
  const name = productName?.trim() || "Product"
  const category = categoryName?.trim()
  return category ? `${category} · ${name}` : name
}

/** Product sticker: "Category · Name" (+ price), QR beside barcode, code number underneath. */
export function ProductLabelPreview({
  scanCode,
  productName,
  categoryName,
  unitPrice,
  showPrice = false,
  className,
}: Props) {
  const [QrCode, setQrCode] = useState<ComponentType<QrProps> | null>(null)
  const [loadError, setLoadError] = useState(false)
  const trimmed = scanCode.trim()
  const valid = isValidScanCode(trimmed)

  useEffect(() => {
    if (!valid) return

    let cancelled = false
    setLoadError(false)

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
  }, [valid])

  if (!valid) return null

  return (
    <div
      className={cn(
        "product-label-print-root flex flex-col gap-2 rounded-lg border bg-white p-3 text-black",
        className
      )}
    >
      <div className="product-label-header flex items-start justify-between gap-3">
        <p className="product-label-name min-w-0 text-base font-bold leading-tight line-clamp-2">
          {labelTitle(productName, categoryName)}
        </p>
        {showPrice && (
          <p className="product-label-price shrink-0 whitespace-nowrap text-base font-bold leading-tight">
            NLe {formatLabelPrice(unitPrice)}
          </p>
        )}
      </div>

      <div
        className="product-label-code-row flex items-stretch gap-2"
        style={{ height: LABEL_CODE_SIZE }}
      >
        <div
          className="product-label-qr flex shrink-0 items-center justify-center"
          style={{ width: LABEL_CODE_SIZE, height: LABEL_CODE_SIZE }}
        >
          {QrCode && (
            <QrCode value={trimmed} size={LABEL_CODE_SIZE} level="M" marginSize={0} />
          )}
          {!QrCode && loadError && (
            <p className="product-label-qr-error text-[10px] text-destructive text-center print:hidden">
              QR unavailable
            </p>
          )}
        </div>
        <div className="product-label-barcode min-w-0 flex-1">
          <BarcodeSvg value={trimmed} className="size-full" />
        </div>
      </div>

      <p className="product-label-code text-center text-xl font-medium tracking-wider break-all leading-tight">
        {trimmed}
      </p>
    </div>
  )
}
