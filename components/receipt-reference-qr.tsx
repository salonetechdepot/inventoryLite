"use client"

import { useEffect, useState, type ComponentType } from "react"
import { cn } from "@/lib/utils"

type QrProps = {
  value: string
  size?: number
  level?: "L" | "M" | "Q" | "H"
  marginSize?: number
}

type Props = {
  receiptId: string
  className?: string
  size?: number
}

/** Compact QR encoding receipt id for reprint / lookup at the counter. */
export function ReceiptReferenceQr({ receiptId, className, size = 72 }: Props) {
  const [QrCode, setQrCode] = useState<ComponentType<QrProps> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const mod = await import("qrcode.react")
        if (!cancelled) setQrCode(() => mod.QRCodeSVG)
      } catch {
        // QR optional on receipt
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!QrCode || !receiptId.trim()) return null

  const payload = `biva:receipt:${receiptId.trim()}`

  return (
    <div className={cn("receipt-reference-qr flex flex-col items-center gap-1", className)}>
      <QrCode value={payload} size={size} level="M" marginSize={1} />
      <p className="receipt-reference-qr-label text-[9px] font-mono tracking-wide text-muted-foreground print:text-black">
        Scan for receipt ref
      </p>
    </div>
  )
}
