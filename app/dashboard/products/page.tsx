"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Plus, Search, Package, FolderOpen } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductCard } from "@/components/product-card"
import {
  ProductLabelDialog,
  type ProductLabelProduct,
} from "@/components/product-label-dialog"
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent, EmptyHeader } from "@/components/ui/empty"
import { fetchWithOfflineCache } from "@/lib/offline-sync"

const fetcher = fetchWithOfflineCache

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
  scan_code: string | null
}

export default function ProductsPage() {
  const [search, setSearch] = useState("")
  const [labelProduct, setLabelProduct] = useState<ProductLabelProduct | null>(null)
  const { data, isLoading, mutate } = useSWR<{ products: Product[] }>(
    "/api/products",
    fetcher
  )

  const products = data?.products || []

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleStockUpdate = () => {
    mutate()
  }

  const openLabel = (product: Product) => {
    if (!product.scan_code?.trim()) return
    setLabelProduct({
      name: product.name,
      unit_price: product.unit_price,
      category_name: product.category_name,
      scan_code: product.scan_code.trim(),
    })
  }

  return (
    <main className="p-4">
      <header className="mb-4">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h1 className="text-2xl font-bold">My Products</h1>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="lg" className="h-12">
              <Link href="/dashboard/categories">
                <FolderOpen className="mr-1 size-5" />
                Categories
              </Link>
            </Button>
            <Button asChild size="lg" className="h-12">
              <Link href="/dashboard/products/new">
                <Plus className="mr-1 size-5" />
                Add
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12 text-base"
          />
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package />
            </EmptyMedia>
            <EmptyTitle>No products found</EmptyTitle>
            <EmptyDescription>
              {search ? "Try a different search term." : "Add your first product to get started."}
            </EmptyDescription>
          </EmptyHeader>
          {!search && (
            <EmptyContent>
              <Button asChild>
                <Link href="/dashboard/products/new">Add Product</Link>
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onStockUpdate={handleStockUpdate}
              onPrintLabel={
                product.scan_code?.trim()
                  ? () => openLabel(product)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <ProductLabelDialog
        product={labelProduct}
        open={Boolean(labelProduct)}
        onOpenChange={(open) => {
          if (!open) setLabelProduct(null)
        }}
      />
    </main>
  )
}
