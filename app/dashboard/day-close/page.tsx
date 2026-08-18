"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  History,
  WifiOff,
  Wallet,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/hooks/use-toast"
import {
  DAY_CLOSE_METHODS,
  formatBusinessDateLabel,
  getBusinessDateKey,
  roundMoney,
  type MethodTotals,
} from "@/lib/day-close"
import {
  fetchDayClose,
  type DayClosePayload,
} from "@/lib/day-close-client"
import { isBrowserOffline } from "@/lib/offline-navigation"
import { paymentMethodLabel } from "@/lib/payment-methods"
import { cn } from "@/lib/utils"

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function varianceTone(variance: number) {
  if (Math.abs(variance) < 0.005) return "ok"
  if (variance < 0) return "short"
  return "over"
}

export default function DayClosePage() {
  const todayKey = getBusinessDateKey()
  const [dateKey, setDateKey] = useState(todayKey)
  const [countedCash, setCountedCash] = useState("")
  const [countedExtra, setCountedExtra] = useState<Record<string, string>>({})
  const [showOtherMethods, setShowOtherMethods] = useState(false)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  const cacheKey = `/api/day-close?date=${dateKey}`
  const { data, error, isLoading, mutate } = useSWR<DayClosePayload>(
    cacheKey,
    () => fetchDayClose(dateKey),
    { revalidateOnFocus: !isOffline }
  )

  useEffect(() => {
    const sync = () => setIsOffline(isBrowserOffline())
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])

  useEffect(() => {
    void mutate()
  }, [isOffline, mutate])

  const showOfflinePreview = Boolean(data?._offline || (isOffline && data))

  useEffect(() => {
    if (!data) return
    if (data.existing_close) {
      setCountedCash(String(data.existing_close.counted_cash))
      setNotes(data.existing_close.notes || "")
      const extras: Record<string, string> = {}
      for (const method of DAY_CLOSE_METHODS) {
        if (method === "cash") continue
        extras[method] = String(data.existing_close.counted_by_method[method] ?? 0)
      }
      setCountedExtra(extras)
      const hasDiff = DAY_CLOSE_METHODS.some((method) => {
        if (method === "cash") return false
        return (
          Number(data.existing_close!.counted_by_method[method] ?? 0) !==
          Number(data.existing_close!.expected_by_method[method] ?? 0)
        )
      })
      setShowOtherMethods(hasDiff)
    } else {
      setCountedCash("")
      setNotes("")
      setCountedExtra({})
      setShowOtherMethods(false)
    }
  }, [data])

  const expectedByMethod = data?.expected_by_method ?? {}
  const expectedCash = Number(data?.expected_cash ?? 0)
  const cashCountValue = roundMoney(Number(countedCash) || 0)
  const cashVariance = roundMoney(cashCountValue - expectedCash)
  const cashTone = varianceTone(cashVariance)

  const countedByMethodPreview = useMemo(() => {
    const next: MethodTotals = { ...expectedByMethod }
    next.cash = cashCountValue
    if (showOtherMethods) {
      for (const method of DAY_CLOSE_METHODS) {
        if (method === "cash") continue
        if (countedExtra[method] !== undefined && countedExtra[method] !== "") {
          next[method] = roundMoney(Number(countedExtra[method]) || 0)
        }
      }
    }
    return next
  }, [expectedByMethod, cashCountValue, showOtherMethods, countedExtra])

  const expectedTotal = Number(data?.expected_total ?? 0)
  const countedTotal = roundMoney(
    Object.values(countedByMethodPreview).reduce((s, n) => s + Number(n || 0), 0)
  )
  const totalVariance = roundMoney(countedTotal - expectedTotal)

  const handleSave = async () => {
    if (!data) return
    if (showOfflinePreview || isOffline) {
      toast({
        title: "Connect to save",
        description: "Day close must be saved online. You can count your till now and save when back online.",
        variant: "destructive",
      })
      return
    }
    if (countedCash === "" || Number.isNaN(Number(countedCash))) {
      toast({
        title: "Enter counted cash",
        description: "Count the cash in your till and enter the amount.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      const body: {
        businessDate: string
        countedCash: number
        countedByMethod: MethodTotals
        notes: string | null
      } = {
        businessDate: dateKey,
        countedCash: cashCountValue,
        countedByMethod: countedByMethodPreview,
        notes: notes.trim() || null,
      }

      const res = await fetch("/api/day-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({
          title: "Could not close day",
          description: json?.error || "Try again",
          variant: "destructive",
        })
        return
      }

      toast({
        title: data.existing_close ? "Day close updated" : "Day closed",
        description:
          cashTone === "ok"
            ? "Cash matches the system total."
            : cashTone === "short"
              ? `Cash is short by NLe ${formatMoney(Math.abs(cashVariance))}.`
              : `Cash is over by NLe ${formatMoney(cashVariance)}.`,
      })
      await mutate()
    } catch {
      toast({
        title: "Could not reach the server",
        description: "Day close needs an internet connection.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
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
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="size-6 text-primary" />
              End-of-day close
            </h1>
            <p className="text-muted-foreground">
              Compare what the system recorded with what you counted in the till.
            </p>
          </div>
          {showOfflinePreview && (
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

      {showOfflinePreview && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm flex gap-2 items-start">
          <WifiOff className="size-4 shrink-0 mt-0.5 text-warning" />
          <div>
            <p className="font-medium text-warning-foreground">Offline preview</p>
            <p className="text-muted-foreground mt-0.5">
              Expected totals come from cached sales on this device, including any
              sales not yet synced. Count your till below, then save when you have
              internet.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-2">
          <label className="text-xs text-muted-foreground">Business day</label>
          <Input
            type="date"
            value={dateKey}
            max={todayKey}
            onChange={(e) => setDateKey(e.target.value || todayKey)}
            className="h-11 max-w-xs"
          />
          <p className="text-sm text-muted-foreground">
            {formatBusinessDateLabel(dateKey)}
            {dateKey === todayKey ? " · Today" : ""}
          </p>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-destructive">
            {error.message || "Could not load day close. Check your connection."}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {data.existing_close && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary shrink-0" />
              <span>
                Closed {new Date(data.existing_close.closed_at).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                . You can update the count below if you recount.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs uppercase text-muted-foreground">Sales</p>
                <p className="text-xl font-bold">{data.sale_count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs uppercase text-muted-foreground">Payments</p>
                <p className="text-xl font-bold">{data.payment_count}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Expected in system</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {DAY_CLOSE_METHODS.map((method) => {
                const amount = Number(expectedByMethod[method] || 0)
                if (amount <= 0 && method !== "cash") return null
                return (
                  <div
                    key={method}
                    className="flex items-center justify-between text-sm py-1.5 border-b last:border-0"
                  >
                    <span className="text-muted-foreground">
                      {paymentMethodLabel(method)}
                    </span>
                    <span className="font-semibold">NLe {formatMoney(amount)}</span>
                  </div>
                )
              })}
              <div className="flex items-center justify-between pt-1">
                <span className="font-semibold">Total received</span>
                <span className="font-bold text-primary">
                  NLe {formatMoney(data.expected_total)}
                </span>
              </div>
              {data.change_given_total > 0 && (
                <p className="text-xs text-muted-foreground">
                  Change given today: NLe {formatMoney(data.change_given_total)} (already
                  removed from cash received)
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="size-4" />
                Count your till
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Counted cash
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  placeholder={String(expectedCash)}
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  className="h-14 text-xl font-semibold"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 w-full h-10"
                  onClick={() => setCountedCash(String(expectedCash))}
                >
                  Exact — NLe {formatMoney(expectedCash)}
                </Button>
              </div>

              {countedCash !== "" && (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-3 text-sm",
                    cashTone === "ok" && "border-primary/30 bg-primary/5",
                    cashTone === "short" && "border-warning/40 bg-warning/10",
                    cashTone === "over" && "border-accent/40 bg-accent/10"
                  )}
                >
                  <p className="font-semibold">
                    {cashTone === "ok" && "Cash matches"}
                    {cashTone === "short" &&
                      `Short by NLe ${formatMoney(Math.abs(cashVariance))}`}
                    {cashTone === "over" && `Over by NLe ${formatMoney(cashVariance)}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Expected NLe {formatMoney(expectedCash)} · Counted NLe{" "}
                    {formatMoney(cashCountValue)}
                  </p>
                </div>
              )}

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setShowOtherMethods((v) => !v)}
              >
                {showOtherMethods
                  ? "Hide other payment methods"
                  : "Also count Orange Money / Afrimoney / Bank"}
              </Button>

              {showOtherMethods && (
                <div className="space-y-3">
                  {DAY_CLOSE_METHODS.filter((m) => m !== "cash").map((method) => (
                    <div key={method}>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Counted {paymentMethodLabel(method)}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="decimal"
                        placeholder={String(expectedByMethod[method] || 0)}
                        value={countedExtra[method] ?? ""}
                        onChange={(e) =>
                          setCountedExtra((prev) => ({
                            ...prev,
                            [method]: e.target.value,
                          }))
                        }
                        className="h-11"
                      />
                    </div>
                  ))}
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-muted-foreground">All methods variance</span>
                    <span
                      className={cn(
                        "font-semibold",
                        varianceTone(totalVariance) === "short" && "text-warning",
                        varianceTone(totalVariance) === "ok" && "text-primary"
                      )}
                    >
                      {totalVariance === 0
                        ? "Match"
                        : `${totalVariance > 0 ? "+" : ""}NLe ${formatMoney(totalVariance)}`}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Note (optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. paid transport from till"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-11"
                />
              </div>

              <Button
                className="w-full h-12 text-base font-semibold"
                disabled={saving || isLoading || showOfflinePreview}
                onClick={handleSave}
              >
                {saving
                  ? "Saving..."
                  : showOfflinePreview
                    ? "Connect to save close"
                    : data.existing_close
                      ? "Update day close"
                      : "Close day"}
              </Button>
              {showOfflinePreview && (
                <p className="text-xs text-center text-muted-foreground">
                  Saving needs an internet connection. Your count is kept on this
                  screen until you reconnect.
                </p>
              )}
            </CardContent>
          </Card>

          {data.recent_closes.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="size-4" />
                  Recent closes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.recent_closes.map((close) => {
                  const tone = varianceTone(close.cash_variance)
                  return (
                    <button
                      key={close.id}
                      type="button"
                      className="w-full text-left rounded-lg border p-3 hover:bg-muted/40 transition-colors"
                      onClick={() => setDateKey(close.business_date)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{close.business_date_label}</p>
                          <p className="text-xs text-muted-foreground">
                            Counted NLe {formatMoney(close.counted_cash)} · expected NLe{" "}
                            {formatMoney(close.expected_cash)}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            tone === "ok" && "bg-primary/15 text-primary",
                            tone === "short" && "bg-warning/20 text-warning border-warning/40",
                            tone === "over" && "bg-accent/15"
                          )}
                        >
                          {tone === "ok"
                            ? "Match"
                            : tone === "short"
                              ? `Short ${formatMoney(Math.abs(close.cash_variance))}`
                              : `Over ${formatMoney(close.cash_variance)}`}
                        </Badge>
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </main>
  )
}
