"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, Package } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel, FieldDescription, FieldGroup } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImageUpload } from "@/components/image-upload"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface Category {
  id: string
  name: string
  icon: string
}

export default function NewProductPage() {
  const router = useRouter()
  const { data: categoriesData } = useSWR<{ categories: Category[] }>("/api/categories", fetcher)
  
  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [lowStockThreshold, setLowStockThreshold] = useState("5")
  const [categoryId, setCategoryId] = useState("")
  const [imageUrl, setImageUrl] = useState<string | undefined>()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const categories = categoriesData?.categories || []

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
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          quantity: parseInt(quantity) || 0,
          unitPrice: parseFloat(unitPrice) || 0,
          lowStockThreshold: parseInt(lowStockThreshold) || 5,
          categoryId: categoryId || null,
          imageUrl: imageUrl || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to add product")
        setLoading(false)
        return
      }

      router.push("/dashboard/products")
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
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
        <h1 className="text-2xl font-bold">Add New Product</h1>
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
                <FieldLabel className="text-base">Product Photo</FieldLabel>
                <ImageUpload value={imageUrl} onChange={setImageUrl} />
                <FieldDescription>Take a photo or upload an image</FieldDescription>
              </Field>

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
                <FieldDescription>What are you selling?</FieldDescription>
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
                  <FieldDescription>How many do you have?</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="unitPrice" className="text-base">Price (NLe)</FieldLabel>
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
                  <FieldDescription>Price per item</FieldDescription>
                </Field>
              </div>

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
                <FieldDescription>Alert me when stock falls below this number</FieldDescription>
              </Field>

              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-lg font-semibold"
                disabled={loading}
              >
                {loading ? "Adding Product..." : "Add Product"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
