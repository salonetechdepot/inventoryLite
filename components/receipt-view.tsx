"use client"

import { Check, Printer, Undo2, Link2 } from "lucide-react"
import dynamic from "next/dynamic"
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
import { whatsappPhone, whatsappReceiptUrl } from "@/lib/whatsapp-receipt"

const ReceiptReferenceQr = dynamic(
  () =>
    import("@/components/receipt-reference-qr").then((m) => m.ReceiptReferenceQr),
  { ssr: false }
)

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.5h-.01a9.43 9.43 0 0 1-4.81-1.32l-.34-.2-3.58.94.96-3.49-.22-.36a9.42 9.42 0 0 1-1.45-5.03c0-5.21 4.24-9.45 9.46-9.45a9.4 9.4 0 0 1 6.68 2.77 9.4 9.4 0 0 1 2.77 6.69c0 5.21-4.25 9.45-9.46 9.45zm8.05-17.5A11.3 11.3 0 0 0 12.04.67C5.77.67.67 5.77.67 12.04c0 2 .52 3.96 1.52 5.69L.57 23.33l5.73-1.5a11.35 11.35 0 0 0 5.74 1.46h.01c6.27 0 11.37-5.1 11.37-11.37 0-3.04-1.18-5.89-3.33-8.04z" />
    </svg>
  )
}

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
    <div className={cn("receipt-print-root flex flex-col gap-4", className)}>
      <div className="receipt-print-header text-center">
        <div
          className={cn(
            "receipt-no-print mx-auto mb-3 flex size-14 items-center justify-center rounded-full",
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
            className="mx-auto mb-2 size-12 rounded-md object-cover"
          />
        )}
        {businessName && (
          <p className="receipt-print-shop text-base font-bold uppercase tracking-wide">
            {businessName}
          </p>
        )}
        <h2 className="receipt-print-title text-lg font-bold">
          {isReturn ? "Return Receipt" : "Sales Receipt"}
        </h2>
        <p className="receipt-print-meta text-xs text-muted-foreground">
          #{receipt.id.slice(0, 8).toUpperCase()} · {formatDateTime(receipt.created_at)}
        </p>
      </div>

      {(receipt.customer_name || receipt.customer_phone) && (
        <div className="receipt-print-section border rounded-lg p-2 text-sm">
          <p className="receipt-print-section-label text-xs font-semibold uppercase text-muted-foreground">
            Customer
          </p>
          {receipt.customer_name && <p>Name: {receipt.customer_name}</p>}
          {receipt.customer_phone && <p>Phone: {receipt.customer_phone}</p>}
        </div>
      )}

      {isReturn && receipt.original_receipt_id && (
        <div className="receipt-print-section border rounded-lg p-2 text-sm bg-muted/30">
          <p className="receipt-print-section-label text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
            <Link2 className="receipt-no-print size-3" />
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
      <div className="receipt-print-section border rounded-lg overflow-hidden">
        <div className="receipt-print-row receipt-print-row-header flex items-center justify-between bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
          <span>Item</span>
          <span>Amount</span>
        </div>
        <div className="divide-y">
          {receipt.sales.map((line) => (
            <div
              key={line.id}
              className="receipt-print-row flex justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="receipt-print-item-name font-medium truncate">
                  {line.product_name}
                </p>
                <p className="receipt-print-item-detail text-xs text-muted-foreground">
                  {line.quantity_sold} × {formatPrice(line.unit_price_at_sale)}
                </p>
                {isReturn &&
                  (line.return_condition || line.return_disposition) && (
                    <p className="text-xs mt-0.5 flex flex-wrap gap-1">
                      {line.return_condition && (
                        <Badge variant="outline" className="h-5 text-[10px] font-normal">
                          {formatReturnCondition(line.return_condition as ReturnCondition)}
                        </Badge>
                      )}
                      {line.return_disposition && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 text-[10px] font-normal",
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
      <div className="receipt-print-section border rounded-lg divide-y text-sm">
        <div className="receipt-print-row flex justify-between px-3 py-2">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatPrice(receipt.subtotal)}</span>
        </div>
        {receipt.discount_amount > 0 && (
          <div className="receipt-print-row flex justify-between px-3 py-2">
            <span className="text-muted-foreground">Discount</span>
            <span>−{formatPrice(receipt.discount_amount)}</span>
          </div>
        )}
        <div className="receipt-print-row receipt-print-total-row flex justify-between px-3 py-2 font-bold bg-primary/5">
          <span>TOTAL</span>
          <span className="text-primary text-base">
            {formatPrice(receipt.net_amount)}
          </span>
        </div>
        {receipt.change_given > 0 && (
          <div className="receipt-print-row flex justify-between px-3 py-2">
            <span className="text-muted-foreground">Cash tendered</span>
            <span>
              {formatPrice(
                cashTenderedFromReceipt(receipt.amount_paid, receipt.change_given)
              )}
            </span>
          </div>
        )}
        <div className="receipt-print-row flex justify-between px-3 py-2">
          <span className="text-muted-foreground">Amount received</span>
          <span>{formatPrice(receipt.amount_paid)}</span>
        </div>
        {receipt.change_given > 0 && (
          <div className="receipt-print-row flex justify-between px-3 py-2">
            <span className="text-muted-foreground">Change given</span>
            <span>{formatPrice(receipt.change_given)}</span>
          </div>
        )}
        {receipt.amount_due > 0 && (
          <div className="receipt-print-row flex justify-between px-3 py-2 bg-warning/10">
            <span className="font-semibold">Balance Due</span>
            <span className="font-semibold text-warning">
              {formatPrice(receipt.amount_due)}
            </span>
          </div>
        )}
        <div className="receipt-print-row flex justify-between px-3 py-2">
          <span>Status</span>
          <span className="receipt-print-status hidden font-semibold">
            {receipt.is_paid
              ? "Paid"
              : Number(receipt.amount_paid || 0) > 0
                ? "Part paid"
                : "Credit"}
          </span>
          <span className="receipt-no-print">
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
        <div className="receipt-print-section border rounded-lg overflow-hidden">
          <div className="receipt-print-section-label bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Payment history
          </div>
          <div className="divide-y">
            {receipt.payments.map((p) => (
              <div
                key={p.id}
                className="receipt-print-row flex justify-between gap-2 px-3 py-2 text-sm"
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
        <div className="receipt-print-section">
          <p className="receipt-print-section-label">Notes</p>
          <p>{receipt.notes}</p>
        </div>
      )}

      <ReceiptReferenceQr receiptId={receipt.id} size={68} className="mt-2" />

      <p className="receipt-print-footer hidden">
        Thank you for your business
      </p>

      {footerSlot && <div className="receipt-no-print">{footerSlot}</div>}

      <div className="receipt-no-print space-y-2">
        <Button asChild variant="outline" className="w-full border-[#25D366]/50 text-[#128C7E]">
          <a
            href={whatsappReceiptUrl(receipt, businessName)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppIcon className="mr-2 size-4" />
            {whatsappPhone(receipt.customer_phone)
              ? "Send to customer on WhatsApp"
              : "Share on WhatsApp"}
          </a>
        </Button>

        {(onPrint || onClose) && (
          <div className="flex gap-2">
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
    </div>
  )
}
