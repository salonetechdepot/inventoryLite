"use client"

import { useEffect, useState, type ComponentType, type CSSProperties } from "react"
import { BarcodeSvg } from "@/components/barcode-svg"
import { cn } from "@/lib/utils"
import { formatLabelPrice, isValidScanCode } from "@/lib/scan-code"
import { LABEL_LINE_HEIGHT, labelLayout, type LabelSize } from "@/lib/label-settings"

/** Screen preview: widest label fits ~340px; print CSS sets --label-unit to 1mm. */
const PREVIEW_MAX_WIDTH_PX = 340
const PREVIEW_MAX_UNIT_PX = 6

type QrProps = {
  value: string
  size?: number
  level?: "L" | "M" | "Q" | "H"
  marginSize?: number
  style?: CSSProperties
}

type Props = {
  scanCode: string
  size: LabelSize
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

/** Length in label millimetres (scaled on screen, real mm when printing). */
function mm(value: number): string {
  return `calc(var(--label-unit) * ${value.toFixed(2)})`
}

const singleLine: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  lineHeight: LABEL_LINE_HEIGHT,
}

/** Product sticker: "Category · Name" (+ price), QR beside barcode, code number underneath. */
export function ProductLabelPreview({
  scanCode,
  size,
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

  const layout = labelLayout(size)
  const unitPx = Math.min(PREVIEW_MAX_UNIT_PX, PREVIEW_MAX_WIDTH_PX / layout.widthMm)

  return (
    <div
      className={cn(
        "product-label-print-root mx-auto flex flex-col overflow-hidden rounded-sm border bg-white text-black shadow-sm",
        className
      )}
      data-label-width-mm={layout.widthMm}
      data-label-height-mm={layout.heightMm ?? ""}
      style={
        {
          "--label-unit": `${unitPx}px`,
          width: mm(layout.widthMm),
          height: layout.heightMm === null ? undefined : mm(layout.heightMm),
          padding: mm(layout.paddingMm),
          gap: mm(layout.gapMm),
          justifyContent: "space-between",
          boxSizing: "border-box",
        } as CSSProperties
      }
    >
      <div
        className="product-label-header flex items-start justify-between font-bold"
        style={{ gap: mm(layout.gapMm), fontSize: mm(layout.titleFontMm) }}
      >
        <p className="product-label-name min-w-0" style={singleLine}>
          {labelTitle(productName, categoryName)}
        </p>
        {showPrice && (
          <p className="product-label-price shrink-0" style={singleLine}>
            NLe {formatLabelPrice(unitPrice)}
          </p>
        )}
      </div>

      <div
        className="product-label-code-row flex items-center"
        style={{ height: mm(layout.codeRowMm), gap: mm(layout.gapMm) }}
      >
        <div
          className="product-label-qr flex shrink-0 items-center justify-center"
          style={{ width: mm(layout.qrMm), height: mm(layout.qrMm) }}
        >
          {QrCode && (
            <QrCode
              value={trimmed}
              size={256}
              level="M"
              marginSize={0}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
          )}
          {!QrCode && loadError && (
            <p className="product-label-qr-error text-[10px] text-destructive text-center print:hidden">
              QR unavailable
            </p>
          )}
        </div>
        <div className="product-label-barcode h-full min-w-0 flex-1">
          <BarcodeSvg value={trimmed} className="size-full" />
        </div>
      </div>

      <p
        className="product-label-code text-center font-medium"
        style={{ ...singleLine, fontSize: mm(layout.codeFontMm), letterSpacing: "0.06em" }}
      >
        {trimmed}
      </p>
    </div>
  )
}
