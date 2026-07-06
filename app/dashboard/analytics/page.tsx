"use client"

import useSWR from "swr"
import Link from "next/link"
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Package,
  WifiOff,
  Download,
  Printer,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ANALYTICS_CACHE_KEY, fetchWithOfflineCache } from "@/lib/offline-sync"
import type { AnalyticsPayload } from "@/lib/analytics-types"
import { useAuth } from "@/hooks/use-auth"
import { paymentMethodLabel } from "@/lib/payment-methods"
import { downloadAnalyticsCsv, printAnalyticsReport } from "@/lib/report-export"
import { toast } from "@/hooks/use-toast"

const fetcher = fetchWithOfflineCache

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: "primary"
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs uppercase text-muted-foreground tracking-wide">{label}</p>
        <p
          className={`text-lg font-bold mt-1 ${tone === "primary" ? "text-primary" : ""}`}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export default function AnalyticsPage() {
  const { user } = useAuth()
  const { data, error, isLoading } = useSWR<AnalyticsPayload & { _offline?: boolean }>(
    ANALYTICS_CACHE_KEY,
    fetcher
  )

  const isOffline =
    typeof navigator !== "undefined" && !navigator.onLine && Boolean(data)
  const showOfflineEmpty = data?._offline && !data.revenue.allTime.transactions
  const canExport = Boolean(data) && !showOfflineEmpty

  return (
    <main className="pb-24 p-4 space-y-4">
      <header className="space-y-2">
        <Link
          href="/dashboard/account"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4 mr-1" />
          Account
        </Link>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="size-7 text-primary" />
              Reports
            </h1>
            <p className="text-sm text-muted-foreground">
              Sales, profit estimate, and inventory overview
            </p>
          </div>
          {(isOffline || data?._offline) && (
            <Badge variant="secondary" className="shrink-0">
              <WifiOff className="size-3 mr-1" />
              {showOfflineEmpty ? "Offline" : "Cached"}
            </Badge>
          )}
        </div>

        {canExport && data && (
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11"
              onClick={() => downloadAnalyticsCsv(data, user?.business_name)}
            >
              <Download className="mr-2 size-4" />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11"
              onClick={() => {
                const ok = printAnalyticsReport(data, user?.business_name)
                if (!ok) {
                  toast({
                    title: "Print failed",
                    description: "Could not open the print dialog. Try Export CSV instead.",
                    variant: "destructive",
                  })
                }
              }}
            >
              <Printer className="mr-2 size-4" />
              Print
            </Button>
          </div>
        )}
      </header>

      {isLoading && !data ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : error && !data ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Could not load reports. Connect to the internet and open this page once to
          cache data for offline viewing.
        </Card>
      ) : data ? (
        <>
          {showOfflineEmpty && (
            <Card className="p-4 border-dashed">
              <p className="text-sm text-muted-foreground text-center">
                You are offline. Showing empty report — connect once while online to
                cache your latest numbers.
              </p>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-2">
            <SummaryTile
              label="Today (net sales)"
              value={`NLe ${formatMoney(data.revenue.today.amount)}`}
              sub={`${data.revenue.today.transactions} lines`}
              tone="primary"
            />
            <SummaryTile
              label="Today profit est."
              value={`NLe ${formatMoney(data.profit.today)}`}
              sub="Sell price − cost where set"
            />
            <SummaryTile
              label="This month"
              value={`NLe ${formatMoney(data.revenue.month.amount)}`}
              sub={`Profit NLe ${formatMoney(data.profit.month)}`}
            />
            <SummaryTile
              label="All time"
              value={`NLe ${formatMoney(data.revenue.allTime.amount)}`}
              sub={`Profit NLe ${formatMoney(data.profit.allTime)}`}
            />
          </div>

          {data.paymentsByMethod && data.paymentsByMethod.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payments this month</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {data.paymentsByMethod.map((p) => (
                    <li
                      key={p.method}
                      className="flex justify-between gap-2 px-4 py-2 text-sm"
                    >
                      <span className="font-medium">{paymentMethodLabel(p.method)}</span>
                      <span className="shrink-0 text-muted-foreground">
                        NLe {formatMoney(p.amount)} · {p.count} payment
                        {p.count === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="size-4" />
                Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>
                {data.inventory.totalProducts} products · {data.inventory.totalItems}{" "}
                units
              </p>
              <p>Retail value: NLe {formatMoney(data.inventory.totalValue)}</p>
              <p>Cost value: NLe {formatMoney(data.inventory.stockCostValue)}</p>
              <p className="text-muted-foreground">
                {data.inventory.lowStock} low stock · {data.inventory.outOfStock} out
                of stock
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="size-4" />
                Top products (sales)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.topProducts.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No sales yet.</p>
              ) : (
                <ul className="divide-y">
                  {data.topProducts.slice(0, 8).map((p) => (
                    <li
                      key={p.name}
                      className="flex justify-between gap-2 px-4 py-2 text-sm"
                    >
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {p.quantitySold} sold · NLe {formatMoney(p.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {data.dailyRevenue.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Last 7 days (net)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.dailyRevenue.slice(0, 7).map((d) => (
                  <div key={d.date} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{d.date}</span>
                    <span className="font-medium">NLe {formatMoney(d.revenue)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </main>
  )
}
