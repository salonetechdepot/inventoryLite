"use client"

import { useState, useRef, useEffect } from "react"
import useSWR from "swr"
import { Search, ShoppingCart, Check, Minus, Plus, Package, Trash2, ScanLine, X, Printer, AlertTriangle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { fetchWithOfflineCache, sendOrQueueMutation } from "@/lib/offline-sync"

const fetcher = fetchWithOfflineCache

function formatPrice(amount: number) {
  return new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount).replace('SLL', 'NLe')
}

interface Product {
  id: string
  name: string
  scan_code: string | null
  tags: string[]
  has_specifications: boolean
  quantity: number
  unit_price: number
  category_name: string | null
  image_url: string | null
}

interface CartItem {
  product: Product
  quantity: number
}

interface SaleRecord {
  type: "sale" | "return"
  productName: string
  quantity: number
  unitPrice: number
  total: number
}

export default function SellPage() {
  const [search, setSearch] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [showReceipt, setShowReceipt] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [lastSale, setLastSale] = useState<{
    items: SaleRecord[]
    total: number
    date: Date
    customerName?: string
    customerPhone?: string
    discountAmount: number
    amountPaid: number
    amountDue: number
    changeGiven: number
    isPartPayment: boolean
  } | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerError, setScannerError] = useState("")
  const [showOversellConfirm, setShowOversellConfirm] = useState(false)
  const [oversellProduct, setOversellProduct] = useState<Product | null>(null)
  const [oversellQty, setOversellQty] = useState(1)
  const [transactionType, setTransactionType] = useState<"sale" | "return">("sale")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [discountAmount, setDiscountAmount] = useState("0")
  const [amountPaid, setAmountPaid] = useState("0")
  const [isPartPayment, setIsPartPayment] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const { data, isLoading, mutate } = useSWR<{ products: Product[] }>("/api/products", fetcher)

  const products = data?.products || []
  
  // Show all products (including out of stock) so sellers can oversell if needed
  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  )

  // Calculate cart total
  const cartTotal = cart.reduce((sum, item) => sum + (item.quantity * item.product.unit_price), 0)
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const discountValue = Math.max(0, Number(discountAmount) || 0)
  const netTotal = Math.max(0, cartTotal - discountValue)
  const amountPaidValue = Math.max(0, Number(amountPaid) || 0)
  const negotiatedShortfall = Math.max(0, netTotal - amountPaidValue)
  const amountDue = isPartPayment ? negotiatedShortfall : 0
  const changeGiven = Math.max(0, amountPaidValue - netTotal)

  // Get remaining stock for a product (accounting for cart)
  const getRemainingStock = (product: Product) => {
    const cartItem = cart.find((item) => item.product.id === product.id)
    return product.quantity - (cartItem?.quantity || 0)
  }

  const addToCart = (product: Product, forceQuantity?: number) => {
    const quantity = forceQuantity || 1
    const remaining = getRemainingStock(product)
    
    // If trying to add more than available and not forced, show confirmation for sales only.
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
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }
      return [...prev, { product, quantity }]
    })
  }

  const confirmOversell = () => {
    if (oversellProduct) {
      setCart((prev) => {
        const existing = prev.find((item) => item.product.id === oversellProduct.id)
        if (existing) {
          return prev.map((item) =>
            item.product.id === oversellProduct.id
              ? { ...item, quantity: item.quantity + oversellQty }
              : item
          )
        }
        return [...prev, { product: oversellProduct, quantity: oversellQty }]
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
    
    // Check if going over stock
    if (transactionType === "sale" && newQty > cartItem.product.quantity && delta > 0 && !force) {
      setOversellProduct(cartItem.product)
      setOversellQty(1)
      setShowOversellConfirm(true)
      return
    }
    
    setCart((prev) => {
      return prev.map((item) => {
        if (item.product.id === productId) {
          return { ...item, quantity: newQty }
        }
        return item
      })
    })
  }

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const clearCart = () => {
    setCart([])
    setDiscountAmount("0")
    setAmountPaid("0")
    setIsPartPayment(false)
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return
    if (transactionType === "sale" && amountPaidValue <= 0) {
      setError("Enter the amount paid before checkout.")
      return
    }
    setLoading(true)
    setError("")

    try {
      const payload = {
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        type: transactionType,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        discountAmount: discountValue,
        amountPaid: amountPaidValue,
        isPartPayment,
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

      // Prepare receipt data
      setLastSale({
        items: cart.map((item) => ({
          type: transactionType,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.unit_price,
          total: item.quantity * item.product.unit_price,
        })),
        total: netTotal,
        date: new Date(),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        discountAmount: discountValue,
        amountPaid: amountPaidValue,
        amountDue,
        changeGiven,
        isPartPayment
      })
      setShowReceipt(true)
      setCart([])
      setCustomerName("")
      setCustomerPhone("")
      setDiscountAmount("0")
      setAmountPaid("0")
      setIsPartPayment(false)
      mutate()

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

  // Scanner functions
  const startScanner = async () => {
    setScannerError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setShowScanner(true)
    } catch {
      setScannerError("Could not access camera. Please allow camera permission.")
    }
  }

  const stopScanner = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setShowScanner(false)
  }

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Scan detection tries exact scan code first, then broad fallback matches.
  const handleScanInput = (code: string) => {
    const trimmedCode = code.trim().toLowerCase()
    if (!trimmedCode) return
    
    const matchedProduct = products.find(
      (p) => p.scan_code?.toLowerCase() === trimmedCode
    ) || products.find(
      (p) => p.name.toLowerCase().includes(trimmedCode) || p.id.includes(trimmedCode)
    )
    
    if (matchedProduct) {
      addToCart(matchedProduct)
      setSearch("")
    }
  }

  const printReceipt = () => {
    window.print()
  }

  return (
    <main className="p-4 pb-32">
      {/* Header */}
      <header className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Make a Sale</h1>
          <Button
            variant="outline"
            size="icon"
            className="size-12"
            onClick={startScanner}
          >
            <ScanLine className="size-6" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <Button
            type="button"
            variant={transactionType === "sale" ? "default" : "outline"}
            onClick={() => setTransactionType("sale")}
            className="h-11"
          >
            Sale
          </Button>
          <Button
            type="button"
            variant={transactionType === "return" ? "default" : "outline"}
            onClick={() => setTransactionType("return")}
            className="h-11"
          >
            Return
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Input
            type="text"
            placeholder="Customer name (optional)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="h-11"
          />
          <Input
            type="text"
            placeholder="Customer phone (optional)"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Discount (optional)"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            className="h-11"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount paid"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            className="h-11"
          />
          <Button
            type="button"
            variant={isPartPayment ? "default" : "outline"}
            onClick={() => setIsPartPayment((prev) => !prev)}
            className="h-11"
          >
            {isPartPayment ? "Part Payment On" : "Enable Part Payment"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          If part payment is off, amount paid is treated as the final negotiated sale amount.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-4 text-xs sm:text-sm">
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Net Total</p>
            <p className="font-semibold">{formatPrice(netTotal)}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Due</p>
            <p className={cn("font-semibold", amountDue > 0 && "text-warning")}>{formatPrice(amountDue)}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Change</p>
            <p className={cn("font-semibold", changeGiven > 0 && "text-primary")}>{formatPrice(changeGiven)}</p>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search or scan products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleScanInput(search)
              }
            }}
            className="pl-10 h-12 text-base"
          />
        </div>
      </header>

      {/* Cart Summary (if items) */}
      {cart.length > 0 && (
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="size-5 text-primary" />
                <span className="font-semibold">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''} in cart</span>
              </div>
              <Button variant="ghost" size="sm" onClick={clearCart} className="text-destructive hover:text-destructive">
                <Trash2 className="size-4 mr-1" />
                Clear
              </Button>
            </div>
            
            {/* Cart Items */}
            <div className="flex flex-col gap-2 mb-3">
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center justify-between bg-background rounded-lg p-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(item.product.unit_price)} x {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => updateCartQuantity(item.product.id, -1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-8 text-center font-semibold tabular-nums">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => updateCartQuantity(item.product.id, 1)}
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
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="font-semibold">Total:</span>
              <span className="text-xl font-bold text-primary">{formatPrice(cartTotal)}</span>
            </div>
          </CardContent>
        </Card>
      )}

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
              {search ? "No products found" : "No products available to sell"}
            </EmptyTitle>
            <EmptyDescription>
              {search
                ? "Try a different search term"
                : "Add products first or restock items that are out of stock"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredProducts.map((product) => {
            const remaining = getRemainingStock(product)
            const inCart = cart.find((item) => item.product.id === product.id)
            
            return (
              <Card 
                key={product.id}
                className={cn(
                  "cursor-pointer transition-all active:scale-[0.98]",
                  inCart && "ring-2 ring-primary bg-primary/5"
                )}
                onClick={() => addToCart(product)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Product Image */}
                    <div className="size-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <Package className="size-6 text-muted-foreground" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{product.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatPrice(product.unit_price)} each
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {product.has_specifications && (
                          <Badge variant="outline" className="text-[10px]">Specs</Badge>
                        )}
                        {(product.tags || []).slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {inCart && (
                        <Badge variant="default" className="bg-primary">
                          {inCart.quantity} added
                        </Badge>
                      )}
                      <Badge 
                        variant={remaining <= 0 ? "destructive" : "secondary"} 
                        className="shrink-0"
                      >
                        {remaining} left
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Floating Checkout Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
          <Button 
            onClick={handleCheckout} 
            disabled={loading}
            className="w-full h-14 text-lg font-semibold shadow-lg"
            size="lg"
          >
            <ShoppingCart className="mr-2 size-6" />
            {loading
              ? "Processing..."
              : `${transactionType === "sale" ? "Checkout Sale" : "Process Return"} - ${formatPrice(netTotal)}`}
          </Button>
        </div>
      )}

      {/* Scanner Dialog */}
      <Dialog open={showScanner} onOpenChange={(open) => !open && stopScanner()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Barcode / QR Code</DialogTitle>
            <DialogDescription>
              Point your camera at the barcode or QR code
            </DialogDescription>
          </DialogHeader>
          
          {scannerError ? (
            <div className="rounded-lg bg-destructive/10 p-4 text-destructive text-center">
              {scannerError}
            </div>
          ) : (
            <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="size-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3/4 h-1/4 border-2 border-primary rounded-lg" />
              </div>
            </div>
          )}
          
          <div className="text-center text-sm text-muted-foreground">
            Or manually enter product code:
          </div>
          <Input
            type="text"
            placeholder="Enter barcode or product name..."
            className="h-12"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const input = e.currentTarget.value
                handleScanInput(input)
                e.currentTarget.value = ""
                stopScanner()
              }
            }}
          />
          
          <DialogFooter>
            <Button variant="outline" onClick={stopScanner} className="w-full">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="sm:max-w-md print:shadow-none">
          <div className="text-center mb-4 print:mb-2">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary print:hidden">
              <Check className="size-8 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-bold print:text-lg">
              {lastSale?.items[0]?.type === "return" ? "Return Complete!" : "Sale Complete!"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {lastSale?.date.toLocaleDateString('en-GB', { 
                day: 'numeric', 
                month: 'short', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>

          {(lastSale?.customerName || lastSale?.customerPhone) && (
            <div className="border rounded-lg p-3 text-sm">
              <p className="font-semibold mb-1">Customer</p>
              {lastSale?.customerName && <p>Name: {lastSale.customerName}</p>}
              {lastSale?.customerPhone && <p>Phone: {lastSale.customerPhone}</p>}
            </div>
          )}
          
          {/* Receipt Items */}
          <div className="border rounded-lg divide-y">
            <div className="p-3 bg-muted/50 font-semibold text-sm flex justify-between">
              <span>Item</span>
              <span>Amount</span>
            </div>
            {lastSale?.items.map((item, index) => (
              <div key={index} className="p-3 flex justify-between text-sm">
                <div>
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-muted-foreground">
                    {item.quantity} x {formatPrice(item.unitPrice)}
                  </p>
                </div>
                <span className="font-semibold">{formatPrice(item.total)}</span>
              </div>
            ))}
            <div className="p-3 flex justify-between font-bold bg-primary/5">
              <span>TOTAL</span>
              <span className="text-primary text-lg">{formatPrice(lastSale?.total || 0)}</span>
            </div>
            <div className="p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span>Discount</span>
                <span>{formatPrice(lastSale?.discountAmount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount Paid</span>
                <span>{formatPrice(lastSale?.amountPaid || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Balance Due</span>
                <span>{formatPrice(lastSale?.amountDue || 0)}</span>
              </div>
              {!lastSale?.isPartPayment && (lastSale?.amountDue || 0) === 0 && (lastSale?.amountPaid || 0) < (lastSale?.total || 0) && (
                <div className="flex justify-between">
                  <span>Negotiated Shortfall</span>
                  <span>{formatPrice((lastSale?.total || 0) - (lastSale?.amountPaid || 0))}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Change</span>
                <span>{formatPrice(lastSale?.changeGiven || 0)}</span>
              </div>
              {(lastSale?.isPartPayment || (lastSale?.amountDue || 0) > 0) && (
                <div className="flex justify-between font-semibold text-warning">
                  <span>Status</span>
                  <span>Part Payment</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4 print:hidden">
            <Button variant="outline" onClick={printReceipt} className="flex-1">
              <Printer className="mr-2 size-4" />
              Print
            </Button>
            <Button onClick={() => setShowReceipt(false)} className="flex-1">
              Done
            </Button>
          </div>
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
                  <span className="font-semibold text-foreground">{oversellProduct.name}</span>
                  {" "}only has{" "}
                  <span className="font-semibold text-destructive">{oversellProduct.quantity}</span>
                  {" "}in stock. How many do you want to sell?
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
            <span className="text-3xl font-bold w-16 text-center tabular-nums">{oversellQty}</span>
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
