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

/** First retry after a failed send; doubles on each failure up to MAX_RETRY_MS. */
const BASE_RETRY_MS = 5_000
const MAX_RETRY_MS = 5 * 60_000

/** "enqueue" = a change was just saved on this device; sent quietly in the background. */
type SyncReason = "online" | "mount" | "manual" | "auto" | "enqueue"

function retryDelay(failures: number) {
  const ceiling = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, failures - 1))
  // Jitter so several tills do not all retry at the same instant after an outage.
  return ceiling / 2 + Math.random() * (ceiling / 2)
}

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
  const rerunRef = useRef(false)
  const failuresRef = useRef(0)
  const retryTimerRef = useRef<number | null>(null)
  const runSyncRef = useRef<(reason: SyncReason) => Promise<void>>(async () => {})

  const clearRetry = () => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }

  const scheduleRetry = useCallback((delayMs: number) => {
    clearRetry()
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null
      void runSyncRef.current("auto")
    }, delayMs)
  }, [])

  const runSync = useCallback(
    async (reason: SyncReason) => {
      if (syncingRef.current) {
        // Changes saved while a send is running go out right after it.
        if (reason === "enqueue") rerunRef.current = true
        return
      }
      if (!navigator.onLine) return

      const pending = await getQueuedMutationCount()
      setQueueCount(pending)
      if (pending === 0) {
        failuresRef.current = 0
        setBlockedBy(undefined)
        return
      }

      syncingRef.current = true
      rerunRef.current = false
      setIsSyncing(true)
      clearRetry()

      // Brief delay after reconnect so the network stack is ready.
      if (reason === "online") {
        await new Promise((resolve) => setTimeout(resolve, 800))
      }

      let result: SyncQueueResult | null = null
      try {
        result = await processOfflineQueue()
        await refreshCounts(setQueueCount, setConflictCount)
        setBlockedBy(result.blockedBy)

        if (result.synced > 0 && reason !== "enqueue") {
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
        } else if (result.blockedBy === "sign_in" && (reason === "manual" || reason === "online")) {
          toast({
            title: "Sign in to sync",
            description: "Your waiting sales are safe on this device. Sign in again to send them.",
          })
        } else if (reason === "manual" && result.failed > 0 && result.synced === 0) {
          // Background retries stay quiet; only a tap reports a temporary problem.
          toast({
            title: "Not sent yet",
            description: result.lastError || `${result.failed} change(s) still waiting.`,
          })
        }
      } catch {
        result = { synced: 0, failed: 1, conflicts: 0, blockedBy: "network" }
      } finally {
        syncingRef.current = false
        setIsSyncing(false)
      }

      if (result.blockedBy === "network" || result.blockedBy === "server") {
        failuresRef.current += 1
        scheduleRetry(retryDelay(failuresRef.current))
        return
      }
      if (result.blockedBy) {
        // Sign-in or account lock: nothing to gain from retrying quickly.
        scheduleRetry(MAX_RETRY_MS)
        return
      }
      const stillPending = (await getQueuedMutationCount()) > 0
      if (stillPending && result.synced === 0 && result.conflicts === 0) {
        failuresRef.current += 1
        scheduleRetry(retryDelay(failuresRef.current))
        return
      }
      failuresRef.current = 0
      if (rerunRef.current || stillPending) {
        scheduleRetry(300)
      }
    },
    [scheduleRetry]
  )

  useEffect(() => {
    runSyncRef.current = runSync
  }, [runSync])

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
    const onQueueChanged = (event: Event) => {
      void refreshCounts(setQueueCount, setConflictCount)
      const enqueued = (event as CustomEvent<{ enqueued?: boolean } | undefined>).detail?.enqueued
      if (enqueued && navigator.onLine) void runSync("enqueue")
    }

    window.addEventListener("focus", onResume)
    document.addEventListener("visibilitychange", onResume)
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onQueueChanged)

    return () => {
      clearRetry()
      window.removeEventListener("focus", onResume)
      document.removeEventListener("visibilitychange", onResume)
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onQueueChanged)
    }
  }, [runSync])

  useEffect(() => {
    const updateOfflineState = async () => {
      setIsOnline(false)
      clearRetry()
      await refreshCounts(setQueueCount, setConflictCount)
      toast({
        title: "Offline mode",
        description: "Keep selling — sales are saved on this device and sent when you're back online.",
      })
    }

    const syncWhenOnline = async () => {
      setIsOnline(true)
      failuresRef.current = 0
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

  const idle = isOnline && queueCount === 0 && conflictCount === 0 && !isSyncing
  const needsSignIn = isOnline && !isSyncing && queueCount > 0 && blockedBy === "sign_in"

  const badgeLabel = !isOnline
    ? queueCount > 0
      ? `Offline — ${queueCount} waiting`
      : "Offline"
    : isSyncing
      ? `Syncing ${queueCount}…`
      : needsSignIn
        ? `Sign in to sync ${queueCount}`
        : queueCount > 0
          ? `${queueCount} waiting — tap to sync`
          : conflictCount > 0
            ? `${conflictCount} to review — tap to open`
            : "Online — all synced"

  const handleBadgeClick = () => {
    if (!isOnline || isSyncing) return
    if (needsSignIn) {
      onSignInRequired?.()
      return
    }
    if (queueCount > 0) {
      failuresRef.current = 0
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
      className="fixed left-1/2 top-3 z-50 -translate-x-1/2 print:hidden"
      onClick={handleBadgeClick}
      disabled={!isOnline || isSyncing || (queueCount === 0 && conflictCount === 0)}
      aria-label={badgeLabel}
      aria-live="polite"
    >
      <Badge
        variant={idle ? "outline" : "secondary"}
        className={
          idle
            ? "bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground"
            : "px-3 py-1 text-xs shadow cursor-pointer"
        }
      >
        {idle && <span className="mr-1 inline-block size-1.5 rounded-full bg-green-600" aria-hidden />}
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
