"use client"

import { useMemo, useState, type ReactNode } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Undo2,
  Calendar,
  Search,
  Filter,
  Package,
  User,
  WifiOff,
  ChevronRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchWithOfflineCache, RETURN_RECEIPTS_CACHE_KEY } from "@/lib/offline-sync"
import { useAuth } from "@/hooks/use-auth"
import { ReceiptView, type ReceiptData } from "@/components/receipt-view"
import { cn } from "@/lib/utils"
import {
  formatReturnCondition,
  formatReturnDisposition,
  restockQuantityForLine,
  type ReturnCondition,
  type ReturnDisposition,
} from "@/lib/return-inventory"
import { printReceiptWithHint } from "@/lib/thermal-print-actions"
import { formatReceiptLinkLabel } from "@/lib/receipt-display"

const fetcher = fetchWithOfflineCache

type PeriodFilter = "today" | "7d" | "30d" | "all"
type StatusFilter = "all" | "paid" | "unpaid"

interface ApiReceipt extends ReceiptData {
  item_count: number
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatTime(dateString: string | Date) {
  return new Date(dateString).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDay(dateString: string | Date) {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function startOfPeriod(filter: PeriodFilter): Date | null {
  const now = new Date()
  switch (filter) {
    case "today": {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case "7d": {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case "30d": {
      const d = new Date(now)
      d.setDate(d.getDate() - 30)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case "all":
    default:
      return null
  }
}

function receiptToViewData(r: ApiReceipt): ReceiptData {
  return {
    id: r.id,
    type: r.type,
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    subtotal: r.subtotal,
    discount_amount: r.discount_amount,
    net_amount: r.net_amount,
    amount_paid: r.amount_paid,
    amount_due: r.amount_due,
    change_given: r.change_given,
    is_part_payment: r.is_part_payment,
    is_paid: r.is_paid,
    notes: r.notes,
    original_receipt_id: r.original_receipt_id ?? null,
    original_receipt: r.original_receipt ?? null,
    created_at: r.created_at,
    sales: r.sales.map((line) => ({
      id: line.id,
      product_name: line.product_name,
      quantity_sold: line.quantity_sold,
      unit_price_at_sale: line.unit_price_at_sale,
      total_amount: line.total_amount,
      return_condition: line.return_condition,
      return_disposition: line.return_disposition,
    })),
    payments: r.payments ?? [],
  }
}

interface DailyGroup {
  day: string
  displayDate: string
  total: number
  count: number
  receipts: ApiReceipt[]
}

function groupReceiptsByDay(receipts: ApiReceipt[]): DailyGroup[] {
  const map = new Map<string, DailyGroup>()
  receipts.forEach((receipt) => {
    const date = new Date(receipt.created_at).toDateString()
    if (!map.has(date)) {
      map.set(date, {
        day: date,
        displayDate: formatDay(receipt.created_at),
        total: 0,
        count: 0,
        receipts: [],
      })
    }
    const entry = map.get(date)!
    entry.total += Number(receipt.net_amount || 0)
    entry.count += 1
    entry.receipts.push(receipt)
  })
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.day).getTime() - new Date(a.day).getTime()
  )
}

export default function ReturnsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [search, setSearch] = useState("")
  const [period, setPeriod] = useState<PeriodFilter>("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [activeReceipt, setActiveReceipt] = useState<ApiReceipt | null>(null)

  const { data, error, isLoading, mutate } = useSWR<{ receipts: ApiReceipt[] }>(
    RETURN_RECEIPTS_CACHE_KEY,
    fetcher
  )

  const isOffline =
    typeof navigator !== "undefined" && !navigator.onLine && Boolean(data)

  const allReceipts = useMemo(() => data?.receipts || [], [data])

  const filteredReceipts = useMemo(() => {
    const cutoff = startOfPeriod(period)
    const term = search.trim().toLowerCase()
    return allReceipts.filter((r) => {
      if (cutoff && new Date(r.created_at) < cutoff) return false
      if (status === "paid" && !r.is_paid) return false
      if (status === "unpaid" && r.is_paid) return false
      if (!term) return true
      const hay = [
        r.customer_name,
        r.customer_phone,
        ...r.sales.map((s) => s.product_name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(term)
    })
  }, [allReceipts, period, search, status])

  const dailyGroups = useMemo(() => groupReceiptsByDay(filteredReceipts), [filteredReceipts])

  const totalReturnedValue = filteredReceipts.reduce(
    (sum, r) => sum + Number(r.net_amount || 0),
    0
  )
  const totalItemsReturned = filteredReceipts.reduce(
    (sum, r) => sum + r.sales.reduce((s, line) => s + Number(line.quantity_sold || 0), 0),
    0
  )
  const totalRestocked = filteredReceipts.reduce(
    (sum, r) =>
      sum +
      r.sales.reduce(
        (s, line) =>
          s +
          restockQuantityForLine(
            Number(line.quantity_sold || 0),
            line.return_disposition as ReturnDisposition | null | undefined
          ),
        0
      ),
    0
  )
  const totalDiscarded = Math.max(0, totalItemsReturned - totalRestocked)
  const printReceipt = () => printReceiptWithHint()

  return (
    <main className="pb-24">
      <header className="sticky top-0 z-20 bg-background border-b">
        <div className="p-4 space-y-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-muted-foreground hover:text-foreground text-sm"
          >
            <ArrowLeft className="size-4 mr-1" />
            Back to Dashboard
          </Link>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">Returns</h1>
              <p className="text-sm text-muted-foreground">
                {isLoading
                  ? "Loading..."
                  : `${filteredReceipts.length} return${
                      filteredReceipts.length === 1 ? "" : "s"
                    } shown`}
              </p>
            </div>
            {isOffline && (
              <Badge
                variant="secondary"
                className="bg-warning/20 text-warning border-warning/40 shrink-0"
              >
                <WifiOff className="size-3 mr-1" />
                Offline
              </Badge>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search product or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="size-4 text-muted-foreground shrink-0" />
            {(
              [
                { key: "today", label: "Today" },
                { key: "7d", label: "7 days" },
                { key: "30d", label: "30 days" },
                { key: "all", label: "All time" },
              ] as { key: PeriodFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setPeriod(f.key)}
                className={cn(
                  "px-3 h-8 rounded-full text-sm font-medium border transition-colors whitespace-nowrap",
                  period === f.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs text-muted-foreground shrink-0">Status</span>
            {(
              [
                { key: "all", label: "All" },
                { key: "paid", label: "Settled" },
                { key: "unpaid", label: "Balance due" },
              ] as { key: StatusFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                className={cn(
                  "px-3 h-8 rounded-full text-sm font-medium border transition-colors whitespace-nowrap",
                  status === f.key
                    ? "bg-secondary text-secondary-foreground border-secondary"
                    : "bg-background hover:bg-muted"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryTile
            icon={<Undo2 className="size-4" />}
            label="Value"
            isLoading={isLoading}
            value={`NLe ${formatCurrency(totalReturnedValue)}`}
            tone="primary"
          />
          <SummaryTile
            icon={<Package className="size-4" />}
            label="Returned"
            isLoading={isLoading}
            value={String(totalItemsReturned)}
          />
          <SummaryTile
            icon={<Package className="size-4" />}
            label="Restocked"
            isLoading={isLoading}
            value={String(totalRestocked)}
            tone="primary"
          />
          <SummaryTile
            icon={<Package className="size-4" />}
            label="Discarded"
            isLoading={isLoading}
            value={String(totalDiscarded)}
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : error && allReceipts.length === 0 ? (
          <Card className="p-8 text-center">
            <WifiOff className="size-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Could not load returns</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              You appear to be offline and there is no cached data yet. Connect once to load
              your return history.
            </p>
            <Button variant="outline" onClick={() => mutate()}>
              Retry
            </Button>
          </Card>
        ) : filteredReceipts.length === 0 ? (
          <Card className="p-8 text-center">
            <Undo2 className="size-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {allReceipts.length === 0 ? "No returns yet" : "No returns match your filters"}
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {allReceipts.length === 0
                ? "Use Sell → Return mode to process a return. Offline returns appear here after checkout."
                : "Try a different period, status, or clear your search."}
            </p>
            {allReceipts.length === 0 ? (
              <Button asChild>
                <Link href="/dashboard/sell?type=return">Record a return</Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("")
                  setPeriod("all")
                  setStatus("all")
                }}
              >
                Reset filters
              </Button>
            )}
          </Card>
        ) : (
          <div className="space-y-5">
            {dailyGroups.map((group) => (
              <Card key={group.day}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <Calendar className="size-4" />
                      {group.displayDate}
                    </span>
                    <span className="text-primary font-bold">
                      NLe {formatCurrency(group.total)}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {group.count} return{group.count === 1 ? "" : "s"}
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {group.receipts.map((receipt) => (
                      <button
                        key={receipt.id}
                        type="button"
                        onClick={() => setActiveReceipt(receipt)}
                        className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted active:scale-[0.98] transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold truncate">
                              {receipt.customer_name || "Walk-in"}
                            </p>
                            {!receipt.is_paid && (
                              <Badge
                                variant="secondary"
                                className="h-5 bg-warning/20 text-warning border-warning/40 text-[10px]"
                              >
                                Balance due
                              </Badge>
                            )}
                            {String(receipt.id).startsWith("local-") && (
                              <Badge variant="outline" className="h-5 text-[10px]">
                                Pending sync
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {receipt.item_count} line{receipt.item_count === 1 ? "" : "s"} ·{" "}
                            {formatTime(receipt.created_at)}
                          </p>
                          {receipt.sales.some(
                            (s) => s.return_condition || s.return_disposition
                          ) && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                              {receipt.sales
                                .map((s) => {
                                  const parts: string[] = []
                                  if (s.return_condition) {
                                    parts.push(
                                      formatReturnCondition(
                                        s.return_condition as ReturnCondition
                                      )
                                    )
                                  }
                                  if (s.return_disposition) {
                                    parts.push(
                                      formatReturnDisposition(
                                        s.return_disposition as ReturnDisposition
                                      )
                                    )
                                  }
                                  return parts.length
                                    ? `${s.product_name}: ${parts.join(" · ")}`
                                    : null
                                })
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold text-primary whitespace-nowrap">
                            NLe {formatCurrency(receipt.net_amount)}
                          </span>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(activeReceipt)}
        onOpenChange={(open) => {
          if (!open) setActiveReceipt(null)
        }}
      >
        <DialogContent className="receipt-print-dialog sm:max-w-md max-h-[90vh] overflow-y-auto print:shadow-none print:max-w-none print:max-h-none print:overflow-visible">
          <DialogHeader className="sr-only">
            <DialogTitle>Return receipt</DialogTitle>
          </DialogHeader>
          {activeReceipt && (
            <ReceiptView
              receipt={receiptToViewData(activeReceipt)}
              businessName={user?.business_name}
              shopLogoUrl={user?.shop_logo_url}
              onPrint={printReceipt}
              onClose={() => {
                setActiveReceipt(null)
                void mutate()
              }}
              footerSlot={
                activeReceipt.original_receipt_id ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      router.push(
                        `/dashboard/sales?receipt=${activeReceipt.original_receipt_id}`
                      )
                    }}
                  >
                    View original sale{" "}
                    {formatReceiptLinkLabel(
                      activeReceipt.original_receipt_id,
                      activeReceipt.original_receipt?.created_at
                    )}
                  </Button>
                ) : undefined
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button asChild size="lg" className="w-full h-12 text-base font-semibold">
          <Link href="/dashboard/sell?type=return">
            <Undo2 className="mr-2 size-5" />
            Record return
          </Link>
        </Button>
      </div>
    </main>
  )
}

function SummaryTile({
  icon,
  label,
  value,
  isLoading,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  isLoading: boolean
  tone?: "primary"
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs uppercase tracking-wide">{label}</span>
        </div>
        <div
          className={cn(
            "text-base font-bold leading-tight",
            tone === "primary" && "text-primary"
          )}
        >
          {isLoading ? <Skeleton className="h-5 w-20" /> : value}
        </div>
      </CardContent>
    </Card>
  )
}
