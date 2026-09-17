"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import {
  Search,
  ShoppingCart,
  Check,
  Minus,
  Plus,
  Package,
  Trash2,
  ScanLine,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Link2,
  Settings2,
  Radio,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { fetchWithOfflineCache, sendOrQueueMutation } from "@/lib/offline-sync"
import { useAuth } from "@/hooks/use-auth"
import { ReceiptView, type ReceiptData } from "@/components/receipt-view"
import {
  ReturnItemControls,
  DEFAULT_RETURN_ITEM_STATE,
  type ReturnItemState,
} from "@/components/return-item-controls"
import { SellBarcodeScannerDialog } from "@/components/sell-barcode-scanner-dialog"
import {
  formatSpecifications,
  type ProductSpecifications,
} from "@/lib/product-specifications"
import { formatReceiptLinkLabel } from "@/lib/receipt-display"
import {
  PAYMENT_METHODS,
  type PaymentMethodId,
  initialPaymentMethodForCheckout,
} from "@/lib/payment-methods"
import { printReceiptWithHint } from "@/lib/thermal-print-actions"
import { printThermalReceipt } from "@/lib/receipt-print"
import { playScanBeep } from "@/lib/scan-feedback"
import { resolveCheckoutPayment, shouldUsePartPayment } from "@/lib/checkout-payment"
import { usePosSettings } from "@/hooks/use-pos-settings"
import { useHardwareScanner } from "@/hooks/use-hardware-scanner"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { PosSettingsPanel } from "@/components/pos-settings-panel"

const fetcher = fetchWithOfflineCache

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

interface Product {
  id: string
  name: string
  scan_code: string | null
  tags: string[]
  has_specifications: boolean
  specifications?: ProductSpecifications | null
  quantity: number
  unit_price: number
  category_name: string | null
}

interface CartItem {
  product: Product
  quantity: number
  returnCondition?: ReturnItemState["returnCondition"]
  returnDisposition?: ReturnItemState["returnDisposition"]
}

function withReturnDefaults(item: CartItem, isReturn: boolean): CartItem {
  if (!isReturn) return item
  return {
    ...item,
    returnCondition: item.returnCondition ?? DEFAULT_RETURN_ITEM_STATE.returnCondition,
    returnDisposition:
      item.returnDisposition ?? DEFAULT_RETURN_ITEM_STATE.returnDisposition,
  }
}

function SellPageContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [showReceipt, setShowReceipt] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [showCustomerFields, setShowCustomerFields] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null)
  const [lastReceiptOffline, setLastReceiptOffline] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showOversellConfirm, setShowOversellConfirm] = useState(false)
  const [oversellProduct, setOversellProduct] = useState<Product | null>(null)
  const [oversellQty, setOversellQty] = useState(1)
  const [transactionType, setTransactionType] = useState<"sale" | "return">(() =>
    searchParams.get("type") === "return" ? "return" : "sale"
  )
  const [originalReceiptId, setOriginalReceiptId] = useState<string | null>(null)
  const [linkedSale, setLinkedSale] = useState<{
    id: string
    created_at: string
    net_amount: number
  } | null>(null)
  const [returnableMax, setReturnableMax] = useState<Record<string, number>>({})

  useEffect(() => {
    if (searchParams.get("type") === "return") {
      setTransactionType("return")
    }
    const from = searchParams.get("fromReceipt")
    if (from) {
      setOriginalReceiptId(from)
      setTransactionType("return")
    }
  }, [searchParams])

  useEffect(() => {
    if (transactionType === "return") {
      setCart((prev) => prev.map((item) => withReturnDefaults(item, true)))
    }
  }, [transactionType])
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [discountAmount, setDiscountAmount] = useState("0")
  const [amountPaid, setAmountPaid] = useState("0")
  const [isPartPayment, setIsPartPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("cash")
  const [showPosSettings, setShowPosSettings] = useState(false)
  const [searchEditable, setSearchEditable] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const autoPrintedReceiptIdRef = useRef<string | null>(null)
  const { settings: posSettings } = usePosSettings()

  const scannerPaused =
    showCheckout ||
    showReceipt ||
    showScanner ||
    showOversellConfirm ||
    showPosSettings

  const { data, isLoading, mutate } = useSWR<{ products: Product[] }>(
    "/api/products",
    fetcher
  )

  const products = data?.products || []

  useWakeLock(posSettings.keepScreenAwake && !scannerPaused)

  useEffect(() => {
    if (scannerPaused) return
    const input = searchInputRef.current
    if (!input) return
    input.focus({ preventScroll: true })
  }, [scannerPaused, transactionType])

  useEffect(() => {
    if (!showReceipt || !lastReceipt || !posSettings.autoPrintReceipt) return
    if (autoPrintedReceiptIdRef.current === lastReceipt.id) return
    autoPrintedReceiptIdRef.current = lastReceipt.id
    const timer = window.setTimeout(() => printThermalReceipt(), 400)
    return () => window.clearTimeout(timer)
  }, [showReceipt, lastReceipt, posSettings.autoPrintReceipt])

  useEffect(() => {
    const from = searchParams.get("fromReceipt")
    if (!from || products.length === 0) return

    const loadReturnable = async () => {
      try {
        const res = await fetch(`/api/receipts/${from}/returnable`)
        if (!res.ok) return
        const data = await res.json()
        if (data.customer_name) setCustomerName(data.customer_name)
        if (data.customer_phone) setCustomerPhone(data.customer_phone)
        if (data.original_receipt) {
          setLinkedSale(data.original_receipt)
        }
        const maxMap: Record<string, number> = {}
        const items: CartItem[] = []
        for (const line of data.lines as Array<{
          product_id: string
          returnable_quantity: number
        }>) {
          maxMap[line.product_id] = line.returnable_quantity
          const product = products.find((p) => p.id === line.product_id)
          if (product && line.returnable_quantity > 0) {
            items.push(
              withReturnDefaults(
                { product, quantity: line.returnable_quantity },
                true
              )
            )
          }
        }
        setReturnableMax(maxMap)
        if (items.length > 0) setCart(items)
      } catch {
        // Offline: user can still add return items manually
      }
    }

    void loadReturnable()
  }, [searchParams, products])

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  )

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.quantity * item.product.unit_price,
    0
  )
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const discountValue = Math.max(0, Number(discountAmount) || 0)
  const netTotal = Math.max(0, cartTotal - discountValue)
  const amountTendered = Math.max(0, Number(amountPaid) || 0)
  const checkoutPayment = resolveCheckoutPayment({
    netAmount: netTotal,
    amountTendered,
    isPartPayment,
  })
  const { amountReceived, amountDue, changeGiven } = checkoutPayment

  const getRemainingStock = (product: Product) => {
    const cartItem = cart.find((item) => item.product.id === product.id)
    return product.quantity - (cartItem?.quantity || 0)
  }

  const addToCart = (product: Product, forceQuantity?: number) => {
    const quantity = forceQuantity || 1
    const remaining = getRemainingStock(product)

    if (transactionType === "sale" && remaining <= 0 && !forceQuantity) {
      setOversellProduct(product)
      setOversellQty(1)
      setShowOversellConfirm(true)
      return
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? withReturnDefaults(
                { ...item, quantity: item.quantity + quantity },
                transactionType === "return"
              )
            : item
        )
      }
      return [
        ...prev,
        withReturnDefaults({ product, quantity }, transactionType === "return"),
      ]
    })
  }

  const confirmOversell = () => {
    if (oversellProduct) {
      setCart((prev) => {
        const existing = prev.find((item) => item.product.id === oversellProduct.id)
        if (existing) {
          return prev.map((item) =>
            item.product.id === oversellProduct.id
              ? withReturnDefaults(
                  { ...item, quantity: item.quantity + oversellQty },
                  transactionType === "return"
                )
              : item
          )
        }
        return [
          ...prev,
          withReturnDefaults(
            { product: oversellProduct, quantity: oversellQty },
            transactionType === "return"
          ),
        ]
      })
    }
    setShowOversellConfirm(false)
    setOversellProduct(null)
    setOversellQty(1)
  }

  const updateCartQuantity = (productId: string, delta: number, force?: boolean) => {
    const cartItem = cart.find((item) => item.product.id === productId)
    if (!cartItem) return

    const newQty = cartItem.quantity + delta
    if (newQty <= 0) {
      removeFromCart(productId)
      return
    }

    if (transactionType === "return" && originalReceiptId) {
      const max = returnableMax[productId]
      if (max !== undefined && newQty > max) {
        setError(`Max ${max} can be returned for this sale`)
        return
      }
    }

    if (
      transactionType === "sale" &&
      newQty > cartItem.product.quantity &&
      delta > 0 &&
      !force
    ) {
      setOversellProduct(cartItem.product)
      setOversellQty(1)
      setShowOversellConfirm(true)
      return
    }

    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: newQty } : item
      )
    )
  }

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const clearCart = () => {
    setCart([])
    setDiscountAmount("0")
    setAmountPaid("0")
    setIsPartPayment(false)
    setPaymentMethod("cash")
    setCustomerName("")
    setCustomerPhone("")
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return

    let usePartPayment = isPartPayment
    if (transactionType === "sale") {
      if (!usePartPayment && amountTendered < netTotal) {
        setError(
          "Cash tendered is less than total. Enable Credit / part payment to record a balance owed."
        )
        return
      }
      usePartPayment = shouldUsePartPayment(usePartPayment, amountTendered, netTotal)
      if (isPartPayment && !usePartPayment) {
        setIsPartPayment(false)
      }
      if (usePartPayment) {
        if (!customerName.trim() && !customerPhone.trim()) {
          setShowCustomerFields(true)
          setError(
            "Add customer name or phone for credit sales so you can track who owes you."
          )
          return
        }
      }
    }

    setLoading(true)
    setError("")

    const checkoutPaymentForSale = resolveCheckoutPayment({
      netAmount: netTotal,
      amountTendered,
      isPartPayment: usePartPayment,
    })

    const resolvedPaymentMethod =
      transactionType === "return"
        ? "cash"
        : amountTendered > 0
          ? paymentMethod
          : usePartPayment
            ? "credit"
            : paymentMethod

    try {
      const payload = {
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          ...(transactionType === "return" && {
            returnCondition: item.returnCondition,
            returnDisposition: item.returnDisposition,
          }),
        })),
        type: transactionType,
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
        ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
        discountAmount: discountValue,
        amountPaid: amountTendered,
        isPartPayment: usePartPayment,
        paymentMethod: resolvedPaymentMethod,
        ...(originalReceiptId && transactionType === "return"
          ? { originalReceiptId }
          : {}),
      }

      const { queued, response, conflict } = await sendOrQueueMutation({
        url: "/api/sales/batch",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })

      if (conflict) {
        setError("Checkout conflict detected. Please refresh products and try again.")
        return
      }

      if (!queued && !response?.ok) {
        const data = await response?.json()
        setError(data?.error || "Failed to record sales")
        return
      }

      let receipt: ReceiptData | null = null
      if (!queued && response) {
        try {
          const data = await response.json()
          if (data?.receipt) {
            receipt = {
              ...(data.receipt as ReceiptData),
              sales: (data.sales || []).map(
                (sale: {
                  id: string
                  product_name: string
                  quantity_sold: number
                  unit_price_at_sale: number
                  total_amount: number
                  return_condition?: string | null
                  return_disposition?: string | null
                }) => ({
                  id: sale.id,
                  product_name: sale.product_name,
                  quantity_sold: sale.quantity_sold,
                  unit_price_at_sale: sale.unit_price_at_sale,
                  total_amount: sale.total_amount,
                  return_condition: sale.return_condition,
                  return_disposition: sale.return_disposition,
                })
              ),
              payments:
                amountReceived > 0
                  ? [
                      {
                        id: "initial",
                        amount: amountReceived,
                        method: resolvedPaymentMethod,
                        note: "initial payment",
                        created_at: new Date().toISOString(),
                      },
                    ]
                  : [],
            }
          }
        } catch {
          // fall through to synthetic receipt
        }
      }

      if (!receipt) {
        // Offline / fallback: synthesize a receipt from the cart so we can still print
        receipt = {
          id: `pending-${Date.now()}`,
          type: transactionType,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          subtotal: cartTotal,
          discount_amount: discountValue,
          net_amount: netTotal,
          amount_paid: checkoutPaymentForSale.amountReceived,
          amount_due: checkoutPaymentForSale.amountDue,
          change_given: checkoutPaymentForSale.changeGiven,
          is_part_payment: checkoutPaymentForSale.isPartPayment,
          is_paid: checkoutPaymentForSale.isPaid,
          created_at: new Date().toISOString(),
          sales: cart.map((item, idx) => ({
            id: `${idx}`,
            product_name: item.product.name,
            quantity_sold: item.quantity,
            unit_price_at_sale: item.product.unit_price,
            total_amount: item.quantity * item.product.unit_price,
            return_condition: item.returnCondition,
            return_disposition: item.returnDisposition,
          })),
          payments:
            checkoutPaymentForSale.amountReceived > 0
              ? [
                  {
                    id: "initial",
                    amount: checkoutPaymentForSale.amountReceived,
                    method: resolvedPaymentMethod,
                    note: "initial payment",
                    created_at: new Date().toISOString(),
                  },
                ]
              : [],
        }
      }

      setLastReceipt(receipt)
      setLastReceiptOffline(Boolean(queued))
      setShowCheckout(false)
      setShowReceipt(true)
      clearCart()
      void mutate(undefined, { revalidate: navigator.onLine })

      if (queued) {
        toast({
          title: "Checkout saved offline",
          description: "This transaction will sync automatically when online.",
        })
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleScanInput = (code: string) => {
    const trimmedCode = code.trim()
    if (!trimmedCode) return

    const matchedProduct = products.find(
      (p) => p.scan_code?.toLowerCase() === trimmedCode.toLowerCase()
    )

    if (matchedProduct) {
      addToCart(matchedProduct)
      setSearch("")
      setSearchEditable(false)
      if (posSettings.scanBeep) playScanBeep(true)
      toast({
        title: "Added to cart",
        description: matchedProduct.name,
      })
    } else {
      if (posSettings.scanBeep) playScanBeep(false)
      toast({
        title: "Product not found",
        description: `No product with scan code "${trimmedCode}". Add it under Products first.`,
        variant: "destructive",
      })
    }
  }

  const handleSearchSubmit = (query: string) => {
    const q = query.trim()
    if (!q) return

    const byScan = products.find(
      (p) => p.scan_code?.toLowerCase() === q.toLowerCase()
    )
    const matchedProduct =
      byScan ??
      products.find((p) => p.name.toLowerCase().includes(q.toLowerCase()))

    if (matchedProduct) {
      addToCart(matchedProduct)
      setSearch("")
      setSearchEditable(false)
      toast({
        title: "Added to cart",
        description: matchedProduct.name,
      })
    } else {
      toast({
        title: "No match",
        description: `No product matching "${q}".`,
        variant: "destructive",
      })
    }
  }

  useHardwareScanner({
    enabled: posSettings.hardwareScanner,
    paused: scannerPaused,
    allowedInputRef: searchInputRef,
    onScan: handleScanInput,
  })

  const printReceipt = () => {
    printReceiptWithHint()
  }

  const isReturn = transactionType === "return"

  return (
    <main className="pb-[calc(8rem+env(safe-area-inset-bottom))]">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-background border-b pt-[env(safe-area-inset-top)]">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold leading-tight">
              {isReturn ? "Process Return" : "Make a Sale"}
            </h1>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                onClick={() => setShowPosSettings(true)}
                aria-label="POS settings"
              >
                <Settings2 className="size-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                onClick={() => setShowScanner(true)}
                aria-label="Open camera scanner"
              >
                <ScanLine className="size-5" />
              </Button>
            </div>
          </div>

          {posSettings.hardwareScanner && !scannerPaused && (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-primary">
              <Radio className="size-3.5 shrink-0 animate-pulse" />
              <span>Scanner ready — scan barcodes or tap search to type</span>
            </div>
          )}

          {/* Sale/Return Segmented Toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
            <button
              type="button"
              onClick={() => setTransactionType("sale")}
              className={cn(
                "h-10 rounded-md text-sm font-semibold transition-colors",
                !isReturn
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground"
              )}
            >
              Sale
            </button>
            <button
              type="button"
              onClick={() => setTransactionType("return")}
              className={cn(
                "h-10 rounded-md text-sm font-semibold transition-colors",
                isReturn
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground"
              )}
            >
              Return
            </button>
          </div>

          {isReturn && originalReceiptId && (
            <div className="rounded-lg border bg-warning/10 border-warning/30 p-3 text-sm">
              <p className="font-semibold flex items-center gap-2">
                <Link2 className="size-4 shrink-0" />
                Returning from sale{" "}
                {formatReceiptLinkLabel(
                  linkedSale?.id ?? originalReceiptId,
                  linkedSale?.created_at
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Quantities are capped to what is still returnable on that sale.
                {linkedSale?.net_amount != null && (
                  <> Original total: {formatPrice(linkedSale.net_amount)}.</>
                )}
              </p>
              <Link
                href={`/dashboard/sales?receipt=${originalReceiptId}`}
                className="text-xs text-primary hover:underline mt-1 inline-block"
              >
                View original sale in history
              </Link>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="search"
              inputMode={searchEditable ? "search" : "none"}
              placeholder="Search or scan products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (searchEditable) {
                    handleSearchSubmit(search)
                  } else {
                    handleScanInput(search)
                  }
                  setSearch("")
                  setSearchEditable(false)
                }
              }}
              onClick={() => setSearchEditable(true)}
              onBlur={() => {
                if (!search.trim()) setSearchEditable(false)
              }}
              className="pl-10 h-12 text-base touch-manipulation"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
        </div>
      </header>

      <div className="p-4">
        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm text-center mb-4">
            {error}
          </div>
        )}

        {/* Products List */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <Empty className="mt-12">
            <EmptyMedia>
              <Package className="size-12 text-muted-foreground" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>
                {search ? "No products found" : "No products available"}
              </EmptyTitle>
              <EmptyDescription>
                {search
                  ? "Try a different search term"
                  : "Add products first to start selling"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredProducts.map((product) => {
              const remaining = getRemainingStock(product)
              const inCart = cart.find((item) => item.product.id === product.id)
              const outOfStock = remaining <= 0

              return (
                <Card
                  key={product.id}
                  className={cn(
                    "cursor-pointer transition-all active:scale-[0.98]",
                    inCart && "ring-2 ring-primary bg-primary/5"
                  )}
                  onClick={() => addToCart(product)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate text-base">
                          {product.name}
                        </h3>
                        {product.has_specifications &&
                          formatSpecifications(product.specifications) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {formatSpecifications(product.specifications)}
                            </p>
                          )}
                        <div className="text-sm text-primary font-semibold">
                          {formatPrice(product.unit_price)}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              outOfStock && !isReturn && "text-destructive"
                            )}
                          >
                            {remaining} in stock
                          </span>
                          {inCart && (
                            <Badge variant="default" className="bg-primary h-5 text-[10px]">
                              {inCart.quantity} in cart
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Button
                        size="icon"
                        variant="default"
                        className="size-10 rounded-full shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          addToCart(product)
                        }}
                        aria-label={`Add ${product.name}`}
                      >
                        <Plus className="size-5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Sticky Cart Bar (when items in cart) */}
      {cart.length > 0 && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-30 p-3 bg-background/95 backdrop-blur border-t shadow-lg">
          <Button
            onClick={() => setShowCheckout(true)}
            size="lg"
            className="w-full h-14 text-base font-semibold flex items-center justify-between px-4 touch-manipulation"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="size-5" />
              {cartItemCount} {cartItemCount === 1 ? "item" : "items"}
            </span>
            <span className="flex items-center gap-2">
              {formatPrice(cartTotal)}
              <span className="opacity-75">· Review</span>
            </span>
          </Button>
        </div>
      )}

      {/* Checkout Drawer */}
      <Drawer open={showCheckout} onOpenChange={setShowCheckout}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-xl">
              {isReturn ? "Review Return" : "Review Sale"}
            </DrawerTitle>
            <DrawerDescription>
              {isReturn
                ? "Set condition and whether each item goes back to stock or is discarded."
                : "Confirm cart, customer & payment details."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="overflow-y-auto px-4 space-y-4">
            {/* Cart Items */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground">
                  Cart ({cartItemCount})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCart}
                  className="text-destructive h-8 px-2"
                >
                  <Trash2 className="size-4 mr-1" />
                  Clear
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex flex-col gap-2 bg-muted/50 rounded-lg p-2"
                  >
                    <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate text-base">
                          {item.product.name}
                        </h3>
                        {item.product.has_specifications &&
                          formatSpecifications(item.product.specifications) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {formatSpecifications(item.product.specifications)}
                            </p>
                          )}
                        {isReturn &&
                          originalReceiptId &&
                          returnableMax[item.product.id] !== undefined && (
                            <Badge variant="outline" className="mt-1 h-5 text-[10px]">
                              Max {returnableMax[item.product.id]} from sale
                            </Badge>
                          )}
                        <p className="text-xs text-muted-foreground">
                        {formatPrice(item.product.unit_price)} ×{" "}
                        {item.quantity} ={" "}
                        <span className="font-semibold">
                          {formatPrice(item.product.unit_price * item.quantity)}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() =>
                          updateCartQuantity(item.product.id, -1)
                        }
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-8 text-center font-semibold tabular-nums text-sm">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() =>
                          updateCartQuantity(item.product.id, 1)
                        }
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => removeFromCart(item.product.id)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    </div>
                    {isReturn && (
                      <ReturnItemControls
                        compact
                        value={{
                          returnCondition:
                            item.returnCondition ??
                            DEFAULT_RETURN_ITEM_STATE.returnCondition,
                          returnDisposition:
                            item.returnDisposition ??
                            DEFAULT_RETURN_ITEM_STATE.returnDisposition,
                        }}
                        onChange={(next) =>
                          setCart((prev) =>
                            prev.map((row) =>
                              row.product.id === item.product.id
                                ? { ...row, ...next }
                                : row
                            )
                          )
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Customer Section (Collapsible) */}
            <section className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCustomerFields((v) => !v)}
                className="w-full flex items-center justify-between p-3 text-sm font-semibold hover:bg-muted/50"
              >
                <span>
                  {isPartPayment
                    ? "Customer details (required for credit)"
                    : "Customer details (optional)"}
                </span>
                {showCustomerFields ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>
              {showCustomerFields && (
                <div className="p-3 pt-0 space-y-2">
                  <Input
                    type="text"
                    placeholder="Customer name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-11"
                  />
                  <Input
                    type="tel"
                    placeholder="Customer phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="h-11"
                  />
                  {isPartPayment && (
                    <p className="text-xs text-muted-foreground">
                      Name or phone is required so this balance appears in your credit book.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Payment Section */}
            <section className="space-y-3">
              <h3 className="font-semibold text-sm uppercase text-muted-foreground">
                Payment
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Discount
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Cash tendered
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="h-11"
                    inputMode="decimal"
                  />
                </div>
              </div>

              {transactionType === "sale" && !isPartPayment && netTotal > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full h-12 text-base font-semibold touch-manipulation"
                  onClick={() => {
                    setAmountPaid(String(netTotal))
                    setPaymentMethod("cash")
                  }}
                >
                  Exact cash — {formatPrice(netTotal)}
                </Button>
              )}

              {transactionType === "sale" && (
              <Button
                type="button"
                variant={isPartPayment ? "default" : "outline"}
                onClick={() => {
                  setIsPartPayment((prev) => {
                    const next = !prev
                    if (next) setShowCustomerFields(true)
                    setPaymentMethod(
                      initialPaymentMethodForCheckout(next, amountTendered)
                    )
                    return next
                  })
                }}
                className="w-full h-11"
              >
                {isPartPayment
                  ? "✓ Credit / part payment enabled"
                  : "Enable credit / part payment"}
              </Button>
              )}

              {transactionType === "sale" && amountTendered > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Payment method</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.filter((m) => m.id !== "credit").map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setPaymentMethod(method.id)}
                        className={cn(
                          "h-11 rounded-lg border text-sm font-medium transition-colors",
                          paymentMethod === method.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background hover:bg-muted/50"
                        )}
                      >
                        {method.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {transactionType === "sale" && isPartPayment && amountTendered <= 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
                  Full credit sale — customer owes {formatPrice(netTotal)}. Add their name or
                  phone above.
                </div>
              )}
              {transactionType === "sale" &&
                isPartPayment &&
                amountTendered > 0 &&
                amountTendered < netTotal && (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
                    Partial payment — balance of {formatPrice(amountDue)} will be owed.
                  </div>
                )}

              {/* Summary */}
              <div className="rounded-lg border divide-y">
                <div className="flex justify-between p-3 text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatPrice(cartTotal)}</span>
                </div>
                {discountValue > 0 && (
                  <div className="flex justify-between p-3 text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="font-medium">
                      −{formatPrice(discountValue)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between p-3">
                  <span className="font-semibold">Net total</span>
                  <span className="font-bold text-primary text-lg">
                    {formatPrice(netTotal)}
                  </span>
                </div>
                {amountTendered > 0 && (
                  <div className="flex justify-between p-3 text-sm">
                    <span className="text-muted-foreground">Amount received</span>
                    <span className="font-semibold">{formatPrice(amountReceived)}</span>
                  </div>
                )}
                {amountDue > 0 && (
                  <div className="flex justify-between p-3 text-sm bg-warning/5">
                    <span className="text-warning-foreground">Balance due</span>
                    <span className="font-semibold text-warning">
                      {formatPrice(amountDue)}
                    </span>
                  </div>
                )}
                {changeGiven > 0 && (
                  <div className="flex justify-between p-3 text-sm bg-primary/5">
                    <span>Change</span>
                    <span className="font-semibold text-primary">
                      {formatPrice(changeGiven)}
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>

          <DrawerFooter>
            {error && (
              <div className="rounded-lg bg-destructive/10 p-2 text-destructive text-sm text-center">
                {error}
              </div>
            )}
            <Button
              onClick={handleCheckout}
              disabled={loading}
              size="lg"
              className="w-full h-14 text-base font-semibold"
            >
              {loading ? (
                "Processing..."
              ) : (
                <>
                  <Check className="mr-2 size-5" />
                  {isReturn ? "Confirm Return" : "Confirm Sale"} ·{" "}
                  {formatPrice(netTotal)}
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowCheckout(false)}
              className="w-full"
            >
              Keep shopping
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <SellBarcodeScannerDialog
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScanInput}
      />

      <Drawer open={showPosSettings} onOpenChange={setShowPosSettings}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Handheld POS settings</DrawerTitle>
            <DrawerDescription>
              Tuned for barcode scanners and 58mm receipt printers. Saved on this device.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] divide-y">
            <PosSettingsPanel />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Receipt Dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="receipt-print-dialog sm:max-w-md max-h-[90vh] overflow-y-auto print:shadow-none print:max-w-none print:max-h-none print:overflow-visible">
          <DialogHeader className="sr-only">
            <DialogTitle>Receipt</DialogTitle>
          </DialogHeader>
          {lastReceipt && (
            <ReceiptView
              receipt={lastReceipt}
              businessName={user?.business_name}
              shopLogoUrl={user?.shop_logo_url}
              onPrint={printReceipt}
              onClose={() => setShowReceipt(false)}
              footerSlot={
                lastReceiptOffline ? (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning-foreground text-center print:hidden">
                    Saved offline. Receipt will be assigned a permanent number when synced.
                  </div>
                ) : null
              }
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Oversell Confirmation Dialog */}
      <Dialog open={showOversellConfirm} onOpenChange={setShowOversellConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-warning/20">
              <AlertTriangle className="size-8 text-warning" />
            </div>
            <DialogTitle className="text-center">Sell More Than Stock?</DialogTitle>
            <DialogDescription className="text-center">
              {oversellProduct && (
                <>
                  <span className="font-semibold text-foreground">
                    {oversellProduct.name}
                  </span>{" "}
                  only has{" "}
                  <span className="font-semibold text-destructive">
                    {oversellProduct.quantity}
                  </span>{" "}
                  in stock. How many do you want to sell?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center gap-4 py-4">
            <Button
              variant="outline"
              size="icon"
              className="size-12"
              onClick={() => setOversellQty(Math.max(1, oversellQty - 1))}
            >
              <Minus className="size-5" />
            </Button>
            <span className="text-3xl font-bold w-16 text-center tabular-nums">
              {oversellQty}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-12"
              onClick={() => setOversellQty(oversellQty + 1)}
            >
              <Plus className="size-5" />
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Stock will go negative. Make sure you have the items!
          </p>

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setShowOversellConfirm(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmOversell}
              className="flex-1 bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Yes, Sell {oversellQty}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

export default function SellPage() {
  return (
    <Suspense fallback={null}>
      <SellPageContent />
    </Suspense>
  )
}
