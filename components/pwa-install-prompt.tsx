"use client"

import { useEffect, useState } from "react"
import { Download, Share, X, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  detectInstallPlatform,
  getInstallPromptState,
  isAppInstalled,
  isProductionClient,
  setInstallPromptState,
  type InstallPlatform,
} from "@/lib/pwa-install"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

function platformHint(platform: InstallPlatform, hasNativePrompt: boolean): string {
  if (hasNativePrompt) {
    return "Install StockEasy on this device for quick access and offline use."
  }
  if (platform === "ios") {
    return "Add StockEasy to your home screen — works like an app, even with poor network."
  }
  if (platform === "android") {
    return "Install from your browser menu (⋮) → Install app or Add to Home screen."
  }
  return "Install from your browser menu or the install icon in the address bar."
}

function ManualInstallSteps({ platform }: { platform: InstallPlatform }) {
  if (platform === "ios") {
    return (
      <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
        <li>
          Tap <Share className="inline size-4 align-text-bottom" /> <strong>Share</strong> in
          Safari (bottom bar on iPhone).
        </li>
        <li>
          Scroll and tap <strong>Add to Home Screen</strong>.
        </li>
        <li>
          Tap <strong>Add</strong> — StockEasy opens like a normal app.
        </li>
      </ol>
    )
  }

  if (platform === "android") {
    return (
      <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
        <li>Open the browser menu (⋮ three dots).</li>
        <li>
          Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </li>
        <li>Confirm — StockEasy appears on your home screen.</li>
      </ol>
    )
  }

  return (
    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
      <li>
        Look for an <strong>Install</strong> icon in the address bar (Chrome / Edge), or open the
        browser menu.
      </li>
      <li>
        Choose <strong>Install StockEasy</strong> or <strong>Install app</strong>.
      </li>
      <li>Open it from your apps list or desktop shortcut.</li>
    </ol>
  )
}

export function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [platform, setPlatform] = useState<InstallPlatform>("unknown")

  useEffect(() => {
    if (!isProductionClient()) return
    if (isAppInstalled()) return
    if (getInstallPromptState()) return

    setPlatform(detectInstallPlatform())

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const onInstalled = () => {
      setInstallPromptState("installed")
      setVisible(false)
      setShowGuide(false)
      setDeferredPrompt(null)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onInstalled)

    const timer = window.setTimeout(() => {
      if (!isAppInstalled() && !getInstallPromptState()) {
        setVisible(true)
      }
    }, 1500)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const dismiss = () => {
    setInstallPromptState("dismissed")
    setVisible(false)
    setShowGuide(false)
  }

  const handleNativeInstall = async () => {
    if (!deferredPrompt) {
      setShowGuide(true)
      return
    }
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === "accepted") {
      setInstallPromptState("installed")
      setVisible(false)
      setDeferredPrompt(null)
    }
  }

  if (!visible) return null

  const hasNative = Boolean(deferredPrompt)

  return (
    <>
      <div
        className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-lg rounded-xl border bg-card p-4 shadow-lg"
        role="dialog"
        aria-labelledby="pwa-install-title"
      >
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Smartphone className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p id="pwa-install-title" className="text-sm font-semibold">
              Install StockEasy
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {platformHint(platform, hasNative)}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Button size="sm" onClick={handleNativeInstall}>
                <Download className="mr-1 size-4" />
                {hasNative ? "Install now" : "How to install"}
              </Button>
              {!hasNative && (
                <Button size="sm" variant="outline" onClick={() => setShowGuide(true)}>
                  Show steps
                </Button>
              )}
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={dismiss}
            aria-label="Not now"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Install StockEasy</DialogTitle>
            <DialogDescription>
              Follow these steps in your browser. You only need to do this once on this device.
            </DialogDescription>
          </DialogHeader>
          <ManualInstallSteps platform={platform} />
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={dismiss}>
              Not now
            </Button>
            {hasNative && (
              <Button className="w-full sm:w-auto" onClick={handleNativeInstall}>
                <Download className="mr-2 size-4" />
                Install now
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
