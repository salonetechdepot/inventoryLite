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
  BookUser,
  LayoutGrid,
  ArrowDown,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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
import {
  fetchWithOfflineCache,
  loadReturnableFromCache,
  SALE_RECEIPTS_CACHE_KEY,
  sendOrQueueMutation,
} from "@/lib/offline-sync"
import { normalizePhoneKey, sumOutstanding, type DebtorReceiptSummary } from "@/lib/debtors"
import { CollectDebtDrawer } from "@/components/collect-debt-drawer"
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
import type { ScanSource } from "@/lib/hardware-scanner"
import { ToastAction } from "@/components/ui/toast"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { PosSettingsPanel } from "@/components/pos-settings-panel"
import { formatStockLabel } from "@/lib/db"

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
  low_stock_threshold?: number
  category_name: string | null
}

const DEFAULT_LOW_STOCK_THRESHOLD = 5
const SEARCH_RESULT_LIMIT = 8

function lowStockThreshold(product: Product) {
  return Number(product.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD)
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

const OPEN_ON_SELL_ASKED_KEY = "biva-open-on-sell-asked"

/** In-progress sale kept on this device so an app reload (e.g. after printing) keeps it. */
const SELL_DRAFT_KEY = "biva-sell-draft-v1"

type SellDraft = {
  tenantId: string
  cart: CartItem[]
  transactionType: "sale" | "return"
  customerName: string
  customerPhone: string
  discountAmount: string
  amountPaid: string
  isPartPayment: boolean
  paymentMethod: PaymentMethodId
  lastReceipt: ReceiptData | null
  lastReceiptOffline: boolean
  showReceipt: boolean
  autoPrintedReceiptId: string | null
}

function readSellDraft(tenantId: string): SellDraft | null {
  try {
    const raw = localStorage.getItem(SELL_DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as SellDraft
    return draft?.tenantId === tenantId ? draft : null
  } catch {
    return null
  }
}

function writeSellDraft(draft: SellDraft) {
  try {
    localStorage.setItem(SELL_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Storage full or blocked — the sale still works, it just won't survive a reload.
  }
}

function SellPageContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [showReceipt, setShowReceipt] = useState(false)
  const [showCustomerFields, setShowCustomerFields] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null)
  const [lastReceiptOffline, setLastReceiptOffline] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")
  const [pickerCategory, setPickerCategory] = useState<string | null>(null)
  const [showOversellConfirm, setShowOversellConfirm] = useState(false)
  const [oversellProduct, setOversellProduct] = useState<Product | null>(null)
  const [oversellQty, setOversellQty] = useState(1)
  const [transactionType, setTransactionType] = useState<"sale" | "return">(() =>
    searchParams.get("type") === "return" ? "return" : "sale"
  )
  const [originalReceiptId, setOriginalReceiptId] = useState<string | null>(null)
  const [linkedSale, setLinkedSale] = useState<{
    id: string
    created_at: string | Date
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
  const [showCollectDebt, setShowCollectDebt] = useState(false)
  const [collectDebtQuery, setCollectDebtQuery] = useState("")
  const [searchEditable, setSearchEditable] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const checkoutSectionRef = useRef<HTMLElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const autoPrintedReceiptIdRef = useRef<string | null>(null)
  const { settings: posSettings, update: updatePosSettings } = usePosSettings()

  const scannerPaused =
    showReceipt ||
    showScanner ||
    showPicker ||
    showOversellConfirm ||
    showPosSettings ||
    showCollectDebt

  const { data, isLoading, mutate } = useSWR<{ products: Product[] }>(
    "/api/products",
    fetcher
  )

  const products = data?.products || []

  const { data: saleReceiptsData } = useSWR<{ receipts: DebtorReceiptSummary[] }>(
    SALE_RECEIPTS_CACHE_KEY,
    fetcher
  )
  const customerPhoneKey = normalizePhoneKey(customerPhone)
  const customerOwes =
    customerPhoneKey.length >= 8
      ? sumOutstanding(
          (saleReceiptsData?.receipts ?? []).filter(
            (receipt) => normalizePhoneKey(receipt.customer_phone) === customerPhoneKey
          )
        )
      : 0

  const openCollectDebt = (query = "") => {
    setCollectDebtQuery(query)
    setShowCollectDebt(true)
  }

  const tenantId = user?.tenant_id ?? null

  useEffect(() => {
    if (!tenantId || draftReady) return
    const linkedReturn = searchParams.get("fromReceipt") || searchParams.get("type") === "return"
    const draft = readSellDraft(tenantId)
    if (draft) {
      if (!linkedReturn) {
        setCart(draft.cart ?? [])
        setTransactionType(draft.transactionType === "return" ? "return" : "sale")
        setCustomerName(draft.customerName ?? "")
        setCustomerPhone(draft.customerPhone ?? "")
        setDiscountAmount(draft.discountAmount ?? "0")
        setAmountPaid(draft.amountPaid ?? "0")
        setIsPartPayment(Boolean(draft.isPartPayment))
        setPaymentMethod(draft.paymentMethod ?? "cash")
      }
      autoPrintedReceiptIdRef.current = draft.autoPrintedReceiptId ?? null
      setLastReceipt(draft.lastReceipt ?? null)
      setLastReceiptOffline(Boolean(draft.lastReceiptOffline))
      setShowReceipt(Boolean(draft.showReceipt && draft.lastReceipt))
    }
    setDraftReady(true)
  }, [tenantId, draftReady, searchParams])

  useEffect(() => {
    if (!draftReady || !tenantId) return
    writeSellDraft({
      tenantId,
      cart,
      transactionType,
      customerName,
      customerPhone,
      discountAmount,
      amountPaid,
      isPartPayment,
      paymentMethod,
      lastReceipt,
      lastReceiptOffline,
      showReceipt,
      autoPrintedReceiptId: autoPrintedReceiptIdRef.current,
    })
  }, [
    draftReady,
    tenantId,
    cart,
    transactionType,
    customerName,
    customerPhone,
    discountAmount,
    amountPaid,
    isPartPayment,
    paymentMethod,
    lastReceipt,
    lastReceiptOffline,
    showReceipt,
  ])

  // Keep cart lines in step with the latest stock and prices.
  useEffect(() => {
    if (products.length === 0) return
    setCart((prev) => {
      let changed = false
      const next = prev.map((item) => {
        const fresh = products.find((p) => p.id === item.product.id)
        if (!fresh || fresh === item.product) return item
        changed = true
        return { ...item, product: fresh }
      })
      return changed ? next : prev
    })
  }, [products])

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
    if (tenantId) {
      const draft = readSellDraft(tenantId)
      if (draft) writeSellDraft({ ...draft, autoPrintedReceiptId: lastReceipt.id })
    }
    const timer = window.setTimeout(() => printThermalReceipt(), 400)
    return () => window.clearTimeout(timer)
  }, [showReceipt, lastReceipt, posSettings.autoPrintReceipt, tenantId])

  useEffect(() => {
    const from = searchParams.get("fromReceipt")
    if (!from || products.length === 0) return

    const loadReturnable = async () => {
      const apply = (data: {
        customer_name?: string | null
        customer_phone?: string | null
        original_receipt?: {
          id: string
          created_at: string | Date
          net_amount: number
        } | null
        lines?: Array<{ product_id: string; returnable_quantity: number }>
      }) => {
        if (data.customer_name) setCustomerName(data.customer_name)
        if (data.customer_phone) setCustomerPhone(data.customer_phone)
        if (data.original_receipt) {
          setLinkedSale(data.original_receipt)
        }
        const maxMap: Record<string, number> = {}
        const items: CartItem[] = []
        for (const line of data.lines ?? []) {
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
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const cached = await loadReturnableFromCache(from)
        if (cached) apply(cached)
        return
      }

      try {
        const controller = new AbortController()
        const timer = window.setTimeout(() => controller.abort(), 4000)
        const res = await fetch(`/api/receipts/${from}/returnable`, {
          signal: controller.signal,
        }).finally(() => window.clearTimeout(timer))
        if (!res.ok) {
          const cached = await loadReturnableFromCache(from)
          if (cached) apply(cached)
          return
        }
        const data = await res.json()
        apply(data)
      } catch {
        const cached = await loadReturnableFromCache(from)
        if (cached) apply(cached)
      }
    }

    void loadReturnable()
  }, [searchParams, products])

  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const lowStockProducts = products.filter(
    (product) => product.quantity > 0 && product.quantity <= lowStockThreshold(product)
  )
  const outOfStockProducts = products.filter((product) => product.quantity <= 0)

  const categories = Array.from(
    new Set(
      products
        .map((product) => product.category_name)
        .filter((name): name is string => Boolean(name))
    )
  ).sort((a, b) => a.localeCompare(b))

  const pickerProducts = products.filter((product) => {
    const q = pickerSearch.trim().toLowerCase()
    if (q && !product.name.toLowerCase().includes(q)) return false
    if (pickerCategory && product.category_name !== pickerCategory) return false
    if (showLowStockOnly) return product.quantity <= lowStockThreshold(product)
    return true
  })

  const searchQuery = searchEditable ? search.trim().toLowerCase() : ""
  const searchResults = searchQuery
    ? products
        .filter(
          (product) =>
            product.name.toLowerCase().includes(searchQuery) ||
            product.scan_code?.toLowerCase() === searchQuery
        )
        .slice(0, SEARCH_RESULT_LIMIT)
    : []

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

  const hasCart = cart.length > 0

  useEffect(() => {
    const target = confirmButtonRef.current
    if (!hasCart || !target) {
      setConfirmVisible(false)
      return
    }
    const observer = new IntersectionObserver(([entry]) =>
      setConfirmVisible(entry.isIntersecting)
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasCart])

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

    setError("")
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        // Move the line to the top so the latest scan is always visible.
        return [
          withReturnDefaults(
            { ...existing, quantity: existing.quantity + quantity },
            transactionType === "return"
          ),
          ...prev.filter((item) => item.product.id !== product.id),
        ]
      }
      return [
        withReturnDefaults({ product, quantity }, transactionType === "return"),
        ...prev,
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
          withReturnDefaults(
            { product: oversellProduct, quantity: oversellQty },
            transactionType === "return"
          ),
          ...prev,
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

      const result = await sendOrQueueMutation({
        url: "/api/sales/batch",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })
      const { queued, response } = result
      const serverError = "serverError" in result ? result.serverError : undefined
      const needsSignIn = "needsSignIn" in result && result.needsSignIn
      const localId = "localId" in result ? result.localId : undefined
      const savedOffline = "offline" in result ? result.offline : queued

      if (!queued && !response?.ok) {
        const data = await response?.json().catch(() => null)
        const reason =
          typeof data?.error === "string" && data.error
            ? data.error
            : `Checkout failed (${response?.status ?? "no response"}).`
        setError(
          "conflict" in result && result.conflict
            ? `${reason} Refresh Products, then try again.`
            : reason
        )
        void mutate()
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
        // Saved on this device first: build the receipt from the cart so it prints at once
        receipt = {
          id: localId ?? `pending-${Date.now()}`,
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

      if (transactionType === "sale") {
        const runningLow = cart
          .map((item) => ({
            name: item.product.name,
            left: item.product.quantity - item.quantity,
            threshold: lowStockThreshold(item.product),
          }))
          .filter((row) => row.left <= row.threshold)
        if (runningLow.length > 0) {
          toast({
            title: runningLow.some((row) => row.left <= 0) ? "Out of stock" : "Running low",
            description: runningLow
              .map((row) => `${row.name}: ${Math.max(0, row.left)} left`)
              .join(" · "),
          })
        }
      }

      setLastReceipt(receipt)
      setLastReceiptOffline(Boolean(savedOffline))
      setShowReceipt(true)
      setShowCustomerFields(false)
      clearCart()
      window.scrollTo({ top: 0 })
      void mutate(undefined, { revalidate: navigator.onLine })

      if (queued && needsSignIn) {
        toast({
          title: "Sale saved on this device",
          description: "Your sign-in has expired. Sign in again to send it — nothing is lost.",
        })
      } else if (queued && serverError) {
        toast({
          title: "Sale saved — server did not accept it yet",
          description: `${serverError} It will retry automatically; if it keeps failing, open Sync conflicts.`,
          variant: "destructive",
        })
      } else if (queued && savedOffline) {
        toast({
          title: "Sale saved offline",
          description: "It will be sent automatically when the connection is back.",
        })
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const findByScanCode = (code: string) =>
    products.find((p) => p.scan_code?.toLowerCase() === code.trim().toLowerCase())

  const handleScanInput = (code: string): boolean => {
    const trimmedCode = code.trim()
    if (!trimmedCode) return false

    const matchedProduct = findByScanCode(trimmedCode)

    if (matchedProduct) {
      addToCart(matchedProduct)
      setSearch("")
      setSearchEditable(false)
      if (posSettings.scanBeep) playScanBeep(true)
      return true
    }
    if (posSettings.scanBeep) playScanBeep(false)
    toast({
      title: "Product not found",
      description: `No product with scan code "${trimmedCode}". Add it under Products first.`,
      variant: "destructive",
    })
    return false
  }

  const offerOpenOnSell = () => {
    if (posSettings.openOnSell) return
    try {
      if (localStorage.getItem(OPEN_ON_SELL_ASKED_KEY)) return
      localStorage.setItem(OPEN_ON_SELL_ASKED_KEY, "1")
    } catch {
      return
    }
    toast({
      title: "Is this a till?",
      description: "Open BIVA straight on the Sell screen every time on this device.",
      duration: 12000,
      action: (
        <ToastAction
          altText="Open on Sell screen"
          onClick={() => updatePosSettings({ openOnSell: true })}
        >
          Yes
        </ToastAction>
      ),
    })
  }

  const handleHardwareScan = (code: string, source: ScanSource) => {
    // While the cashier is typing a search, Enter submits the search instead.
    if (source === "allowed" && searchEditable) return false
    // Fast typing in cash/discount fields is only a scan if it matches a product.
    if (source === "field" && !findByScanCode(code)) return false
    if (handleScanInput(code)) offerOpenOnSell()
    return true
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
    } else {
      toast({
        title: "No match",
        description: `No product matching "${q}".`,
        variant: "destructive",
      })
    }
  }

  const pickSearchResult = (product: Product) => {
    addToCart(product)
    setSearch("")
    setSearchEditable(false)
    searchInputRef.current?.blur()
  }

  useHardwareScanner({
    enabled: posSettings.hardwareScanner,
    paused: scannerPaused,
    allowedInputRef: searchInputRef,
    maxKeyGapMs: posSettings.scannerKeyGapMs,
    onScan: handleHardwareScan,
  })

  const printReceipt = () => {
    printReceiptWithHint()
  }

  const scrollToCheckout = () => {
    checkoutSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const isReturn = transactionType === "return"

  const renderStockBadges = (product: Product) => {
    const remaining = getRemainingStock(product)
    const inCart = cart.find((item) => item.product.id === product.id)
    const outOfStock = remaining <= 0
    const lowStock = !outOfStock && remaining <= lowStockThreshold(product)
    return (
      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
        <span className={cn(outOfStock && !isReturn && "text-destructive")}>
          {formatStockLabel(remaining)}
        </span>
        {!isReturn && outOfStock && (
          <Badge variant="destructive" className="h-5 text-[10px]">
            Out of stock
          </Badge>
        )}
        {!isReturn && lowStock && (
          <Badge
            variant="outline"
            className="h-5 border-warning/50 bg-warning/10 text-[10px] text-warning-foreground"
          >
            Low stock
          </Badge>
        )}
        {inCart && (
          <Badge variant="default" className="bg-primary h-5 text-[10px]">
            {inCart.quantity} in cart
          </Badge>
        )}
      </div>
    )
  }

  const renderProductRow = (product: Product, onPick: (product: Product) => void) => {
    const inCart = cart.some((item) => item.product.id === product.id)
    return (
      <button
        key={product.id}
        type="button"
        onClick={() => onPick(product)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-all active:scale-[0.98] touch-manipulation",
          inCart && "ring-2 ring-primary bg-primary/5"
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{product.name}</p>
          {product.has_specifications &&
            formatSpecifications(product.specifications) && (
              <p className="truncate text-xs text-muted-foreground">
                {formatSpecifications(product.specifications)}
              </p>
            )}
          <p className="text-sm font-semibold text-primary">
            {formatPrice(product.unit_price)}
          </p>
          {renderStockBadges(product)}
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Plus className="size-5" />
        </span>
      </button>
    )
  }

  return (
    <main
      className={cn(
        hasCart && !confirmVisible
          ? "pb-[calc(8rem+env(safe-area-inset-bottom))]"
          : "pb-4"
      )}
    >
      {/* Top: scan / search / pick */}
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 bg-background border-b">
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="grid flex-1 grid-cols-2 gap-1 p-1 bg-muted rounded-lg max-w-[14rem]">
              <button
                type="button"
                onClick={() => setTransactionType("sale")}
                className={cn(
                  "h-9 rounded-md text-sm font-semibold transition-colors",
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
                  "h-9 rounded-md text-sm font-semibold transition-colors",
                  isReturn
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground"
                )}
              >
                Return
              </button>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="outline"
                size="icon"
                className="size-10"
                onClick={() => openCollectDebt()}
                aria-label="Collect a debt"
                title="Collect a debt"
              >
                <BookUser className="size-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-10"
                onClick={() => setShowPosSettings(true)}
                aria-label="POS settings"
              >
                <Settings2 className="size-5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="search"
                inputMode={searchEditable ? "search" : "none"}
                placeholder={
                  posSettings.hardwareScanner ? "Scan or tap to search…" : "Search products…"
                }
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
            <Button
              variant="outline"
              size="icon"
              className="size-12 shrink-0"
              onClick={() => setShowScanner(true)}
              aria-label="Scan with camera"
              title="Scan with camera"
            >
              <ScanLine className="size-5" />
            </Button>
            <Button
              variant="default"
              className="h-12 shrink-0 px-3"
              onClick={() => setShowPicker(true)}
              aria-label="Pick products"
            >
              <LayoutGrid className="size-5" />
              <span className="hidden min-[380px]:inline">Pick</span>
            </Button>
          </div>

          {posSettings.hardwareScanner && !scannerPaused && !searchEditable && (
            <p className="flex items-center gap-1.5 text-xs text-primary">
              <Radio className="size-3.5 shrink-0 animate-pulse" />
              Scanner ready
            </p>
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="max-h-[50vh] overflow-y-auto border-t bg-background px-3 pb-3 pt-2 space-y-2">
            {searchResults.map((product) => renderProductRow(product, pickSearchResult))}
          </div>
        )}
        {searchQuery && searchResults.length === 0 && !isLoading && (
          <p className="border-t px-3 py-3 text-sm text-muted-foreground">
            No product matching &ldquo;{search.trim()}&rdquo;.
          </p>
        )}
      </header>

      <div className="p-3 space-y-4">
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

        {/* Cart */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm uppercase text-muted-foreground">
              {isReturn ? "Return items" : "Cart"} ({cartItemCount})
            </h2>
            {hasCart && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCart}
                className="text-destructive h-8 px-2"
              >
                <Trash2 className="size-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {isLoading && !hasCart ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : !hasCart ? (
            <Empty className="rounded-xl border border-dashed py-8">
              <EmptyMedia>
                <ShoppingCart className="size-10 text-muted-foreground" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>
                  {products.length === 0 ? "No products yet" : "Cart is empty"}
                </EmptyTitle>
                <EmptyDescription>
                  {products.length === 0
                    ? "Add products first to start selling."
                    : "Scan a barcode, search above, or tap Pick to add items."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {cart.map((item, index) => (
                <div
                  key={item.product.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-2.5",
                    index === 0 ? "border-primary/40 bg-primary/5" : "bg-muted/40"
                  )}
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
                        {formatPrice(item.product.unit_price)} × {item.quantity} ={" "}
                        <span className="font-semibold text-foreground">
                          {formatPrice(item.product.unit_price * item.quantity)}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-9"
                        onClick={() => updateCartQuantity(item.product.id, -1)}
                        aria-label={`Remove one ${item.product.name}`}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-8 text-center font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-9"
                        onClick={() => updateCartQuantity(item.product.id, 1)}
                        aria-label={`Add one ${item.product.name}`}
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 text-destructive"
                        onClick={() => removeFromCart(item.product.id)}
                        aria-label={`Remove ${item.product.name}`}
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
          )}
        </section>

        {/* Checkout — scroll down to complete */}
        {hasCart && (
          <section ref={checkoutSectionRef} className="scroll-mt-40 space-y-4">
            {/* Customer Section (Collapsible) */}
            <div className="border rounded-lg overflow-hidden">
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
                  {!isReturn && customerOwes > 0 && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                      <span>
                        This customer already owes{" "}
                        <strong>{formatPrice(customerOwes)}</strong>.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0"
                        onClick={() => openCollectDebt(customerPhone.trim())}
                      >
                        Collect
                      </Button>
                    </div>
                  )}
                  {isPartPayment && (
                    <p className="text-xs text-muted-foreground">
                      Name or phone is required so this balance appears in your credit book.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Payment Section */}
            <div className="space-y-3">
              <h2 className="font-semibold text-sm uppercase text-muted-foreground">
                {isReturn ? "Refund" : "Payment"}
              </h2>

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
                    inputMode="decimal"
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
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm text-center">
                {error}
              </div>
            )}

            <Button
              ref={confirmButtonRef}
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
          </section>
        )}

        {!hasCart && error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm text-center">
            {error}
          </div>
        )}
      </div>

      {/* Running total — tap to jump down to payment */}
      {hasCart && !confirmVisible && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-30 p-3 bg-background/95 backdrop-blur border-t shadow-lg">
          <Button
            onClick={scrollToCheckout}
            size="lg"
            className="w-full h-14 text-base font-semibold flex items-center justify-between px-4 touch-manipulation"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="size-5" />
              {cartItemCount} {cartItemCount === 1 ? "item" : "items"}
            </span>
            <span className="flex items-center gap-2">
              {formatPrice(netTotal)}
              <span className="flex items-center opacity-75">
                · Pay <ArrowDown className="ml-1 size-4" />
              </span>
            </span>
          </Button>
        </div>
      )}

      {/* Product picker */}
      <Drawer open={showPicker} onOpenChange={setShowPicker}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle>Pick products</DrawerTitle>
            <DrawerDescription>Tap a product to add it to the cart.</DrawerDescription>
          </DrawerHeader>

          <div className="px-4 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Filter products…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="pl-10 h-11"
                autoComplete="off"
              />
            </div>
            {(categories.length > 0 ||
              (!isReturn && (lowStockProducts.length > 0 || outOfStockProducts.length > 0))) && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                <button
                  type="button"
                  onClick={() => setPickerCategory(null)}
                  className={cn(
                    "h-8 shrink-0 rounded-full border px-3 text-sm",
                    pickerCategory === null
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background"
                  )}
                >
                  All
                </button>
                {categories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPickerCategory(name)}
                    className={cn(
                      "h-8 shrink-0 rounded-full border px-3 text-sm",
                      pickerCategory === name
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background"
                    )}
                  >
                    {name}
                  </button>
                ))}
                {!isReturn &&
                  (lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
                    <button
                      type="button"
                      onClick={() => setShowLowStockOnly((value) => !value)}
                      className={cn(
                        "flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-sm",
                        showLowStockOnly
                          ? "border-warning bg-warning text-warning-foreground"
                          : "border-warning/40 bg-warning/10"
                      )}
                    >
                      <AlertTriangle className="size-3.5" />
                      Low stock
                    </button>
                  )}
              </div>
            )}
          </div>

          <div className="mt-2 flex-1 overflow-y-auto px-4 pb-2 space-y-2">
            {isLoading ? (
              [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
            ) : pickerProducts.length === 0 ? (
              <Empty className="py-8">
                <EmptyMedia>
                  <Package className="size-10 text-muted-foreground" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>
                    {products.length === 0 ? "No products available" : "No products found"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {products.length === 0
                      ? "Add products first to start selling"
                      : "Try a different filter"}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              pickerProducts.map((product) => renderProductRow(product, addToCart))
            )}
          </div>

          <DrawerFooter className="pt-2">
            <Button
              size="lg"
              className="w-full h-12 text-base font-semibold"
              onClick={() => setShowPicker(false)}
            >
              Done
              {hasCart && (
                <>
                  {" "}
                  · {cartItemCount} {cartItemCount === 1 ? "item" : "items"} ·{" "}
                  {formatPrice(cartTotal)}
                </>
              )}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <SellBarcodeScannerDialog
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScanInput}
      />

      <CollectDebtDrawer
        open={showCollectDebt}
        onOpenChange={setShowCollectDebt}
        initialQuery={collectDebtQuery}
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
        <DialogContent
          aria-describedby={undefined}
          className="receipt-print-dialog sm:max-w-md max-h-[90vh] overflow-y-auto print:shadow-none print:max-w-none print:max-h-none print:overflow-visible"
        >
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
                  {oversellProduct.quantity < 0 ? "is already" : "only has"}{" "}
                  <span className="font-semibold text-destructive">
                    {oversellProduct.quantity < 0
                      ? `oversold by ${Math.abs(oversellProduct.quantity)}`
                      : `${oversellProduct.quantity} in stock`}
                  </span>
                  . How many do you want to sell?
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
