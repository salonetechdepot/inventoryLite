"use client"

import { useMemo, useState, useEffect, Suspense } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  Receipt as ReceiptIcon,
  Calendar,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  Filter,
  WifiOff,
  Undo2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  fetchWithOfflineCache,
  SALE_RECEIPTS_CACHE_KEY,
  sendOrQueueMutation,
} from "@/lib/offline-sync"
import { useAuth } from "@/hooks/use-auth"
import { ReceiptView, type ReceiptData } from "@/components/receipt-view"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { formatReceiptLinkLabel } from "@/lib/receipt-display"
import { PAYMENT_METHODS } from "@/lib/payment-methods"

const fetcher = fetchWithOfflineCache

interface ApiReceipt extends ReceiptData {
  item_count: number
  original_receipt_id?: string | null
  original_receipt?: {
    id: string
    created_at: string | Date
    net_amount: number
  } | null
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
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

function formatTime(dateString: string | Date) {
  return new Date(dateString).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface DailyGroup {
  day: string
  displayDate: string
  totalPaid: number
  totalDue: number
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
        totalPaid: 0,
        totalDue: 0,
        receipts: [],
      })
    }
    const entry = map.get(date)!
    entry.totalPaid += Number(receipt.amount_paid || 0)
    entry.totalDue += Number(receipt.amount_due || 0)
    entry.receipts.push(receipt)
  })
  return Array.from(map.values())
}

type StatusFilter = "all" | "paid" | "unpaid"

export default function SalesHistoryPage() {
  return (
    <Suspense fallback={null}>
      <SalesHistoryContent />
    </Suspense>
  )
}

