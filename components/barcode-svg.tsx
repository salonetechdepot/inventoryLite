"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { isValidEan13 } from "@/lib/scan-code"

type Props = {
  value: string
  className?: string
}

/** White space scanners need on each side of the bars, in bar-width units. */
const QUIET_ZONE_MODULES = 11
const MODULE_WIDTH = 2
const BAR_HEIGHT = 100

/**
 * Vector barcode that stretches to fill its box (set width/height with CSS), so it
 * can match the QR code's height without losing bars. EAN-13 for valid 13-digit
 * codes, Code 128 for everything else.
 */
export function BarcodeSvg({ value, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const svg = svgRef.current
    const trimmed = value.trim()
    setReady(false)
    setError(false)
    if (!svg || !trimmed) return

    let cancelled = false

    async function render() {
      try {
        const { default: JsBarcode } = await import("jsbarcode")
        if (cancelled || !svg) return

        const quietZone = QUIET_ZONE_MODULES * MODULE_WIDTH
        JsBarcode(svg, trimmed, {
          format: isValidEan13(trimmed) ? "EAN13" : "CODE128",
          flat: true,
          width: MODULE_WIDTH,
          height: BAR_HEIGHT,
          marginTop: 0,
          marginBottom: 0,
          marginLeft: quietZone,
          marginRight: quietZone,
          displayValue: false,
          background: "#ffffff",
          lineColor: "#000000",
        })

        const width = Number.parseFloat(svg.getAttribute("width") ?? "")
        const height = Number.parseFloat(svg.getAttribute("height") ?? "")
        if (width && height) svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
        svg.setAttribute("preserveAspectRatio", "none")
        svg.removeAttribute("style")
        if (!cancelled) setReady(true)
      } catch {
        if (!cancelled) setError(true)
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [value])

  return (
    <>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        data-ready={ready ? "true" : undefined}
        aria-label={`Barcode ${value}`}
        role="img"
        className={cn("product-label-barcode-svg block", error && "hidden", className)}
      />
      {error && (
        <p className="text-xs text-destructive text-center py-2">
          Could not render barcode for this code.
        </p>
      )}
    </>
  )
}
