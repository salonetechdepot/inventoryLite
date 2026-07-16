"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PAYMENT_METHODS } from "@/lib/payment-methods"
import { sendOrQueueMutation } from "@/lib/offline-sync"
import { toast } from "@/hooks/use-toast"

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

type CollectPaymentFormProps = {
  receiptId: string
  amountDue: number
  onRecorded?: (payload: {
    credited: number
    receipt: Record<string, unknown>
    queued: boolean
  }) => void
  onQueued?: () => void
  compact?: boolean
}

export function CollectPaymentForm({
  receiptId,
  amountDue,
  onRecorded,
  onQueued,
  compact = false,
}: CollectPaymentFormProps) {
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [paymentNote, setPaymentNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const due = Math.max(0, Number(amountDue) || 0)

  const handleSubmit = async () => {
    setError("")
    const amount = Number(paymentAmount)
    if (!amount || amount <= 0) {
      setError("Enter an amount greater than zero")
      return
    }
    if (due <= 0) {
      setError("This receipt is already fully paid")
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
        url: `/api/receipts/${receiptId}/payments`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })

      if (result.queued) {
        toast({
          title: "Payment saved offline",
          description: "It will sync when you are back online.",
        })
        setPaymentAmount("")
        setPaymentNote("")
        onQueued?.()
        onRecorded?.({ credited: Math.min(amount, due), receipt: {}, queued: true })
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

      const credited = Number(data.credited || amount)
      toast({
        title: "Payment recorded",
        description: `NLe ${formatCurrency(credited)} collected.`,
      })
      setPaymentAmount("")
      setPaymentNote("")
      onRecorded?.({
        credited,
        receipt: (data.receipt ?? {}) as Record<string, unknown>,
        queued: false,
      })
    } catch {
      setError("Could not reach the server. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className={
        compact
          ? "space-y-2"
          : "border rounded-lg p-3 space-y-3 bg-muted/30 print:hidden"
      }
    >
      {!compact && (
        <div>
          <p className="text-sm font-semibold">Collect payment</p>
          <p className="text-xs text-muted-foreground">
            Outstanding: NLe {formatCurrency(due)}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount"
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(e.target.value)}
          className="h-10"
          inputMode="decimal"
        />
        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Method" />
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
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-10 shrink-0"
          disabled={due <= 0 || submitting}
          onClick={() => setPaymentAmount(String(due))}
        >
          Exact
        </Button>
        <Input
          type="text"
          placeholder="Note (optional)"
          value={paymentNote}
          onChange={(e) => setPaymentNote(e.target.value)}
          className="h-10"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        onClick={handleSubmit}
        disabled={submitting || due <= 0}
        className="w-full h-11"
      >
        {submitting ? "Saving..." : "Record payment"}
      </Button>
    </div>
  )
}
