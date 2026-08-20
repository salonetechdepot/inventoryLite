"use client"

import { useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Download, Printer, ScanLine, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { toast } from "@/hooks/use-toast"
import { SellBarcodeScannerDialog } from "@/components/sell-barcode-scanner-dialog"
import {
  downloadLabelPreviewPng,
  isLabelGraphicReady,
  printProductLabel,
} from "@/lib/product-label-print"
import {
  generateScanCode,
  isValidScanCode,
  scanCodeValidationError,
  type ScanCodeDisplayMode,
} from "@/lib/scan-code"
import { cn } from "@/lib/utils"

const ProductLabelPreview = dynamic(
  () =>
    import("@/components/product-label-preview").then((m) => m.ProductLabelPreview),
  {
    ssr: false,
    loading: () => (
      <p className="text-xs text-muted-foreground py-6 text-center">Loading preview…</p>
    ),
  }
)

type Props = {
  value: string
  onChange: (value: string) => void
  productName?: string
  unitPrice?: number | string
  categoryName?: string
  existingScanCodes?: string[]
  id?: string
}

export function ScanCodeField({
  value,
  onChange,
  productName,
  unitPrice,
  categoryName,
  existingScanCodes = [],
  id = "scanCode",
}: Props) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [displayMode, setDisplayMode] = useState<ScanCodeDisplayMode>("barcode")
  const [scannerOpen, setScannerOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const trimmed = value.trim()
  const showPreview = trimmed.length > 0 && isValidScanCode(trimmed)
  const invalidCode = trimmed.length > 0 && !isValidScanCode(trimmed)

  const otherCodes = useMemo(
    () => existingScanCodes.filter(Boolean),
    [existingScanCodes]
  )

  const handleGenerate = () => {
    if (trimmed) {
      toast({
        title: "Clear the field first",
        description: "Remove the current code before generating a new one.",
      })
      return
    }
    onChange(generateScanCode(otherCodes))
  }

  const handleScan = (code: string) => {
    const next = code.trim()
    if (!next) return
    const err = scanCodeValidationError(next)
    if (err) {
      toast({ title: "Invalid scan code", description: err, variant: "destructive" })
      return
    }
    onChange(next)
    setScannerOpen(false)
    toast({
      title: "Scan code added",
      description: next,
    })
  }

  const handlePrint = () => {
    if (!showPreview || !previewRef.current) return
    if (!isLabelGraphicReady(previewRef.current, displayMode)) {
      toast({
        title: "Label still loading",
        description: "Wait for the barcode or QR code to appear, then try again.",
      })
      return
    }
    setPrinting(true)
    try {
      const ok = printProductLabel(previewRef.current)
      if (!ok) {
        toast({
          title: "Nothing to print",
          description: "Generate a scan code and wait for the preview first.",
          variant: "destructive",
        })
      }
    } finally {
      window.setTimeout(() => setPrinting(false), 500)
    }
  }

  const handleDownload = async () => {
    if (!showPreview || !previewRef.current) return
    setDownloading(true)
    try {
      const safeName = (productName?.trim() || "product")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40)
      const ok = await downloadLabelPreviewPng(
        previewRef.current,
        `${safeName || "product"}-label.png`,
        displayMode
      )
      if (!ok) {
        toast({
          title: "Could not save image",
          description: "Wait for the preview to load, then try again.",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Could not save image",
        variant: "destructive",
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={id} className="text-base">
        Scan code
      </FieldLabel>
      <div className="flex gap-2">
        <Input
          id={id}
          type="text"
          placeholder="Barcode or SKU code"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 text-base flex-1 font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="secondary"
          className="h-12 shrink-0 px-3"
          onClick={handleGenerate}
          title="Generate scan code"
        >
          <Sparkles className="size-4 mr-1" />
          Generate
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 shrink-0 px-3"
          onClick={() => setScannerOpen(true)}
          title="Scan existing barcode"
        >
          <ScanLine className="size-4" />
        </Button>
      </div>

      {invalidCode && (
        <p className="text-xs text-destructive mt-1">
          Use letters, numbers, hyphen, underscore, or dot only (max 255 characters).
        </p>
      )}

      <FieldDescription>
        Only the code is saved. Preview and print the label below — works offline.
      </FieldDescription>

      {showPreview && (
        <div className="mt-3 space-y-3">
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

          <div ref={previewRef} className={cn(printing && "print:block")}>
            <ProductLabelPreview
              scanCode={trimmed}
              mode={displayMode}
              productName={productName}
              unitPrice={unitPrice}
              categoryName={categoryName}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-11"
              disabled={printing}
              onClick={handlePrint}
            >
              <Printer className="size-4 mr-2" />
              Print label
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={downloading}
              onClick={() => void handleDownload()}
            >
              <Download className="size-4 mr-2" />
              {downloading ? "Saving…" : "Save image"}
            </Button>
          </div>
        </div>
      )}

      <SellBarcodeScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />
    </Field>
  )
}
