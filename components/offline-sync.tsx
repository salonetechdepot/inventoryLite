"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CloudOff, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import {
  getConflictCount,
  getQueuedMutationCount,
  processOfflineQueue,
} from "@/lib/offline-sync"

async function refreshCounts(
  setQueueCount: (n: number) => void,
  setConflictCount: (n: number) => void
) {
  setQueueCount(await getQueuedMutationCount())
  setConflictCount(await getConflictCount())
}

export function OfflineSync() {
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(true)
  const [queueCount, setQueueCount] = useState(0)
  const [conflictCount, setConflictCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncingRef = useRef(false)

  const runSync = useCallback(async (reason: "online" | "mount" | "manual") => {
    if (syncingRef.current) return
    if (!navigator.onLine) return

    const pending = await getQueuedMutationCount()
    setQueueCount(pending)
    if (pending === 0) return

    syncingRef.current = true
    setIsSyncing(true)

    // Brief delay after reconnect so the network stack is ready.
    if (reason === "online") {
      await new Promise((resolve) => setTimeout(resolve, 800))
    }

    try {
      const result = await processOfflineQueue()
      await refreshCounts(setQueueCount, setConflictCount)

      if (result.synced > 0) {
        toast({
          title: "Sync complete",
          description: `${result.synced} queued change(s) synced.`,
        })
        // Reload data-heavy views that use IndexedDB cache.
        window.location.reload()
        return
      }

      if (result.conflicts > 0) {
        toast({
          title: "Sync conflicts",
          description: result.lastError || `${result.conflicts} change(s) need review.`,
          variant: "destructive",
        })
        return
      }

      if (result.failed > 0) {
        toast({
          title: "Sync incomplete",
          description: result.lastError || `${result.failed} change(s) still pending.`,
        })
      }
    } finally {
      syncingRef.current = false
      setIsSyncing(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      setIsOnline(navigator.onLine)
      await refreshCounts(setQueueCount, setConflictCount)
      if (navigator.onLine) {
        void runSync("mount")
      }
    }
    void init()

    const onVisible = () => {
      void refreshCounts(setQueueCount, setConflictCount)
    }
    window.addEventListener("focus", onVisible)
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [runSync])

  useEffect(() => {
    const updateOfflineState = async () => {
      setIsOnline(false)
      await refreshCounts(setQueueCount, setConflictCount)
      toast({
        title: "Offline mode",
        description: "Changes will be saved locally and synced later.",
      })
    }

    const syncWhenOnline = async () => {
      setIsOnline(true)
      await refreshCounts(setQueueCount, setConflictCount)
      void runSync("online")
    }

    window.addEventListener("offline", updateOfflineState)
    window.addEventListener("online", syncWhenOnline)

    return () => {
      window.removeEventListener("offline", updateOfflineState)
      window.removeEventListener("online", syncWhenOnline)
    }
  }, [runSync])

  if (isOnline && queueCount === 0 && conflictCount === 0 && !isSyncing) return null

  const badgeLabel = !isOnline
    ? "Offline"
    : isSyncing
      ? "Syncing…"
      : queueCount > 0
        ? `${queueCount} pending — tap to sync`
        : `${conflictCount} conflict${conflictCount === 1 ? "" : "s"} — tap to review`

  const handleBadgeClick = () => {
    if (isOnline && !isSyncing && queueCount > 0) {
      void runSync("manual")
      return
    }
    if (isOnline && !isSyncing && conflictCount > 0) {
      router.push("/dashboard/sync-conflicts")
    }
  }

  return (
    <button
      type="button"
      className="fixed left-1/2 top-3 z-50 -translate-x-1/2"
      onClick={handleBadgeClick}
      disabled={!isOnline || isSyncing || (queueCount === 0 && conflictCount === 0)}
      aria-label={badgeLabel}
    >
      <Badge variant="secondary" className="px-3 py-1 text-xs shadow cursor-pointer">
        {!isOnline && (
          <>
            <CloudOff className="mr-1 size-3" />
            Offline
          </>
        )}
        {isOnline && isSyncing && (
          <>
            <RefreshCw className="mr-1 size-3 animate-spin" />
            Syncing…
          </>
        )}
        {isOnline && !isSyncing && queueCount > 0 && badgeLabel}
        {isOnline && !isSyncing && queueCount === 0 && conflictCount > 0 && (
          <>
            <AlertTriangle className="mr-1 size-3" />
            {conflictCount} conflict{conflictCount === 1 ? "" : "s"}
          </>
        )}
      </Badge>
    </button>
  )
}
