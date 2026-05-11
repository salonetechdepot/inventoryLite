"use client"

import { useEffect, useState } from "react"
import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const onInstalled = () => {
      setDeferredPrompt(null)
      setDismissed(true)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (!deferredPrompt || dismissed) return null

  const handleInstall = async () => {
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null)
    }
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-lg rounded-xl border bg-card p-3 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Install StockEasy</p>
          <p className="text-xs text-muted-foreground">Use it like an app, even with poor network.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleInstall}>
            <Download className="mr-1 size-4" />
            Install
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss install prompt"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
