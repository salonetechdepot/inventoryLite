"use client"

import { Check, Printer, Undo2, Link2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatReceiptLinkLabel } from "@/lib/receipt-display"
import {
  formatReturnCondition,
  formatReturnDisposition,
  type ReturnCondition,
  type ReturnDisposition,
} from "@/lib/return-inventory"
import { cashTenderedFromReceipt } from "@/lib/checkout-payment"

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
  return_condition?: string | null
  return_disposition?: string | null
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
  original_receipt_id?: string | null
  original_receipt?: {
    id: string
    created_at: string | Date
    net_amount: number
  } | null
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
    <div className={cn("receipt-print-root flex flex-col gap-4 print:gap-1", className)}>
      <div className="receipt-print-header text-center print:mb-0">
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
            className="mx-auto mb-2 size-12 rounded-md object-cover print:mb-1 print:size-9"
          />
        )}
        {businessName && (
          <p className="receipt-print-shop text-base font-bold uppercase tracking-wide print:text-xs">
            {businessName}
          </p>
        )}
        <h2 className="receipt-print-title text-lg font-bold print:text-sm">
          {isReturn ? "Return Receipt" : "Sales Receipt"}
        </h2>
        <p className="receipt-print-meta text-xs text-muted-foreground">
          #{receipt.id.slice(0, 8).toUpperCase()} · {formatDateTime(receipt.created_at)}
        </p>
      </div>

      {(receipt.customer_name || receipt.customer_phone) && (
        <div className="receipt-print-section border rounded-lg p-2 text-sm print:border-0 print:p-0">
          <p className="receipt-print-section-label text-xs font-semibold uppercase text-muted-foreground">
            Customer
          </p>
          {receipt.customer_name && <p>Name: {receipt.customer_name}</p>}
          {receipt.customer_phone && <p>Phone: {receipt.customer_phone}</p>}
        </div>
      )}

      {isReturn && receipt.original_receipt_id && (
        <div className="receipt-print-section border rounded-lg p-2 text-sm bg-muted/30 print:border-0 print:bg-transparent print:p-0">
          <p className="receipt-print-section-label text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
            <Link2 className="size-3 print:hidden" />
            Linked to original sale
          </p>
          <p className="mt-1">
            {formatReceiptLinkLabel(
              receipt.original_receipt_id,
              receipt.original_receipt?.created_at
            )}
            {receipt.original_receipt?.net_amount != null && (
              <span className="text-muted-foreground">
                {" "}
                · {formatPrice(receipt.original_receipt.net_amount)}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Items */}
      <div className="receipt-print-section border rounded-lg overflow-hidden print:border-0">
        <div className="receipt-print-row receipt-print-row-header flex items-center justify-between bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground print:bg-transparent print:px-0">
          <span>Item</span>
          <span>Amount</span>
        </div>
        <div className="divide-y print:divide-black/30">
          {receipt.sales.map((line) => (
            <div
              key={line.id}
              className="receipt-print-row flex justify-between gap-2 px-3 py-2 text-sm print:px-0 print:py-1 print:text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="receipt-print-item-name font-medium truncate print:whitespace-normal">
                  {line.product_name}
                </p>
                <p className="receipt-print-item-detail text-xs text-muted-foreground">
                  {line.quantity_sold} × {formatPrice(line.unit_price_at_sale)}
                </p>
                {isReturn &&
                  (line.return_condition || line.return_disposition) && (
                    <p className="text-xs mt-0.5 flex flex-wrap gap-1 print:mt-0 print:gap-0.5">
                      {line.return_condition && (
                        <Badge variant="outline" className="h-5 text-[10px] font-normal print:h-auto print:border-0 print:p-0 print:text-[10px]">
                          {formatReturnCondition(line.return_condition as ReturnCondition)}
                        </Badge>
                      )}
                      {line.return_disposition && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 text-[10px] font-normal print:h-auto print:border-0 print:p-0 print:text-[10px]",
                            line.return_disposition === "RESTOCK"
                              ? "border-primary/40 text-primary"
                              : "border-destructive/40 text-destructive"
                          )}
                        >
                          {formatReturnDisposition(
                            line.return_disposition as ReturnDisposition
                          )}
                        </Badge>
                      )}
                    </p>
                  )}
              </div>
              <span className="receipt-print-amount font-semibold whitespace-nowrap">
                {formatPrice(line.total_amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="receipt-print-section border rounded-lg divide-y text-sm print:border-0 print:divide-black/30">
        <div className="receipt-print-row flex justify-between px-3 py-2 print:px-0 print:py-0.5 print:text-xs">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatPrice(receipt.subtotal)}</span>
        </div>
        {receipt.discount_amount > 0 && (
          <div className="receipt-print-row flex justify-between px-3 py-2 print:px-0 print:py-0.5 print:text-xs">
            <span className="text-muted-foreground">Discount</span>
            <span>−{formatPrice(receipt.discount_amount)}</span>
          </div>
        )}
        <div className="receipt-print-row receipt-print-total-row flex justify-between px-3 py-2 font-bold bg-primary/5 print:bg-transparent print:px-0 print:py-1">
          <span>TOTAL</span>
          <span className="text-primary text-base print:text-xs print:text-black">
            {formatPrice(receipt.net_amount)}
          </span>
        </div>
        {receipt.change_given > 0 && (
          <div className="receipt-print-row flex justify-between px-3 py-2 print:px-0 print:py-0.5 print:text-xs">
            <span className="text-muted-foreground">Cash tendered</span>
            <span>
              {formatPrice(
                cashTenderedFromReceipt(receipt.amount_paid, receipt.change_given)
              )}
            </span>
          </div>
        )}
        <div className="receipt-print-row flex justify-between px-3 py-2 print:px-0 print:py-0.5 print:text-xs">
          <span className="text-muted-foreground">Amount received</span>
          <span>{formatPrice(receipt.amount_paid)}</span>
        </div>
        {receipt.change_given > 0 && (
          <div className="receipt-print-row flex justify-between px-3 py-2 print:px-0 print:py-0.5 print:text-xs">
            <span className="text-muted-foreground">Change given</span>
            <span>{formatPrice(receipt.change_given)}</span>
          </div>
        )}
        {receipt.amount_due > 0 && (
          <div className="receipt-print-row flex justify-between px-3 py-2 bg-warning/10 print:bg-transparent print:px-0 print:py-0.5 print:text-xs">
            <span className="font-semibold">Balance Due</span>
            <span className="font-semibold text-warning print:text-black">
              {formatPrice(receipt.amount_due)}
            </span>
          </div>
        )}
        <div className="receipt-print-row flex justify-between px-3 py-2 print:px-0 print:py-0.5 print:text-xs">
          <span>Status</span>
          <span className="hidden print:inline print:font-semibold">
            {receipt.is_paid
              ? "Paid"
              : Number(receipt.amount_paid || 0) > 0
                ? "Part paid"
                : "Credit"}
          </span>
          <span className="print:hidden">
            {receipt.is_paid ? (
              <Badge variant="default" className="bg-primary">
                Paid
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-warning/20 text-warning border-warning/40">
                {Number(receipt.amount_paid || 0) > 0 ? "Part paid" : "Credit"}
              </Badge>
            )}
          </span>
        </div>
      </div>

      {/* Payment history (if any) */}
      {receipt.payments && receipt.payments.length > 0 && (
        <div className="receipt-print-section border rounded-lg overflow-hidden print:border-0">
          <div className="receipt-print-section-label bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground print:bg-transparent print:px-0">
            Payment history
          </div>
          <div className="divide-y print:divide-black/30">
            {receipt.payments.map((p) => (
              <div
                key={p.id}
                className="receipt-print-row flex justify-between gap-2 px-3 py-2 text-sm print:px-0 print:py-1 print:text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.method ? p.method.toUpperCase() : "CASH"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(p.created_at)}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                <span className="receipt-print-amount font-semibold whitespace-nowrap">
                  {formatPrice(p.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {receipt.notes && (
        <div className="receipt-print-section print:text-xs">
          <p className="receipt-print-section-label">Notes</p>
          <p>{receipt.notes}</p>
        </div>
      )}

      <p className="receipt-print-footer hidden print:block">
        Thank you for your business
      </p>

      {footerSlot && <div className="print:hidden">{footerSlot}</div>}

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
