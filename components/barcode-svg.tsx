"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type Props = {
  value: string
  className?: string
  /** Target width in px — use ~200 for 58mm thermal labels. */
  maxWidth?: number
}

function moduleWidthForValue(value: string, maxWidth: number): number {
  const modules = Math.max(value.length * 11 + 35, 60)
  return Math.min(2.5, Math.max(1.25, maxWidth / modules))
}

/** Code 128 as PNG img — reliable on screen and in thermal print dialogs. */
export function BarcodeSvg({ value, className, maxWidth = 280 }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const trimmed = value.trim()
    if (!trimmed) {
      setSrc(null)
      setError(false)
      return
    }

    let cancelled = false
    setError(false)
    setSrc(null)

    async function render() {
      try {
        const { default: JsBarcode } = await import("jsbarcode")
        if (cancelled) return

        const canvas = document.createElement("canvas")
        const barWidth = moduleWidthForValue(trimmed, maxWidth)
        JsBarcode(canvas, trimmed, {
          format: "CODE128",
          width: barWidth,
          height: 56,
          margin: 10,
          displayValue: false,
          background: "#ffffff",
          lineColor: "#000000",
        })

        if (cancelled) return
        setSrc(canvas.toDataURL("image/png"))
      } catch {
        if (!cancelled) setError(true)
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [value, maxWidth])

  if (error) {
    return (
      <p className="text-xs text-destructive text-center py-2">
        Could not render barcode for this code.
      </p>
    )
  }

  if (!src) {
    return <div className="min-h-[56px] w-full" aria-busy aria-label="Loading barcode" />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cn("block max-w-full h-auto mx-auto product-label-barcode-img", className)}
      style={{ maxWidth, width: "100%" }}
    />
  )
}
