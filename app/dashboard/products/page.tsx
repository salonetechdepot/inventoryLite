"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Plus, Search, Package } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductCard } from "@/components/product-card"
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent, EmptyHeader } from "@/components/ui/empty"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface Product {
  id: string
  name: string
  quantity: number
  unit_price: number
  low_stock_threshold: number
  image_url: string | null
  category_name: string | null
  category_icon: string | null
}

export default function ProductsPage() {
  const [search, setSearch] = useState("")
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

  return (
    <main className="p-4">
      {/* Header */}
      <header className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">My Products</h1>
          <Button asChild size="lg" className="h-12">
            <Link href="/dashboard/products/new">
              <Plus className="mr-1 size-5" />
              Add
            </Link>
          </Button>
        </div>
        
        {/* Search */}
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

      {/* Products List */}
      {isLoading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <Empty className="mt-12">
          <EmptyMedia>
            <Package className="size-12 text-muted-foreground" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {search ? "No products found" : "No products yet"}
            </EmptyTitle>
            <EmptyDescription>
              {search
                ? "Try a different search term"
                : "Add your first product to start tracking inventory"}
            </EmptyDescription>
          </EmptyHeader>
          {!search && (
            <EmptyContent>
              <Button asChild size="lg">
                <Link href="/dashboard/products/new">
                  <Plus className="mr-2 size-5" />
                  Add First Product
                </Link>
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredProducts.map((product) => (
            <ProductCard 
              key={product.id} 
              product={product} 
              onStockUpdate={handleStockUpdate}
            />
          ))}
        </div>
      )}
    </main>
  )
}
