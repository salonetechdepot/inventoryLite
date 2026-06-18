"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { ArrowLeft, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { toast } from "@/hooks/use-toast"
import {
  CATEGORIES_CACHE_KEY,
  fetchWithOfflineCache,
  sendOrQueueMutation,
} from "@/lib/offline-sync"

const fetcher = fetchWithOfflineCache

interface Category {
  id: string
  name: string
  icon: string | null
  is_default: boolean
  product_count: number
}

export default function CategoriesPage() {
  const { data, isLoading, mutate } = useSWR<{ categories: Category[] }>(
    CATEGORIES_CACHE_KEY,
    fetcher
  )
  const categories = data?.categories || []

  const [newName, setNewName] = useState("")
  const [newIcon, setNewIcon] = useState("package")
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editIcon, setEditIcon] = useState("package")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const startEdit = (category: Category) => {
    setEditingId(category.id)
    setEditName(category.name)
    setEditIcon(category.icon || "package")
  }

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { queued, response } = await sendOrQueueMutation({
        url: "/api/categories",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { name: newName.trim(), icon: newIcon.trim() || "package" },
      })

      if (queued) {
        toast({
          title: "Saved offline",
          description: "Category will sync when you are back online.",
        })
        setNewName("")
        await mutate()
        return
      }

      if (!response?.ok) {
        const data = await response?.json()
        toast({
          title: "Could not create category",
          description: data?.error || "Try again.",
          variant: "destructive",
        })
        return
      }

      setNewName("")
      setNewIcon("package")
      await mutate()
      toast({ title: "Category created" })
    } finally {
      setCreating(false)
    }
  }

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return
    setSaving(true)
    try {
      const { queued, response } = await sendOrQueueMutation({
        url: `/api/categories/${editingId}`,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: { name: editName.trim(), icon: editIcon.trim() || "package" },
      })

      if (queued) {
        toast({ title: "Saved offline", description: "Changes will sync later." })
        setEditingId(null)
        await mutate()
        return
      }

      if (!response?.ok) {
        const data = await response?.json()
        toast({
          title: "Could not update",
          description: data?.error || "Try again.",
          variant: "destructive",
        })
        return
      }

      setEditingId(null)
      await mutate()
      toast({ title: "Category updated" })
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    setSaving(true)
    try {
      const { queued, response } = await sendOrQueueMutation({
        url: `/api/categories/${deleteId}`,
        method: "DELETE",
      })

      if (queued) {
        toast({ title: "Queued offline", description: "Delete will sync when online." })
        setDeleteId(null)
        await mutate()
        return
      }

      if (!response?.ok) {
        const data = await response?.json()
        toast({
          title: "Could not delete",
          description: data?.error || "Try again.",
          variant: "destructive",
        })
        return
      }

      setDeleteId(null)
      await mutate()
      toast({ title: "Category deleted" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="p-4 pb-24">
      <header className="mb-6">
        <Link
          href="/dashboard/products"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-5 mr-1" />
          Back to Products
        </Link>
        <h1 className="text-2xl font-bold">Categories</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Organize products into groups when adding or editing items.
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add category</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createCategory}>
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor="newName">Name</FieldLabel>
                <Input
                  id="newName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Beverages"
                  className="h-11"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="newIcon">Icon name</FieldLabel>
                <Input
                  id="newIcon"
                  value={newIcon}
                  onChange={(e) => setNewIcon(e.target.value)}
                  placeholder="package"
                  className="h-11"
                />
                <FieldDescription>
                  Lucide icon id: package, utensils, smartphone, shirt, home, etc.
                </FieldDescription>
              </Field>
              <Button type="submit" disabled={creating || !newName.trim()} className="w-full">
                <Plus className="mr-2 size-4" />
                {creating ? "Adding…" : "Add category"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card className="p-8 text-center">
          <FolderOpen className="size-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No categories yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {categories.map((category) => (
            <Card key={category.id}>
              <CardContent className="p-4">
                {editingId === category.id ? (
                  <FieldGroup className="gap-3">
                    <Field>
                      <FieldLabel>Name</FieldLabel>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-11"
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Icon</FieldLabel>
                      <Input
                        value={editIcon}
                        onChange={(e) => setEditIcon(e.target.value)}
                        className="h-11"
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={saveEdit}
                        disabled={saving || !editName.trim()}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </FieldGroup>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <FolderOpen className="size-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{category.name}</p>
                        {category.is_default && (
                          <Badge variant="secondary" className="text-[10px]">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {category.product_count} product
                        {category.product_count === 1 ? "" : "s"} · icon: {category.icon || "package"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(category)}
                        aria-label={`Edit ${category.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setDeleteId(category.id)}
                        aria-label={`Delete ${category.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(deleteId)} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              Products in this category will become uncategorized. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={saving}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
