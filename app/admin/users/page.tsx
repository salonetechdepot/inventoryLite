"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Search,
  Trash2,
  UserX,
  Package,
  Receipt,
  ShoppingCart,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/hooks/use-toast"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface AdminUserRow {
  id: string
  email: string
  phone_e164: string | null
  business_name: string
  created_at: string
  product_count: number
  receipt_count: number
  sale_count: number
  is_admin: boolean
}

interface AdminUserDetail {
  id: string
  email: string
  phone_e164: string | null
  business_name: string
  created_at: string
  is_admin: boolean
  counts: {
    products: number
    receipts: number
    sales: number
    categories: number
    payments: number
  }
  recent_receipts: Array<{
    id: string
    type: string
    net_amount: number
    created_at: string
  }>
}

export default function AdminUsersPage() {
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "200" })
    if (query.trim()) params.set("q", query.trim())
    return `/api/admin/users?${params}`
  }, [query])

  const { data, isLoading, error, mutate } = useSWR<{ users: AdminUserRow[] }>(
    listUrl,
    fetcher
  )

  const { data: detailData, isLoading: detailLoading } = useSWR<{
    user: AdminUserDetail
  }>(selectedId ? `/api/admin/users/${selectedId}` : null, fetcher)

  const users = data?.users || []
  const detail = detailData?.user

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
      })
      const body = await res.json()
      if (!res.ok) {
        toast({
          title: "Could not delete user",
          description: body.error || "Try again.",
          variant: "destructive",
        })
        return
      }
      toast({
        title: "User deleted",
        description: `${deleteTarget.business_name} and all their shop data were removed.`,
      })
      setDeleteTarget(null)
      setSelectedId(null)
      await mutate()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">User control</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform operator view — shop owners never see this page. Search accounts,
          inspect usage, or remove a user and all their data.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email, business name, phone…"
          className="pl-9 h-11"
        />
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Could not load users.
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No users match.</Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{users.length} account(s)</p>
          {users.map((user) => (
            <Card key={user.id} className="overflow-hidden">
              <CardContent className="p-0">
                <button
                  type="button"
                  className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between hover:bg-muted/40 transition-colors"
                  onClick={() => setSelectedId(user.id)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{user.business_name}</p>
                      {user.is_admin && (
                        <Badge variant="secondary" className="text-[10px]">
                          Operator
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    {user.phone_e164 && (
                      <p className="text-xs text-muted-foreground">{user.phone_e164}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Joined {new Date(user.created_at).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    <Badge variant="secondary">{user.product_count} products</Badge>
                    <Badge variant="outline">{user.receipt_count} receipts</Badge>
                    <Badge variant="outline">{user.sale_count} lines</Badge>
                  </div>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(selectedId)} onOpenChange={() => setSelectedId(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.business_name || "User details"}</DialogTitle>
            <DialogDescription>
              Operator actions for this shop account.
            </DialogDescription>
          </DialogHeader>

          {detailLoading || !detail ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-3">
                  <Package className="size-4 mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{detail.counts.products}</p>
                  <p className="text-xs text-muted-foreground">Products</p>
                </div>
                <div className="rounded-lg border p-3">
                  <Receipt className="size-4 mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{detail.counts.receipts}</p>
                  <p className="text-xs text-muted-foreground">Receipts</p>
                </div>
                <div className="rounded-lg border p-3">
                  <ShoppingCart className="size-4 mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{detail.counts.sales}</p>
                  <p className="text-xs text-muted-foreground">Sale lines</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-lg font-bold">{detail.counts.categories}</p>
                  <p className="text-xs text-muted-foreground">Categories</p>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-1">
                <p>
                  <span className="text-muted-foreground">Email:</span> {detail.email}
                </p>
                {detail.phone_e164 && (
                  <p>
                    <span className="text-muted-foreground">Phone:</span>{" "}
                    {detail.phone_e164}
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">User ID:</span>{" "}
                  <code className="text-xs">{detail.id}</code>
                </p>
              </div>

              {detail.recent_receipts.length > 0 && (
                <div>
                  <p className="font-medium mb-2">Recent receipts</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {detail.recent_receipts.map((r) => (
                      <li key={r.id} className="flex justify-between gap-2">
                        <span>
                          {r.type} · #{r.id.slice(0, 8)}
                        </span>
                        <span>NLe {r.net_amount.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setSelectedId(null)}>
              Close
            </Button>
            {detail && !detail.is_admin && (
              <Button
                variant="destructive"
                onClick={() => {
                  const row = users.find((u) => u.id === detail.id)
                  if (row) {
                    setDeleteTarget(row)
                    setSelectedId(null)
                  }
                }}
              >
                <UserX className="mr-2 size-4" />
                Delete user & data
              </Button>
            )}
            {detail?.is_admin && (
              <p className="text-xs text-muted-foreground sm:mr-auto">
                Operator accounts cannot be deleted from here.
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.business_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the account, products, sales, receipts, and
              payments for <strong>{deleteTarget?.email}</strong>. They will need to
              register again to use StockEasy. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 size-4" />
              {deleting ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
