"use client"

import { useState } from "react"
import Link from "next/link"
import { Minus, Plus, Edit } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { sendOrQueueMutation } from "@/lib/offline-sync"

interface Product {
  id: string
  name: string
  quantity: number
  unit_price: number
  low_stock_threshold: number
  category_name: string | null
  category_icon: string | null
  has_specifications: boolean
  tags: string[]
}

function formatPrice(amount: number) {
  return new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount).replace('SLL', 'NLe')
}

export function ProductCard({ 
  product, 
  onStockUpdate 
}: { 
  product: Product
  onStockUpdate?: () => void 
}) {
  const [isAdjusting, setIsAdjusting] = useState(false)
  const [localQuantity, setLocalQuantity] = useState(product.quantity)

  const isLowStock = localQuantity <= product.low_stock_threshold && localQuantity > 0
  const isOutOfStock = localQuantity === 0

  const adjustStock = async (amount: number) => {
    if (isAdjusting) return
    
    const newQty = Math.max(0, localQuantity + amount)
    setLocalQuantity(newQty)
    setIsAdjusting(true)

    try {
      const { queued, response, conflict } = await sendOrQueueMutation({
        url: `/api/products/${product.id}/adjust`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { adjustment: amount },
      })

      if (conflict) {
        setLocalQuantity(localQuantity)
        toast({
          title: "Stock conflict",
          description: "Item was updated elsewhere. Refresh before adjusting again.",
        })
        return
      }

      if (!queued && response && !response.ok) {
        setLocalQuantity(localQuantity)
        return
      }

      if (queued) {
        toast({
          title: "Adjustment queued",
          description: "Stock update will sync when connection returns.",
        })
      }
      onStockUpdate?.()
    } catch (error) {
      // Revert on error
      setLocalQuantity(localQuantity)
      console.error('Failed to adjust stock:', error)
    } finally {
      setIsAdjusting(false)
    }
  }

  return (
    <Card className={cn(
      "transition-all",
      isOutOfStock && "border-destructive/50 bg-destructive/5",
      isLowStock && "border-warning/50 bg-warning/5"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-lg leading-tight truncate">{product.name}</h3>
            {product.category_name && (
              <p className="text-sm text-muted-foreground">{product.category_name}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge
                variant={isOutOfStock ? "destructive" : isLowStock ? "secondary" : "default"}
                className={cn(
                  "text-sm font-medium",
                  !isOutOfStock && !isLowStock && "bg-primary"
                )}
              >
                {localQuantity} in stock
              </Badge>
              <span className="text-sm text-muted-foreground">
                {formatPrice(product.unit_price)} each
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {product.has_specifications && (
                <Badge variant="outline">Has Specs</Badge>
              )}
              {(product.tags || []).slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <Link href={`/dashboard/products/${product.id}/edit`}>
            <Button variant="ghost" size="icon" className="size-9 shrink-0">
              <Edit className="size-4" />
            </Button>
          </Link>
        </div>

        {/* Quick Adjust Buttons */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <span className="text-sm text-muted-foreground font-medium">Quick adjust:</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-12 rounded-full"
              onClick={() => adjustStock(-1)}
              disabled={isAdjusting || localQuantity === 0}
            >
              <Minus className="size-5" />
            </Button>
            <span className="w-12 text-center font-bold text-xl tabular-nums">
              {localQuantity}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-12 rounded-full bg-primary/10 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              onClick={() => adjustStock(1)}
              disabled={isAdjusting}
            >
              <Plus className="size-5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
