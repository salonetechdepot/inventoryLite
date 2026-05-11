"use client"

import { useState, useRef } from "react"
import { Camera, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ImageUploadProps {
  value?: string
  onChange: (url: string | undefined) => void
  className?: string
  folder?: "products" | "branding"
}

export function ImageUpload({ value, onChange, className, folder = "products" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folder", folder)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Upload failed")
      }

      const data = await res.json()
      onChange(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      // Reset input so same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = ""
      }
    }
  }

  const handleRemove = async () => {
    if (!value) return

    try {
      await fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      })
    } catch {
      // Ignore delete errors - just remove from UI
    }

    onChange(undefined)
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-xl border-2 border-dashed transition-colors",
          value ? "border-transparent" : "border-muted-foreground/25 hover:border-primary/50",
          "h-40 w-full overflow-hidden bg-muted/30"
        )}
      >
        {value ? (
          <>
            <img
              src={value}
              alt="Product"
              className="h-full w-full object-cover"
              crossOrigin="anonymous"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute right-2 top-2 size-8"
              onClick={handleRemove}
            >
              <X className="size-4" />
            </Button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex flex-col items-center gap-2 p-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            {uploading ? (
              <Loader2 className="size-10 animate-spin" />
            ) : (
              <Camera className="size-10" />
            )}
            <span className="text-sm font-medium">
              {uploading ? "Uploading..." : "Tap to add photo"}
            </span>
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  )
}
