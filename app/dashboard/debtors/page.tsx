"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  ArrowLeft,
  BookUser,
  ChevronDown,
  ChevronRight,
  Phone,
  WifiOff,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  fetchWithOfflineCache,
  SALE_RECEIPTS_CACHE_KEY,
} from "@/lib/offline-sync"
import { aggregateDebtors, sumOutstanding, type DebtorEntry } from "@/lib/debtors"
import { CollectPaymentForm } from "@/components/collect-payment-form"
import { ReceiptView, type ReceiptData } from "@/components/receipt-view"
import { useAuth } from "@/hooks/use-auth"
import { printThermalReceipt } from "@/lib/receipt-print"
import { cn } from "@/lib/utils"

const fetcher = fetchWithOfflineCache

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDay(dateString: string | Date) {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

type ApiReceipt = ReceiptData & { item_count?: number }

export default function DebtorsPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState("")
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [activeReceipt, setActiveReceipt] = useState<ApiReceipt | null>(null)

  const { data, error, isLoading, mutate } = useSWR<{ receipts: ApiReceipt[] }>(
    SALE_RECEIPTS_CACHE_KEY,
    fetcher
  )

  const isOffline =
    typeof navigator !== "undefined" && !navigator.onLine && Boolean(data)

  const receipts = useMemo(() => data?.receipts || [], [data])
  const debtors = useMemo(() => aggregateDebtors(receipts), [receipts])
  const totalOutstanding = useMemo(() => sumOutstanding(receipts), [receipts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return debtors
    return debtors.filter(
      (d) =>
        d.displayName.toLowerCase().includes(q) ||
        (d.phone || "").toLowerCase().includes(q)
    )
  }, [debtors, search])

  const handleReceiptUpdated = (updated: ApiReceipt) => {
    setActiveReceipt(updated)
    void mutate()
  }

  return (
    <main className="p-4 pb-24 space-y-4">
      <header>
        <Link
          href="/dashboard"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-5 mr-1" />
          Back to Dashboard
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookUser className="size-6 text-primary" />
              Credit book
            </h1>
            <p className="text-muted-foreground">
              People who still owe a balance, and collect payments here.
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
      </header>

      <Card className="bg-warning/10 border-warning/30">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total outstanding
            </p>
            <p className="text-2xl font-bold text-warning-foreground">
              NLe {formatCurrency(totalOutstanding)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {debtors.length} customer{debtors.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/sales?status=unpaid">View receipts</Link>
          </Button>
        </CardContent>
      </Card>

      <Input
        placeholder="Search by name or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-11"
      />

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {error && !data && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-destructive">
            Could not load credit balances. Try again when online.
          </CardContent>
        </Card>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <BookUser className="size-10 mx-auto text-muted-foreground" />
            <p className="font-medium">No outstanding credit</p>
            <p className="text-sm text-muted-foreground">
              When you sell on credit or part payment, customers will appear here.
            </p>
            <Button asChild className="mt-2">
              <Link href="/dashboard/sell">Make a sale</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((debtor) => (
          <DebtorCard
            key={debtor.key}
            debtor={debtor}
            expanded={expandedKey === debtor.key}
            onToggle={() =>
              setExpandedKey((prev) => (prev === debtor.key ? null : debtor.key))
            }
            onOpenReceipt={(id) => {
              const match = receipts.find((r) => r.id === id)
              if (match) setActiveReceipt(match)
            }}
            onPaymentQueued={() => void mutate()}
            onPaymentRecorded={(receiptId, receipt) => {
              void mutate()
              if (Object.keys(receipt).length > 0) {
                setActiveReceipt({
                  ...(receipt as unknown as ApiReceipt),
                  id: String(receipt.id ?? receiptId),
                })
              }
            }}
          />
        ))}
      </div>

      <Dialog
        open={Boolean(activeReceipt)}
        onOpenChange={(open) => {
          if (!open) setActiveReceipt(null)
        }}
      >
        <DialogContent className="receipt-print-dialog sm:max-w-md max-h-[90vh] overflow-y-auto print:shadow-none print:max-w-none print:max-h-none print:overflow-visible">
          <DialogHeader className="sr-only">
            <DialogTitle>Receipt</DialogTitle>
          </DialogHeader>
          {activeReceipt && (
            <ReceiptView
              receipt={activeReceipt}
              businessName={user?.business_name}
              shopLogoUrl={user?.shop_logo_url}
              onPrint={() => printThermalReceipt()}
              onClose={() => setActiveReceipt(null)}
              footerSlot={
                !activeReceipt.is_paid ? (
                  <CollectPaymentForm
                    receiptId={activeReceipt.id}
                    amountDue={Number(activeReceipt.amount_due || 0)}
                    onQueued={() => {
                      void mutate()
                      setActiveReceipt(null)
                    }}
                    onRecorded={({ receipt, queued }) => {
                      if (queued) {
                        void mutate()
                        setActiveReceipt(null)
                        return
                      }
                      handleReceiptUpdated({
                        ...(receipt as unknown as ApiReceipt),
                        item_count: activeReceipt.item_count,
                      })
                    }}
                  />
                ) : null
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}

function DebtorCard({
  debtor,
  expanded,
  onToggle,
  onOpenReceipt,
  onPaymentQueued,
  onPaymentRecorded,
}: {
  debtor: DebtorEntry
  expanded: boolean
  onToggle: () => void
  onOpenReceipt: (id: string) => void
  onPaymentQueued: () => void
  onPaymentRecorded: (receiptId: string, receipt: Record<string, unknown>) => void
}) {
  const [collectReceiptId, setCollectReceiptId] = useState<string | null>(null)
  const collecting = debtor.receipts.find((r) => r.id === collectReceiptId)

  return (
    <Card>
      <button type="button" onClick={onToggle} className="w-full text-left">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-start justify-between gap-2 text-base">
            <span className="min-w-0">
              <span className="font-semibold block truncate">{debtor.displayName}</span>
              {debtor.phone && (
                <span className="text-xs font-normal text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone className="size-3" />
                  {debtor.phone}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-warning font-bold">
                NLe {formatCurrency(debtor.totalDue)}
              </span>
              {expanded ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {debtor.receiptCount} unpaid receipt
            {debtor.receiptCount === 1 ? "" : "s"} · oldest {formatDay(debtor.oldestDueAt)}
          </p>
        </CardHeader>
      </button>

      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {debtor.receipts
            .slice()
            .sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
            .map((receipt) => (
              <div
                key={receipt.id}
                className={cn(
                  "rounded-lg border p-3 space-y-2",
                  collectReceiptId === receipt.id && "border-primary/40 bg-primary/5"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left min-w-0"
                    onClick={() => onOpenReceipt(receipt.id)}
                  >
                    <p className="text-sm font-medium">
                      {formatDay(receipt.created_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Bill NLe {formatCurrency(receipt.net_amount)} · paid NLe{" "}
                      {formatCurrency(receipt.amount_paid)}
                    </p>
                  </button>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-warning">
                      NLe {formatCurrency(receipt.amount_due)}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant={collectReceiptId === receipt.id ? "secondary" : "default"}
                      className="mt-1 h-8"
                      onClick={() =>
                        setCollectReceiptId((id) =>
                          id === receipt.id ? null : receipt.id
                        )
                      }
                    >
                      {collectReceiptId === receipt.id ? "Cancel" : "Collect"}
                    </Button>
                  </div>
                </div>
                {collectReceiptId === receipt.id && collecting && (
                  <CollectPaymentForm
                    compact
                    receiptId={receipt.id}
                    amountDue={Number(receipt.amount_due || 0)}
                    onQueued={onPaymentQueued}
                    onRecorded={({ receipt: updated, queued }) => {
                      setCollectReceiptId(null)
                      if (queued) {
                        onPaymentQueued()
                        return
                      }
                      onPaymentRecorded(receipt.id, updated)
                    }}
                  />
                )}
              </div>
            ))}
        </CardContent>
      )}
    </Card>
  )
}
