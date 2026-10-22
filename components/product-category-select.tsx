"use client"

import Link from "next/link"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type CategoryChoice = {
  id: string
  name: string
  subcategories?: Array<{ id: string; name: string }>
}

export function ProductCategorySelect({
  categories,
  categoryId,
  subCategoryId,
  onCategoryChange,
  onSubCategoryChange,
}: {
  categories: CategoryChoice[]
  categoryId: string
  subCategoryId: string
  onCategoryChange: (categoryId: string) => void
  onSubCategoryChange: (subCategoryId: string) => void
}) {
  const selected = categories.find((category) => category.id === categoryId)
  const subcategories = selected?.subcategories ?? []

  return (
    <>
      <Field>
        <FieldLabel htmlFor="category" className="text-base">Category</FieldLabel>
        <Select
          value={categoryId || undefined}
          onValueChange={(value) => {
            onCategoryChange(value)
            onSubCategoryChange("")
          }}
        >
          <SelectTrigger id="category" className="h-12 w-full text-base">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categories.length === 0 && (
          <FieldDescription>
            No categories yet. Add them on the{" "}
            <Link href="/dashboard/categories" className="underline">
              Categories
            </Link>{" "}
            page.
          </FieldDescription>
        )}
      </Field>

      {categoryId && subcategories.length > 0 && (
        <Field>
          <FieldLabel htmlFor="subcategory" className="text-base">Subcategory</FieldLabel>
          <Select
            value={subCategoryId || undefined}
            onValueChange={onSubCategoryChange}
          >
            <SelectTrigger id="subcategory" className="h-12 w-full text-base">
              <SelectValue placeholder="Select a subcategory" />
            </SelectTrigger>
            <SelectContent>
              {subcategories.map((subcategory) => (
                <SelectItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>The type under this category.</FieldDescription>
        </Field>
      )}
    </>
  )
}
