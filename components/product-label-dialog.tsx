"use client"

import { useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import {
  downloadLabelPreviewPng,
  isLabelGraphicReady,
} from "@/lib/product-label-print"
import { printLabelWithHint } from "@/lib/thermal-print-actions"
import type { ScanCodeDisplayMode } from "@/lib/scan-code"

const ProductLabelPreview = dynamic(
  () =>
    import("@/components/product-label-preview").then((m) => m.ProductLabelPreview),
  {
    ssr: false,
    loading: () => (
      <p className="text-xs text-muted-foreground py-6 text-center">Loading label…</p>
    ),
  }
)

export type ProductLabelProduct = {
  name: string
  unit_price: number
  category_name?: string | null
  scan_code: string
}

type Props = {
  product: ProductLabelProduct | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProductLabelDialog({ product, open, onOpenChange }: Props) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [displayMode, setDisplayMode] = useState<ScanCodeDisplayMode>("barcode")
  const [printing, setPrinting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  if (!product?.scan_code?.trim()) return null

  const scanCode = product.scan_code.trim()

  const handlePrint = () => {
    if (!previewRef.current) return
    if (!isLabelGraphicReady(previewRef.current, displayMode)) {
      toast({
        title: "Label still loading",
        description: "Wait for the barcode or QR code to appear, then try again.",
      })
      return
    }
    setPrinting(true)
    try {
      const ok = printLabelWithHint(previewRef.current)
      if (!ok) {
        toast({ title: "Nothing to print", variant: "destructive" })
      }
    } finally {
      window.setTimeout(() => setPrinting(false), 500)
    }
  }

  const handleDownload = async () => {
    if (!previewRef.current) return
    setDownloading(true)
    try {
      const safeName = product.name
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40)
      await downloadLabelPreviewPng(
        previewRef.current,
        `${safeName || "product"}-label.png`,
        displayMode
      )
    } catch {
      toast({ title: "Could not save image", variant: "destructive" })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print product label</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">{product.name}</p>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={displayMode === "barcode" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setDisplayMode("barcode")}
          >
            Barcode
          </Button>
          <Button
            type="button"
            size="sm"
            variant={displayMode === "qr" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setDisplayMode("qr")}
          >
            QR code
          </Button>
        </div>

        <div ref={previewRef}>
          <ProductLabelPreview
            scanCode={scanCode}
            mode={displayMode}
            productName={product.name}
            unitPrice={product.unit_price}
            categoryName={product.category_name ?? undefined}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" disabled={printing} onClick={handlePrint}>
            <Printer className="size-4 mr-2" />
            Print label
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={downloading}
            onClick={() => void handleDownload()}
          >
            <Download className="size-4 mr-2" />
            {downloading ? "Saving…" : "Save image"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
