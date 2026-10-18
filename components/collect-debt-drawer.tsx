"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { BookUser, Phone } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { CollectPaymentForm } from "@/components/collect-payment-form"
import { fetchWithOfflineCache, SALE_RECEIPTS_CACHE_KEY } from "@/lib/offline-sync"
import { aggregateDebtors, type DebtorReceiptSummary } from "@/lib/debtors"
import { cn } from "@/lib/utils"

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDay(value: string | Date) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

type CollectDebtDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialQuery?: string
}

/** Take a credit payment from the counter without leaving Sell. */
export function CollectDebtDrawer({ open, onOpenChange, initialQuery = "" }: CollectDebtDrawerProps) {
  const [query, setQuery] = useState(initialQuery)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [collectReceiptId, setCollectReceiptId] = useState<string | null>(null)

  const { data, mutate } = useSWR<{ receipts: DebtorReceiptSummary[] }>(
    open ? SALE_RECEIPTS_CACHE_KEY : null,
    fetchWithOfflineCache
  )

  useEffect(() => {
    if (!open) return
    setQuery(initialQuery)
    setSelectedKey(null)
    setCollectReceiptId(null)
  }, [open, initialQuery])

  const debtors = useMemo(() => aggregateDebtors(data?.receipts ?? []), [data])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = q.replace(/\D/g, "")
    if (!q) return debtors.slice(0, 8)
    return debtors.filter(
      (debtor) =>
        debtor.displayName.toLowerCase().includes(q) ||
        (digits.length >= 3 && (debtor.phone ?? "").replace(/\D/g, "").includes(digits))
    )
  }, [debtors, query])

  const selected = matches.find((debtor) => debtor.key === selectedKey) ?? null

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2">
            <BookUser className="size-5 text-primary" />
            Collect a debt
          </DrawerTitle>
          <DrawerDescription>
            Search the customer by phone or name, then record what they pay now.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 overflow-y-auto px-4">
          <Input
            autoFocus
            type="search"
            inputMode="search"
            placeholder="Phone or name"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedKey(null)
              setCollectReceiptId(null)
            }}
            className="h-12 text-base"
          />

          {matches.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {debtors.length === 0
                ? "No one owes a balance right now."
                : "No customer with an unpaid balance matches that."}
            </p>
          ) : (
            <ul className="space-y-2">
              {matches.map((debtor) => {
                const isSelected = debtor.key === selected?.key
                return (
                  <li key={debtor.key} className={cn("rounded-lg border", isSelected && "border-primary/40")}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 p-3 text-left"
                      onClick={() => {
                        setSelectedKey(isSelected ? null : debtor.key)
                        setCollectReceiptId(null)
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{debtor.displayName}</span>
                        {debtor.phone && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="size-3" />
                            {debtor.phone}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold text-warning">
                          NLe {formatCurrency(debtor.totalDue)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {debtor.receiptCount} unpaid
                        </span>
                      </span>
                    </button>

                    {isSelected && (
                      <div className="space-y-2 border-t p-3">
                        {debtor.receipts
                          .slice()
                          .sort(
                            (a, b) =>
                              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                          )
                          .map((receipt) => (
                            <div key={receipt.id} className="space-y-2 rounded-md bg-muted/40 p-2">
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span>
                                  {formatDay(receipt.created_at)} · bill NLe{" "}
                                  {formatCurrency(receipt.net_amount)}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={collectReceiptId === receipt.id ? "secondary" : "default"}
                                  className="h-8"
                                  onClick={() =>
                                    setCollectReceiptId((id) => (id === receipt.id ? null : receipt.id))
                                  }
                                >
                                  {collectReceiptId === receipt.id
                                    ? "Cancel"
                                    : `Collect NLe ${formatCurrency(receipt.amount_due)}`}
                                </Button>
                              </div>
                              {collectReceiptId === receipt.id && (
                                <CollectPaymentForm
                                  compact
                                  receiptId={receipt.id}
                                  amountDue={Number(receipt.amount_due || 0)}
                                  onRecorded={() => {
                                    setCollectReceiptId(null)
                                    void mutate()
                                  }}
                                />
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DrawerFooter>
          <Button asChild variant="outline">
            <Link href="/dashboard/debtors">Open full credit book</Link>
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
