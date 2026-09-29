"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  User,
  LogOut,
  Users,
  BarChart3,
  ChevronRight,
  Paintbrush,
  AlertTriangle,
  BookUser,
  Wallet,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ImageUpload } from "@/components/image-upload"
import { useAuth } from "@/hooks/use-auth"
import { getConflictCount } from "@/lib/offline-sync"

export default function AccountPage() {
  const { user, logout, mutate, sessionExpiresAt } = useAuth()
  const [isOffline, setIsOffline] = useState(false)
  const [themeColor, setThemeColor] = useState(user?.theme_color || "#2E8B57")
  const [shopLogoUrl, setShopLogoUrl] = useState<string | undefined>(
    user?.shop_logo_url || undefined
  )
  const [saving, setSaving] = useState(false)
  const [settingsError, setSettingsError] = useState("")
  const [conflictCount, setConflictCount] = useState(0)

  useEffect(() => {
    void getConflictCount().then(setConflictCount)
  }, [])

  useEffect(() => {
    const sync = () => setIsOffline(!navigator.onLine)
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    setThemeColor(user.theme_color || "#2E8B57")
    setShopLogoUrl(user.shop_logo_url || undefined)
  }, [user])

  const handleLogout = async () => {
    await logout()
  }

  const saveSettings = async () => {
    setSaving(true)
    setSettingsError("")
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeColor, shopLogoUrl: shopLogoUrl || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSettingsError(data.error || "Failed to save settings")
        return
      }
      await mutate({ user: data.user, sessionExpiresAt: sessionExpiresAt ?? null }, false)
    } catch {
      setSettingsError("Could not save settings. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">My Account</h1>
      </header>

      {isOffline ? (
        <Card className="mb-4 border-warning/30 bg-warning/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">You&apos;re offline</p>
            <p className="mt-1">
              You can open tools below and sign out. Branding changes save when you&apos;re back
              online.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              {user?.shop_logo_url ? (
                <img
                  src={user.shop_logo_url}
                  alt={user?.business_name || "Shop logo"}
                  className="size-full object-cover"
                />
              ) : (
                <User className="size-8 text-primary" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{user?.business_name || "My Business"}</h2>
              {user?.phone_e164 ? (
                <p className="text-sm text-muted-foreground">{user.phone_e164}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Add-ons</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <AddOnItem
            icon={Users}
            title="Staff Management"
            description="Add workers and track who sells what"
            comingSoon
          />
          <Separator />
          {conflictCount > 0 && (
            <>
              <Link
                href="/dashboard/sync-conflicts"
                className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="size-10 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-5 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">Sync conflicts</h3>
                    <Badge variant="secondary">{conflictCount}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Offline changes need review
                  </p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground shrink-0" />
              </Link>
              <Separator />
            </>
          )}
          <Link
            href="/dashboard/day-close"
            className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Wallet className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium">End-of-day close</h3>
              <p className="text-sm text-muted-foreground">
                Count cash and reconcile today&apos;s payments
              </p>
            </div>
            <ChevronRight className="size-5 text-muted-foreground shrink-0" />
          </Link>
          <Separator />
          <Link
            href="/dashboard/debtors"
            className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="size-10 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
              <BookUser className="size-5 text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium">Credit book</h3>
              <p className="text-sm text-muted-foreground">
                Customers who owe balances
              </p>
            </div>
            <ChevronRight className="size-5 text-muted-foreground shrink-0" />
          </Link>
          <Separator />
          <Link
            href="/dashboard/analytics"
            className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="size-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <BarChart3 className="size-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium">Reports & Analytics</h3>
              <p className="text-sm text-muted-foreground">
                Sales, profit estimate, and trends
              </p>
            </div>
            <ChevronRight className="size-5 text-muted-foreground shrink-0" />
          </Link>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Paintbrush className="size-4" />
            Shop branding
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <FieldGroup>
            {settingsError ? (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {settingsError}
              </div>
            ) : null}
            <Field>
              <FieldLabel>Theme color</FieldLabel>
              <Input
                type="color"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="h-12 w-24 p-1"
              />
            </Field>
            <Field>
              <FieldLabel>Shop logo</FieldLabel>
              <ImageUpload
                value={shopLogoUrl}
                onChange={setShopLogoUrl}
                folder="branding"
              />
              <FieldDescription>Shown on receipts and your account.</FieldDescription>
            </Field>
            <Button onClick={saveSettings} disabled={saving || isOffline}>
              {saving ? "Saving…" : isOffline ? "Save when online" : "Save branding"}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full h-12 text-destructive border-destructive/30"
        onClick={handleLogout}
      >
        <LogOut className="mr-2 size-4" />
        Sign out
      </Button>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:underline">
          Privacy Policy
        </Link>
      </p>
    </main>
  )
}

function AddOnItem({
  icon: Icon,
  title,
  description,
  comingSoon,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  comingSoon?: boolean
}) {
  return (
    <div className="flex items-center gap-4 p-4 opacity-70">
      <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{title}</h3>
          {comingSoon ? <Badge variant="secondary">Soon</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
