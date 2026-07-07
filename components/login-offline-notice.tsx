"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"
import { isBrowserOffline } from "@/lib/offline-navigation"

export function LoginOfflineNotice() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const sync = () => setIsOffline(isBrowserOffline())
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="mb-4 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground flex gap-2 items-start">
      <WifiOff className="size-4 shrink-0 mt-0.5" />
      <p>
        You are offline. You can open this screen, but sending a sign-in code needs an
        internet connection.
      </p>
    </div>
  )
}
