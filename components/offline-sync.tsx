"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CloudOff, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { getConflictCount, getQueuedMutationCount, processOfflineQueue } from "@/lib/offline-sync"

export function OfflineSync() {
  const [isOnline, setIsOnline] = useState(true)
  const [queueCount, setQueueCount] = useState(0)
  const [conflictCount, setConflictCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    const loadCounts = async () => {
      setIsOnline(navigator.onLine)
      setQueueCount(await getQueuedMutationCount())
      setConflictCount(await getConflictCount())
    }
    void loadCounts()
  }, [])

  useEffect(() => {
    const updateOfflineState = async () => {
      setIsOnline(false)
      setQueueCount(await getQueuedMutationCount())
      setConflictCount(await getConflictCount())
      toast({
        title: "Offline mode",
        description: "Changes will be saved locally and synced later.",
      })
    }

    const syncWhenOnline = async () => {
      setIsOnline(true)
      const queuedBeforeSync = await getQueuedMutationCount()
      setQueueCount(queuedBeforeSync)
      setConflictCount(await getConflictCount())

      if (queuedBeforeSync === 0) return

      setIsSyncing(true)
      const result = await processOfflineQueue()
      setIsSyncing(false)
      setQueueCount(await getQueuedMutationCount())
      setConflictCount(await getConflictCount())

      if (result.synced > 0) {
        toast({
          title: "Sync complete",
          description: `${result.synced} queued change(s) synced.`,
        })
      }

      if (result.failed > 0) {
        toast({
          title: "Sync incomplete",
          description: `${result.failed} change(s) still pending.`,
        })
      }

      if (result.conflicts > 0) {
        toast({
          title: "Sync conflicts detected",
          description: `${result.conflicts} change(s) require manual review.`,
        })
      }
    }

    window.addEventListener("offline", updateOfflineState)
    window.addEventListener("online", syncWhenOnline)

    return () => {
      window.removeEventListener("offline", updateOfflineState)
      window.removeEventListener("online", syncWhenOnline)
    }
  }, [])

  if (isOnline && queueCount === 0 && conflictCount === 0 && !isSyncing) return null

  return (
    <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2">
      <Badge variant="secondary" className="px-3 py-1 text-xs shadow">
        {!isOnline && (
          <>
            <CloudOff className="mr-1 size-3" />
            Offline
          </>
        )}
        {isOnline && isSyncing && (
          <>
            <RefreshCw className="mr-1 size-3 animate-spin" />
            Syncing...
          </>
        )}
        {isOnline && !isSyncing && queueCount > 0 && `${queueCount} pending sync`}
        {isOnline && !isSyncing && conflictCount > 0 && (
          <>
            {queueCount > 0 ? " - " : ""}
            <AlertTriangle className="mx-1 inline size-3" />
            {conflictCount} conflict{conflictCount === 1 ? "" : "s"}
          </>
        )}
      </Badge>
    </div>
  )
}
