"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, CheckCircle2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import {
  clearConflicts,
  dismissConflict,
  listConflicts,
  type SyncConflict,
} from "@/lib/offline-sync"
import {
  describeSyncConflict,
  formatConflictTime,
} from "@/lib/sync-conflict-display"

export default function SyncConflictsPage() {
  const router = useRouter()
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const rows = await listConflicts()
    setConflicts(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleDismiss = async (id: string) => {
    await dismissConflict(id)
    await refresh()
    toast({ title: "Conflict dismissed" })
  }

  const handleDismissAll = async () => {
    await clearConflicts()
    await refresh()
    toast({ title: "All conflicts cleared" })
    router.push("/dashboard")
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
              Changes made offline could not be applied on the server. Review each
              item, fix data if needed, then dismiss.
            </p>
          </div>
          {conflicts.length > 0 && (
            <Badge variant="secondary">{conflicts.length}</Badge>
          )}
        </div>
      </header>

      <Card className="border-dashed">
        <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">What to do</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Sale conflicts</strong> often mean stock ran out online — check
              products and re-enter the sale if needed.
            </li>
            <li>
              <strong>Product conflicts</strong> may be a duplicate scan code or
              stale edit — refresh Products and try again.
            </li>
            <li>
              Dismissing removes the local record only. It does not undo server data.
            </li>
          </ul>
        </CardContent>
      </Card>

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
        <>
          <ul className="space-y-3">
            {conflicts.map((conflict) => {
              const { title, detail } = describeSyncConflict(conflict)
              return (
                <li key={conflict.id}>
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{title}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {detail}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatConflictTime(conflict.createdAt)} · HTTP{" "}
                            {conflict.status}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {conflict.method}
                        </Badge>
                      </div>
                      <p className="text-xs rounded-md bg-destructive/10 text-destructive p-2">
                        {conflict.reason}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => void handleDismiss(conflict.id)}
                      >
                        Dismiss
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>

          <Button
            variant="destructive"
            className="w-full h-12"
            onClick={() => void handleDismissAll()}
          >
            <Trash2 className="mr-2 size-4" />
            Dismiss all ({conflicts.length})
          </Button>
        </>
      )}
    </main>
  )
}
