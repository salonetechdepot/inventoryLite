"use client"

import { useEffect, useState } from "react"
import { Download, X, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import {
  canShowInstallPrompt,
  detectInstallPlatform,
  getInstallPromptState,
  isAppInstalled,
  isIosSafari,
  setInstallPromptState,
} from "@/lib/pwa-install"
import { getAppDisplayName } from "@/lib/site"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export function PwaInstallPrompt() {
  const appName = getAppDisplayName()
  const [visible, setVisible] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [platform, setPlatform] = useState(detectInstallPlatform())

  useEffect(() => {
    if (!canShowInstallPrompt()) return
    if (isAppInstalled()) return
    if (getInstallPromptState()) return

    setPlatform(detectInstallPlatform())

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    const onInstalled = () => {
      setInstallPromptState("installed")
      setVisible(false)
      setDeferredPrompt(null)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onInstalled)

    const timer = window.setTimeout(() => {
      if (!isAppInstalled() && !getInstallPromptState()) {
        setVisible(true)
      }
    }, 2000)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const dismiss = () => {
    setInstallPromptState("dismissed")
    setVisible(false)
  }

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === "accepted") {
        setInstallPromptState("installed")
        setVisible(false)
        setDeferredPrompt(null)
      }
      return
    }

    if (isIosSafari()) {
      toast({
        title: "Add to Home Screen",
        description: "Tap Share, then “Add to Home Screen”.",
      })
      return
    }

    toast({
      title: `Install ${appName}`,
      description: "Use the install icon in your browser address bar, or the browser menu → Install app.",
    })
  }

  if (!visible) return null

  const hasNative = Boolean(deferredPrompt)

  return (
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
            Install {appName}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {hasNative
              ? `Add ${appName} to your home screen for quick access and offline use.`
              : platform === "ios"
                ? `Install ${appName} on this iPhone for offline access.`
                : `Install ${appName} on this device for quick access and offline use.`}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button size="sm" onClick={handleInstall}>
              <Download className="mr-1 size-4" />
              Install
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}
