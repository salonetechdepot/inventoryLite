"use client"

import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import type { ProductSpecifications } from "@/lib/product-specifications"

export function ProductSpecFields({
  value,
  onChange,
}: {
  value: ProductSpecifications
  onChange: (next: ProductSpecifications) => void
}) {
  const set = (key: keyof ProductSpecifications, v: string) => {
    onChange({ ...value, [key]: v })
  }

  return (
    <div className="grid grid-cols-2 gap-3 border rounded-lg p-3 bg-muted/30">
      <Field>
        <FieldLabel className="text-sm">Brand</FieldLabel>
        <Input
          value={value.brand ?? ""}
          onChange={(e) => set("brand", e.target.value)}
          className="h-10"
        />
      </Field>
      <Field>
        <FieldLabel className="text-sm">Model</FieldLabel>
        <Input
          value={value.model ?? ""}
          onChange={(e) => set("model", e.target.value)}
          className="h-10"
        />
      </Field>
      <Field>
        <FieldLabel className="text-sm">Size</FieldLabel>
        <Input
          value={value.size ?? ""}
          onChange={(e) => set("size", e.target.value)}
          className="h-10"
        />
      </Field>
      <Field>
        <FieldLabel className="text-sm">Color</FieldLabel>
        <Input
          value={value.color ?? ""}
          onChange={(e) => set("color", e.target.value)}
          className="h-10"
        />
      </Field>
      <Field className="col-span-2">
        <FieldLabel className="text-sm">Notes</FieldLabel>
        <Input
          value={value.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          className="h-10"
          placeholder="Other details"
        />
      </Field>
    </div>
  )
}
