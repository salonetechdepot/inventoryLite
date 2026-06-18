"use client"

import useSWR from "swr"
import { BarChart3, Package, Receipt, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function AdminOverviewPage() {
  const { data, isLoading, error } = useSWR<{ stats: Record<string, number> }>(
    "/api/admin/stats",
    fetcher
  )

  const stats = data?.stats

  const tiles = [
    { label: "Business accounts", value: stats?.users, icon: Users },
    { label: "Products (all shops)", value: stats?.products, icon: Package },
    { label: "Receipts (all time)", value: stats?.receipts, icon: Receipt },
    { label: "Sales today", value: stats?.sales_today, icon: BarChart3 },
    { label: "Returns today", value: stats?.returns_today, icon: BarChart3 },
    { label: "Active OTP codes", value: stats?.active_otps, icon: BarChart3 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Private operator console — not shown to shop owners. Bookmark{" "}
          <code className="text-xs bg-muted px-1 rounded">/admin</code> and sign in
          with an email listed in <code className="text-xs bg-muted px-1 rounded">ADMIN_EMAILS</code>.
        </p>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Could not load admin stats.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <tile.icon className="size-4" />
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{tile.value ?? 0}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operator access</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Only emails in <code className="text-xs bg-muted px-1 rounded">ADMIN_EMAILS</code> can
            open this console. Shop users never see a link to it in the app.
          </p>
          <p>
            Use <strong>Users</strong> to search accounts, inspect activity, or permanently delete
            a user and all their inventory/sales data.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
