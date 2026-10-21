"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CloudOff, LogIn, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import {
  getConflictCount,
  getQueuedMutationCount,
  OFFLINE_QUEUE_CHANGED_EVENT,
  processOfflineQueue,
  type SyncQueueResult,
} from "@/lib/offline-sync"

/** Retry waiting changes while online, without the cashier tapping anything. */
const AUTO_RETRY_MS = 60_000

type SyncReason = "online" | "mount" | "manual" | "auto"

async function refreshCounts(
  setQueueCount: (n: number) => void,
  setConflictCount: (n: number) => void
) {
  setQueueCount(await getQueuedMutationCount())
  setConflictCount(await getConflictCount())
}

type Props = {
  /** Called when waiting changes need a fresh sign-in (expired or revoked session). */
  onSignInRequired?: () => void
}

export function OfflineSync({ onSignInRequired }: Props) {
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(true)
  const [queueCount, setQueueCount] = useState(0)
  const [conflictCount, setConflictCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [blockedBy, setBlockedBy] = useState<SyncQueueResult["blockedBy"]>()
  const syncingRef = useRef(false)

  const runSync = useCallback(async (reason: SyncReason) => {
    if (syncingRef.current) return
    if (!navigator.onLine) return

    const pending = await getQueuedMutationCount()
    setQueueCount(pending)
    if (pending === 0) {
      setBlockedBy(undefined)
      return
    }

    syncingRef.current = true
    setIsSyncing(true)

    // Brief delay after reconnect so the network stack is ready.
    if (reason === "online") {
      await new Promise((resolve) => setTimeout(resolve, 800))
    }

    try {
      const result = await processOfflineQueue()
      await refreshCounts(setQueueCount, setConflictCount)
      setBlockedBy(result.blockedBy)

      if (result.synced > 0) {
        toast({
          title: "Sync complete",
          description: `${result.synced} waiting change(s) sent.`,
        })
      }

      if (result.conflicts > 0) {
        toast({
          title: "Some changes need review",
          description: result.lastError || `${result.conflicts} change(s) need review.`,
          variant: "destructive",
        })
        return
      }

      if (result.blockedBy === "sign_in" && reason !== "auto") {
        toast({
          title: "Sign in to sync",
          description: "Your waiting sales are safe on this device. Sign in again to send them.",
        })
        return
      }

      // Background retries stay quiet; only a tap reports a temporary problem.
      if (reason === "manual" && result.failed > 0 && result.synced === 0) {
        toast({
          title: "Not sent yet",
          description: result.lastError || `${result.failed} change(s) still waiting.`,
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

    const onResume = () => {
      if (document.visibilityState !== "visible") return
      void refreshCounts(setQueueCount, setConflictCount)
      void runSync("auto")
    }
    const onQueueChanged = () => {
      void refreshCounts(setQueueCount, setConflictCount)
    }
    const intervalId = window.setInterval(() => void runSync("auto"), AUTO_RETRY_MS)

    window.addEventListener("focus", onResume)
    document.addEventListener("visibilitychange", onResume)
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onQueueChanged)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onResume)
      document.removeEventListener("visibilitychange", onResume)
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onQueueChanged)
    }
  }, [runSync])

  useEffect(() => {
    const updateOfflineState = async () => {
      setIsOnline(false)
      await refreshCounts(setQueueCount, setConflictCount)
      toast({
        title: "Offline mode",
        description: "Keep selling — sales are saved on this device and sent when you're back online.",
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

  const needsSignIn = isOnline && !isSyncing && queueCount > 0 && blockedBy === "sign_in"

  const badgeLabel = !isOnline
    ? queueCount > 0
      ? `Offline — ${queueCount} waiting`
      : "Offline"
    : isSyncing
      ? "Syncing…"
      : needsSignIn
        ? `Sign in to sync ${queueCount}`
        : queueCount > 0
          ? `${queueCount} waiting — tap to sync`
          : `${conflictCount} to review — tap to open`

  const handleBadgeClick = () => {
    if (!isOnline || isSyncing) return
    if (needsSignIn) {
      onSignInRequired?.()
      return
    }
    if (queueCount > 0) {
      void runSync("manual")
      return
    }
    if (conflictCount > 0) {
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
        {!isOnline && <CloudOff className="mr-1 size-3" />}
        {isOnline && isSyncing && <RefreshCw className="mr-1 size-3 animate-spin" />}
        {needsSignIn && <LogIn className="mr-1 size-3" />}
        {isOnline && !isSyncing && queueCount === 0 && conflictCount > 0 && (
          <AlertTriangle className="mr-1 size-3" />
        )}
        {badgeLabel}
      </Badge>
    </button>
  )
}
