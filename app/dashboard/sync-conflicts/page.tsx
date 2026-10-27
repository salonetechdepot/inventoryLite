"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import {
  dismissConflictAndReconcile,
  listConflicts,
  reloadShopFromServer,
  retrySyncConflict,
  type SyncConflict,
} from "@/lib/offline-sync"
import {
  describeSyncConflict,
  formatConflictTime,
} from "@/lib/sync-conflict-display"

export default function SyncConflictsPage() {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const rows = await listConflicts()
    setConflicts(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleReloadShop = async () => {
    const ok = window.confirm(
      "Reload shop data from the server?\n\nThis phone will forget waiting sales that were never sent. Any of those sales must be entered again. Products and receipts will then match the server."
    )
    if (!ok) return
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast({
        title: "Go online first",
        description: "Connect to the internet, then reload shop data.",
        variant: "destructive",
      })
      return
    }

    setReloading(true)
    const result = await reloadShopFromServer()
    if (!result.ok) {
      setReloading(false)
      await refresh()
      toast({
        title: "Could not reload",
        description: result.reason,
        variant: "destructive",
      })
      return
    }

    toast({ title: "Shop data reloaded", description: "This phone now matches the server." })
    window.location.assign("/dashboard")
  }

  const handleDismiss = async (id: string) => {
    await dismissConflictAndReconcile(id)
    await refresh()
    toast({ title: "Using server copy", description: "This phone was updated from the server." })
  }

  const handleRetry = async (id: string) => {
    const result = await retrySyncConflict(id)
    await refresh()
    if (result && "ok" in result && result.ok === false) {
      toast({ title: "Could not send", description: result.reason, variant: "destructive" })
      return
    }
    if (result && "conflicts" in result && result.conflicts > 0) {
      toast({
        title: "Still blocked",
        description: "Reload shop data below if this keeps failing.",
        variant: "destructive",
      })
      return
    }
    if (result && "synced" in result && result.synced === 0) {
      toast({
        title: "Waiting to send",
        description: result.lastError || "The change is waiting and will send when it can.",
      })
      return
    }
    toast({ title: "Sent", description: "The change is now on the server." })
  }

  return (
    <main className="pb-24 p-4 space-y-4">
      <header className="space-y-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4 mr-1" />
          Dashboard
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="size-7 text-warning" />
              Sync conflicts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              This phone saved a change the server will not accept. Reload shop
              data to use the server copy.
            </p>
          </div>
          {conflicts.length > 0 && (
            <Badge variant="secondary">{conflicts.length}</Badge>
          )}
        </div>
      </header>

      {conflicts.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              If Send my change and Use server both fail, reload shop data. You
              stay signed in. Sales that never reached the server must be entered
              again.
            </p>
            <Button
              className="w-full h-12"
              onClick={() => void handleReloadShop()}
              disabled={reloading}
            >
              <RefreshCw className={`mr-2 size-4 ${reloading ? "animate-spin" : ""}`} />
              {reloading ? "Reloading shop data…" : "Reload shop data"}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : conflicts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="size-10 text-primary mx-auto" />
            <p className="font-semibold">No sync conflicts</p>
            <p className="text-sm text-muted-foreground">
              Offline changes are in sync with the server.
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {conflicts.map((conflict) => {
            const { title, detail } = describeSyncConflict(conflict)
            return (
              <li key={conflict.id}>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{detail}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatConflictTime(conflict.createdAt)}
                      </p>
                    </div>
                    <p className="text-sm rounded-md bg-destructive/10 text-destructive p-2">
                      {conflict.reason}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={reloading}
                        onClick={() => void handleRetry(conflict.id)}
                      >
                        Send my change
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1"
                        disabled={reloading}
                        onClick={() => void handleDismiss(conflict.id)}
                      >
                        Use server
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