function SalesHistoryContent() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [activeReceipt, setActiveReceipt] = useState<ApiReceipt | null>(null)
  const { user } = useAuth()
  const searchParams = useSearchParams()

  const { data, error, isLoading, mutate } = useSWR<{ receipts: ApiReceipt[] }>(
    SALE_RECEIPTS_CACHE_KEY,
    fetcher
  )

  useEffect(() => {
    const receiptId = searchParams.get("receipt")
    if (!receiptId || !data?.receipts?.length) return
    const match = data.receipts.find((r) => r.id === receiptId)
    if (match) setActiveReceipt(match)
  }, [searchParams, data?.receipts])

  const isOffline =
    typeof navigator !== "undefined" && !navigator.onLine && Boolean(data)

  const allReceipts = useMemo(() => data?.receipts || [], [data])

  const receipts = useMemo(() => {
    if (statusFilter === "paid") {
      return allReceipts.filter((r) => r.is_paid)
    }
    if (statusFilter === "unpaid") {
      return allReceipts.filter((r) => !r.is_paid)
    }
    return allReceipts
  }, [allReceipts, statusFilter])
  const dailyGroups = useMemo(() => groupReceiptsByDay(receipts), [receipts])

  const totalRevenue = receipts.reduce(
    (sum, r) => sum + Number(r.amount_paid || 0),
    0
  )
  const totalOutstanding = receipts.reduce(
    (sum, r) => sum + Number(r.amount_due || 0),
    0
  )
  const unpaidCount = receipts.filter((r) => !r.is_paid).length

  const handleReceiptUpdated = (updated: ApiReceipt) => {
    setActiveReceipt(updated)
    mutate()
  }

  return (
    <main className="p-4 pb-24">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-5 mr-1" />
          Back to Dashboard
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Sales History</h1>
            <p className="text-muted-foreground">
              Tap any receipt to view, reprint, or record a payment.
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="size-4" />
              <span className="text-sm">Collected</span>
            </div>
            <div className="text-xl font-bold text-primary">
              {isLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                `NLe ${formatCurrency(totalRevenue)}`
              )}
            </div>
          </CardContent>
        </Card>
        <Card className={cn(totalOutstanding > 0 && "border-warning/40 bg-warning/5")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertCircle className="size-4" />
              <span className="text-sm">Outstanding</span>
            </div>
            <div className={cn(
              "text-xl font-bold",
              totalOutstanding > 0 ? "text-warning" : "text-foreground"
            )}>
              {isLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                `NLe ${formatCurrency(totalOutstanding)}`
              )}
            </div>
            {unpaidCount > 0 && !isLoading && (
              <p className="text-xs text-muted-foreground mt-1">
                {unpaidCount} unpaid receipt{unpaidCount === 1 ? "" : "s"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <Filter className="size-4 text-muted-foreground shrink-0" />
        {(["all", "paid", "unpaid"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={cn(
              "px-3 h-8 rounded-full text-sm font-medium border transition-colors capitalize whitespace-nowrap",
              statusFilter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Receipt list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : error && allReceipts.length === 0 ? (
        <Card className="p-8 text-center">
          <WifiOff className="size-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Could not load sales</h3>
          <p className="text-muted-foreground mb-4 text-sm">
            You appear to be offline and there is no cached data yet. Connect once to load
            your sales history.
          </p>
          <Button variant="outline" onClick={() => mutate()}>
            Retry
          </Button>
        </Card>
      ) : receipts.length === 0 ? (
        <Card className="p-8 text-center">
          <ReceiptIcon className="size-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No sales yet</h3>
          <p className="text-muted-foreground mb-4">
            Start selling to see your sales history here
          </p>
          <Button asChild>
            <Link href="/dashboard/sell">Make a Sale</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-5">
          {dailyGroups.map((group) => (
            <Card key={group.day}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Calendar className="size-4" />
                    {group.displayDate}
                  </span>
                  <span className="text-primary font-bold">
                    NLe {formatCurrency(group.totalPaid)}
                  </span>
                </CardTitle>
                {group.totalDue > 0 && (
                  <p className="text-xs text-warning">
                    NLe {formatCurrency(group.totalDue)} still owed
                  </p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {group.receipts.map((receipt) => (
                    <button
                      key={receipt.id}
                      onClick={() => setActiveReceipt(receipt)}
                      className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted active:scale-[0.98] transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">
                            {receipt.customer_name || "Walk-in customer"}
                          </p>
                          {String(receipt.type).toUpperCase() === "RETURN" && (
                            <Badge
                              variant="secondary"
                              className="bg-warning/20 text-warning border-warning/40 h-5 text-[10px]"
                            >
                              Return
                            </Badge>
                          )}
                          {!receipt.is_paid && (
                            <Badge
                              variant="secondary"
                              className="bg-warning/20 text-warning border-warning/40 h-5"
                            >
                              Part Payment
                            </Badge>
                          )}
                          {String(receipt.id).startsWith("local-") && (
                            <Badge variant="outline" className="h-5 text-[10px]">
                              Pending sync
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {receipt.item_count} item
                          {receipt.item_count === 1 ? "" : "s"} ·{" "}
                          {formatTime(receipt.created_at)}
                        </p>
                        {receipt.original_receipt_id && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            From sale{" "}
                            {formatReceiptLinkLabel(
                              receipt.original_receipt_id,
                              receipt.original_receipt?.created_at
                            )}
                          </p>
                        )}
                        {receipt.amount_due > 0 && (
                          <p className="text-xs text-warning mt-1">
                            Owes NLe {formatCurrency(receipt.amount_due)}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <p className="font-semibold text-primary">
                            NLe {formatCurrency(receipt.net_amount)}
                          </p>
                          <p className="text-[10px] text-muted-foreground uppercase">
                            paid NLe {formatCurrency(receipt.amount_paid)}
                          </p>
                        </div>
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

      <ReceiptDetailsDialog
        receipt={activeReceipt}
        businessName={user?.business_name}
        shopLogoUrl={user?.shop_logo_url}
        onClose={() => setActiveReceipt(null)}
        onUpdated={handleReceiptUpdated}
        onMutate={() => void mutate()}
      />
    </main>
  )
}

function ReceiptDetailsDialog({
  receipt,
  businessName,
  shopLogoUrl,
  onClose,
  onUpdated,
  onMutate,
}: {
  receipt: ApiReceipt | null
  businessName?: string | null
  shopLogoUrl?: string | null
  onClose: () => void
  onUpdated: (receipt: ApiReceipt) => void
  onMutate: () => void
}) {
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [paymentNote, setPaymentNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const open = Boolean(receipt)
  const router = useRouter()
  const isSaleReceipt = receipt && String(receipt.type).toUpperCase() === "SALE"
  const isReturnReceipt = receipt && String(receipt.type).toUpperCase() === "RETURN"

  const handlePrint = () => {
    window.print()
  }

  const handleAddPayment = async () => {
    if (!receipt) return
    setError("")
    const amount = Number(paymentAmount)
    if (!amount || amount <= 0) {
      setError("Enter an amount greater than zero")
      return
    }

    setSubmitting(true)
    try {
      const body = {
        amount,
        method: paymentMethod || "cash",
        note: paymentNote.trim() || null,
      }
      const result = await sendOrQueueMutation({
        url: `/api/receipts/${receipt.id}/payments`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })

      if (result.queued) {
        toast({
          title: "Payment saved offline",
          description: "It will sync when you are back online.",
        })
        onMutate()
        setPaymentAmount("")
        setPaymentNote("")
        onClose()
        return
      }

      const res = result.response
      if (!res) {
        setError("Could not reach the server. Try again.")
        return
      }

      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || "Failed to record payment")
        return
      }
      toast({
        title: "Payment recorded",
        description: `NLe ${formatCurrency(Number(data.credited || amount))} added to receipt.`,
      })
      setPaymentAmount("")
      setPaymentNote("")
      onUpdated({ ...(data.receipt as ApiReceipt), item_count: receipt.item_count })
    } catch {
      setError("Could not reach the server. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onClose()
          setPaymentAmount("")
          setPaymentNote("")
          setError("")
        }
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto print:shadow-none print:max-w-none print:max-h-none print:overflow-visible">
        <DialogHeader className="sr-only">
          <DialogTitle>Receipt details</DialogTitle>
        </DialogHeader>
        {receipt && (
          <ReceiptView
            receipt={receipt}
            businessName={businessName}
            shopLogoUrl={shopLogoUrl}
            onPrint={handlePrint}
            onClose={onClose}
            footerSlot={
              <>
              {isReturnReceipt && receipt.original_receipt_id && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full print:hidden mb-2"
                  onClick={() => {
                    router.push(`/dashboard/sales?receipt=${receipt.original_receipt_id}`)
                    onClose()
                  }}
                >
                  View original sale{" "}
                  {formatReceiptLinkLabel(
                    receipt.original_receipt_id,
                    receipt.original_receipt?.created_at
                  )}
                </Button>
              )}
              {isSaleReceipt && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full print:hidden mb-2"
                  onClick={() => {
                    router.push(`/dashboard/sell?type=return&fromReceipt=${receipt.id}`)
                    onClose()
                  }}
                >
                  <Undo2 className="mr-2 size-4" />
                  Return items from this sale
                </Button>
              )}
              {!receipt.is_paid && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30 print:hidden">
                  <div>
                    <p className="text-sm font-semibold">Record a payment</p>
                    <p className="text-xs text-muted-foreground">
                      Outstanding: NLe {formatCurrency(receipt.amount_due)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="h-10"
                    />
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Payment method" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.filter((m) => m.id !== "credit").map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="text"
                    placeholder="Note (optional)"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    className="h-10"
                  />
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                  <Button
                    onClick={handleAddPayment}
                    disabled={submitting}
                    className="w-full h-11"
                  >
                    {submitting ? "Saving..." : "Record payment"}
                  </Button>
                </div>
              )}
              </>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
