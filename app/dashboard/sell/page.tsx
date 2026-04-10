"use client"

import { useState } from "react"
import useSWR from "swr"
import { Search, ShoppingCart, Check, Minus, Plus, Package } from "lucide-react"
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
}

export default function SellPage() {
  const [search, setSearch] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [sellQuantity, setSellQuantity] = useState(1)
  const [showSuccess, setShowSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [lastSale, setLastSale] = useState<{ name: string; qty: number; total: number } | null>(null)

  const { data, isLoading, mutate } = useSWR<{ products: Product[] }>("/api/products", fetcher)

  const products = data?.products || []
  const availableProducts = products.filter((p) => p.quantity > 0)
  
  const filteredProducts = availableProducts.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product)
    setSellQuantity(1)
    setError("")
  }

  const handleSell = async () => {
    if (!selectedProduct || sellQuantity <= 0) return
    
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          quantity: sellQuantity,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to record sale")
        setLoading(false)
        return
      }

      setLastSale({
        name: selectedProduct.name,
        qty: sellQuantity,
        total: sellQuantity * selectedProduct.unit_price,
      })
      setShowSuccess(true)
      setSelectedProduct(null)
      setSellQuantity(1)
      mutate()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const totalAmount = selectedProduct ? sellQuantity * selectedProduct.unit_price : 0

  return (
    <main className="p-4">
      {/* Header */}
      <header className="mb-4">
        <h1 className="text-2xl font-bold mb-4">Make a Sale</h1>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search products to sell..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12 text-base"
          />
        </div>
      </header>

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
          {filteredProducts.map((product) => (
            <Card 
              key={product.id}
              className={cn(
                "cursor-pointer transition-all active:scale-[0.98]",
                selectedProduct?.id === product.id && "ring-2 ring-primary"
              )}
              onClick={() => handleSelectProduct(product)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{product.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {formatPrice(product.unit_price)} each
                    </p>
                  </div>
                  <Badge variant="secondary" className="ml-2 shrink-0">
                    {product.quantity} left
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Sale Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Sell {selectedProduct?.name}</DialogTitle>
            <DialogDescription>
              {formatPrice(selectedProduct?.unit_price || 0)} each - {selectedProduct?.quantity} in stock
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm text-center">
              {error}
            </div>
          )}

          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-3 text-center">How many are you selling?</p>
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="size-14 rounded-full text-xl"
                onClick={() => setSellQuantity(Math.max(1, sellQuantity - 1))}
                disabled={sellQuantity <= 1}
              >
                <Minus className="size-6" />
              </Button>
              <span className="w-16 text-center font-bold text-4xl tabular-nums">
                {sellQuantity}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-14 rounded-full text-xl bg-primary/10 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                onClick={() => setSellQuantity(Math.min(selectedProduct?.quantity || 1, sellQuantity + 1))}
                disabled={sellQuantity >= (selectedProduct?.quantity || 1)}
              >
                <Plus className="size-6" />
              </Button>
            </div>
          </div>

          <div className="bg-muted rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="text-3xl font-bold text-primary">{formatPrice(totalAmount)}</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setSelectedProduct(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSell} 
              disabled={loading}
              className="flex-1 h-12"
            >
              <ShoppingCart className="mr-2 size-5" />
              {loading ? "Recording..." : "Confirm Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-sm text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary">
            <Check className="size-8 text-primary-foreground" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl text-center">Sale Recorded!</DialogTitle>
            <DialogDescription className="text-center">
              Sold {lastSale?.qty} x {lastSale?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-xl p-4 my-4">
            <p className="text-sm text-muted-foreground">Total Received</p>
            <p className="text-3xl font-bold text-primary">{formatPrice(lastSale?.total || 0)}</p>
          </div>
          <Button onClick={() => setShowSuccess(false)} className="w-full h-12">
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  )
}
