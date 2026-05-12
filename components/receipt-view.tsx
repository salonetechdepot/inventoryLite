"use client"

import { Check, Printer, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ReceiptPayment {
  id: string
  amount: number
  method: string | null
  note: string | null
  created_at: string | Date
}

export interface ReceiptSaleLine {
  id: string
  product_name: string
  quantity_sold: number
  unit_price_at_sale: number
  total_amount: number
}

export interface ReceiptData {
  id: string
  type: "SALE" | "RETURN" | "sale" | "return"
  customer_name?: string | null
  customer_phone?: string | null
  subtotal: number
  discount_amount: number
  net_amount: number
  amount_paid: number
  amount_due: number
  change_given: number
  is_part_payment: boolean
  is_paid: boolean
  notes?: string | null
  created_at: string | Date
  sales: ReceiptSaleLine[]
  payments?: ReceiptPayment[]
}

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-SL", {
    style: "currency",
    currency: "SLL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace("SLL", "NLe")
}

function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export interface ReceiptViewProps {
  receipt: ReceiptData
  businessName?: string | null
  shopLogoUrl?: string | null
  /** Optional callback for the Print button (omits the button if undefined). */
  onPrint?: () => void
  /** Optional close/done button at the bottom. */
  onClose?: () => void
  /** Optional slot under the totals (e.g. an Add Payment form). */
  footerSlot?: React.ReactNode
  className?: string
}

/**
 * Reusable receipt body. Renders the same way for first-time display after checkout
 * and for reprinting from sales history.
 */
export function ReceiptView({
  receipt,
  businessName,
  shopLogoUrl,
  onPrint,
  onClose,
  footerSlot,
  className,
}: ReceiptViewProps) {
  const isReturn = String(receipt.type).toUpperCase() === "RETURN"

  return (
    <div className={cn("flex flex-col gap-4 print:gap-2", className)}>
      <div className="text-center print:mb-2">
        <div
          className={cn(
            "mx-auto mb-3 flex size-14 items-center justify-center rounded-full print:hidden",
            isReturn ? "bg-warning" : "bg-primary"
          )}
        >
          {isReturn ? (
            <Undo2 className="size-7 text-warning-foreground" />
          ) : (
            <Check className="size-7 text-primary-foreground" />
          )}
        </div>
        {shopLogoUrl && (
          <img
            src={shopLogoUrl}
            alt={businessName || "Shop"}
            className="mx-auto mb-2 size-12 rounded-md object-cover print:size-10"
          />
        )}
        {businessName && (
          <p className="text-base font-bold uppercase tracking-wide print:text-sm">
            {businessName}
          </p>
        )}
        <h2 className="text-lg font-bold print:text-base">
          {isReturn ? "Return Receipt" : "Sales Receipt"}
        </h2>
        <p className="text-xs text-muted-foreground">
          #{receipt.id.slice(0, 8).toUpperCase()} · {formatDateTime(receipt.created_at)}
        </p>
      </div>

      {(receipt.customer_name || receipt.customer_phone) && (
        <div className="border rounded-lg p-2 text-sm">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Customer
          </p>
          {receipt.customer_name && <p>Name: {receipt.customer_name}</p>}
          {receipt.customer_phone && <p>Phone: {receipt.customer_phone}</p>}
        </div>
      )}

      {/* Items */}
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
          <span>Item</span>
          <span>Amount</span>
        </div>
        <div className="divide-y">
          {receipt.sales.map((line) => (
            <div key={line.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{line.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {line.quantity_sold} × {formatPrice(line.unit_price_at_sale)}
                </p>
              </div>
              <span className="font-semibold whitespace-nowrap">
                {formatPrice(line.total_amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="border rounded-lg divide-y text-sm">
        <div className="flex justify-between px-3 py-2">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatPrice(receipt.subtotal)}</span>
        </div>
        {receipt.discount_amount > 0 && (
          <div className="flex justify-between px-3 py-2">
            <span className="text-muted-foreground">Discount</span>
            <span>−{formatPrice(receipt.discount_amount)}</span>
          </div>
        )}
        <div className="flex justify-between px-3 py-2 font-bold bg-primary/5">
          <span>TOTAL</span>
          <span className="text-primary text-base">{formatPrice(receipt.net_amount)}</span>
        </div>
        <div className="flex justify-between px-3 py-2">
          <span>Amount Paid</span>
          <span>{formatPrice(receipt.amount_paid)}</span>
        </div>
        {receipt.change_given > 0 && (
          <div className="flex justify-between px-3 py-2">
            <span>Change Given</span>
            <span>{formatPrice(receipt.change_given)}</span>
          </div>
        )}
        {receipt.amount_due > 0 && (
          <div className="flex justify-between px-3 py-2 bg-warning/10">
            <span className="font-semibold">Balance Due</span>
            <span className="font-semibold text-warning">
              {formatPrice(receipt.amount_due)}
            </span>
          </div>
        )}
        <div className="flex justify-between px-3 py-2">
          <span>Status</span>
          {receipt.is_paid ? (
            <Badge variant="default" className="bg-primary">
              Paid
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-warning/20 text-warning border-warning/40">
              {receipt.is_part_payment ? "Part Payment" : "Unpaid"}
            </Badge>
          )}
        </div>
      </div>

      {/* Payment history (if any) */}
      {receipt.payments && receipt.payments.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Payment history
          </div>
          <div className="divide-y">
            {receipt.payments.map((p) => (
              <div key={p.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.method ? p.method.toUpperCase() : "CASH"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(p.created_at)}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                <span className="font-semibold whitespace-nowrap">
                  {formatPrice(p.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {footerSlot}

      {(onPrint || onClose) && (
        <div className="flex gap-2 print:hidden">
          {onPrint && (
            <Button variant="outline" onClick={onPrint} className="flex-1">
              <Printer className="mr-2 size-4" />
              Print
            </Button>
          )}
          {onClose && (
            <Button onClick={onClose} className="flex-1">
              Done
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
