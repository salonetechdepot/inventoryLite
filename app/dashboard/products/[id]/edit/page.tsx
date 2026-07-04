"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, Package, Trash2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel, FieldDescription, FieldGroup } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { ProductSpecFields } from "@/components/product-spec-fields"
import type { ProductSpecifications } from "@/lib/product-specifications"
import { toast } from "@/hooks/use-toast"
import {
  CATEGORIES_CACHE_KEY,
  fetchWithOfflineCache,
  sendOrQueueMutation,
} from "@/lib/offline-sync"

const fetcher = fetchWithOfflineCache

interface Product {
  id: string
  name: string
  quantity: number
  unit_price: number
  cost_price: number | null
  low_stock_threshold: number
  category_id: string | null
  scan_code: string | null
  tags: string[]
  has_specifications: boolean
  specifications: ProductSpecifications | null
}

interface Category {
  id: string
  name: string
  icon: string
}

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const productId = params.id as string
  
  const { data: productData, isLoading: productLoading } = useSWR<{ product: Product }>(
    `/api/products/${productId}`,
    fetcher
  )
  const { data: categoriesData } = useSWR<{ categories: Category[] }>(
    CATEGORIES_CACHE_KEY,
    fetcher
  )
  
  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [specifications, setSpecifications] = useState<ProductSpecifications>({})
  const [lowStockThreshold, setLowStockThreshold] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [scanCode, setScanCode] = useState("")
  const [tagsInput, setTagsInput] = useState("")
  const [hasSpecifications, setHasSpecifications] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const categories = categoriesData?.categories || []

  useEffect(() => {
    if (productData?.product) {
      const p = productData.product
      setName(p.name)
      setQuantity(p.quantity.toString())
      setUnitPrice(p.unit_price.toString())
      setCostPrice(p.cost_price != null ? p.cost_price.toString() : "")
      setSpecifications(p.specifications ?? {})
      setLowStockThreshold(p.low_stock_threshold.toString())
      setCategoryId(p.category_id || "")
      setScanCode(p.scan_code || "")
      setTagsInput((p.tags || []).join(", "))
      setHasSpecifications(Boolean(p.has_specifications))
    }
  }, [productData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    if (!name.trim()) {
      setError("Please enter a product name")
      setLoading(false)
      return
    }

    try {
      const payload = {
        name: name.trim(),
        quantity: parseInt(quantity) || 0,
        unitPrice: parseFloat(unitPrice) || 0,
        costPrice: costPrice.trim() ? parseFloat(costPrice) : null,
        lowStockThreshold: parseInt(lowStockThreshold) || 5,
        categoryId: categoryId || null,
        scanCode: scanCode.trim() || null,
        tags: tagsInput.split(",").map((tag) => tag.trim()).filter(Boolean),
        hasSpecifications,
        specifications: hasSpecifications ? specifications : null,
      }

      const { queued, response, conflict } = await sendOrQueueMutation({
        url: `/api/products/${productId}`,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })

      if (queued) {
        toast({
          title: "Saved offline",
          description: "Product changes will sync when you are back online.",
        })
        router.push("/dashboard/products")
        return
      }

      if (conflict) {
        setError("This product has changed on the server. Refresh and merge your changes.")
        setLoading(false)
        return
      }

      if (!response?.ok) {
        const data = await response?.json()
        setError(data?.error || "Failed to update product")
        setLoading(false)
        return
      }

      router.push("/dashboard/products")
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const { queued, response } = await sendOrQueueMutation({
        url: `/api/products/${productId}`,
        method: "DELETE",
      })

      if (queued) {
        toast({
          title: "Delete queued",
          description: "Product deletion will sync when online.",
        })
        router.push("/dashboard/products")
        return
      }

      if (!response?.ok) {
        setError("Failed to delete product")
        setDeleting(false)
        return
      }

      router.push("/dashboard/products")
    } catch {
      setError("Failed to delete product")
      setDeleting(false)
    }
  }

  if (productLoading) {
    return (
      <main className="p-4">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </main>
    )
  }

  if (!productData?.product) {
    return (
      <main className="p-4">
        <Link
          href="/dashboard/products"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-5 mr-1" />
          Back to Products
        </Link>
        <p className="text-muted-foreground">
          Product not found in saved data. Open Products while online, then try again offline.
        </p>
      </main>
    )
  }

  return (
    <main className="p-4">
      {/* Header */}
      <header className="mb-6">
        <Link 
          href="/dashboard/products" 
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-5 mr-1" />
          Back to Products
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Edit Product</h1>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon" className="size-10">
                <Trash2 className="size-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this product?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the product from your inventory.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Package className="size-5" />
            Product Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {error && (
                <div className="rounded-lg bg-destructive/10 p-4 text-destructive text-sm text-center">
                  {error}
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="name" className="text-base">Product Name *</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g. Rice (50kg bag)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-12 text-base"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="category" className="text-base">Category</FieldLabel>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="scanCode" className="text-base">Scan Code</FieldLabel>
                <Input
                  id="scanCode"
                  type="text"
                  placeholder="Barcode or SKU code"
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  className="h-12 text-base"
                />
                <FieldDescription>Used for quick scan lookup while selling</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="tags" className="text-base">Tags</FieldLabel>
                <Input
                  id="tags"
                  type="text"
                  placeholder="e.g. electronics, fragile"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className="h-12 text-base"
                />
                <FieldDescription>Separate tags with commas</FieldDescription>
              </Field>

              <Field>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="hasSpecifications"
                    checked={hasSpecifications}
                    onCheckedChange={(checked) => setHasSpecifications(Boolean(checked))}
                  />
                  <FieldLabel htmlFor="hasSpecifications" className="text-base cursor-pointer">
                    Product has specifications
                  </FieldLabel>
                </div>
                <FieldDescription>
                  Use this to differentiate products that require spec selection/details
                </FieldDescription>
                {hasSpecifications && (
                  <ProductSpecFields value={specifications} onChange={setSpecifications} />
                )}
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="quantity" className="text-base">Quantity</FieldLabel>
                  <Input
                    id="quantity"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="h-12 text-base"
                  />
                  <FieldDescription>Current stock</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="unitPrice" className="text-base">Sell price (NLe)</FieldLabel>
                  <Input
                    id="unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="h-12 text-base"
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="costPrice" className="text-base">Cost price (NLe)</FieldLabel>
                <Input
                  id="costPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional — for profit in reports"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="h-12 text-base"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="lowStock" className="text-base">Low Stock Alert</FieldLabel>
                <Input
                  id="lowStock"
                  type="number"
                  min="0"
                  placeholder="5"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  className="h-12 text-base"
                />
                <FieldDescription>Alert when stock falls below this</FieldDescription>
              </Field>

              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-lg font-semibold"
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
