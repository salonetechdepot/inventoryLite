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

const fetcher = (url: string) => fetch(url).then((res) => res.json())

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
  const [lastSale, setLastSale] = useState<{ items: SaleRecord[]; total: number; date: Date } | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerError, setScannerError] = useState("")
  const [showOversellConfirm, setShowOversellConfirm] = useState(false)
  const [oversellProduct, setOversellProduct] = useState<Product | null>(null)
  const [oversellQty, setOversellQty] = useState(1)
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

  // Get remaining stock for a product (accounting for cart)
  const getRemainingStock = (product: Product) => {
    const cartItem = cart.find((item) => item.product.id === product.id)
    return product.quantity - (cartItem?.quantity || 0)
  }

  const addToCart = (product: Product, forceQuantity?: number) => {
    const quantity = forceQuantity || 1
    const remaining = getRemainingStock(product)
    
    // If trying to add more than available and not forced, show confirmation
    if (remaining <= 0 && !forceQuantity) {
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
    if (newQty > cartItem.product.quantity && delta > 0 && !force) {
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
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return
    
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/sales/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to record sales")
        setLoading(false)
        return
      }

      // Prepare receipt data
      setLastSale({
        items: cart.map((item) => ({
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.unit_price,
          total: item.quantity * item.product.unit_price,
        })),
        total: cartTotal,
        date: new Date(),
      })
      setShowReceipt(true)
      setCart([])
      mutate()
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

  // Simple barcode detection (searches for product name containing scanned code)
  const handleScanInput = (code: string) => {
    const trimmedCode = code.trim().toLowerCase()
    if (!trimmedCode) return
    
    const matchedProduct = products.find(
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
            {loading ? "Processing..." : `Checkout - ${formatPrice(cartTotal)}`}
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
            <h2 className="text-xl font-bold print:text-lg">Sale Complete!</h2>
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
