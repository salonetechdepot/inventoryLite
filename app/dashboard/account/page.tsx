"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  User,
  LogOut,
  Users,
  BarChart3,
  ChevronRight,
  Paintbrush,
  Mail,
  Smartphone,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ImageUpload } from "@/components/image-upload"
import { useAuth } from "@/hooks/use-auth"

function isSyntheticPhoneEmail(email: string) {
  return email.toLowerCase().endsWith("@phone.sl")
}

export default function AccountPage() {
  const router = useRouter()
  const { user, logout, mutate } = useAuth()
  const [themeColor, setThemeColor] = useState(user?.theme_color || "#2E8B57")
  const [shopLogoUrl, setShopLogoUrl] = useState<string | undefined>(user?.shop_logo_url || undefined)
  const [saving, setSaving] = useState(false)
  const [settingsError, setSettingsError] = useState("")

  const [newEmail, setNewEmail] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [contactField, setContactField] = useState<"email" | "phone" | null>(null)
  const [contactCode, setContactCode] = useState("")
  const [contactStep, setContactStep] = useState<1 | 2>(1)
  const [contactLoading, setContactLoading] = useState(false)
  const [contactError, setContactError] = useState("")
  const [contactMessage, setContactMessage] = useState("")

  const phoneOnly = Boolean(user?.email && isSyntheticPhoneEmail(user.email))

  useEffect(() => {
    if (!user) return
    setThemeColor(user.theme_color || "#2E8B57")
    setShopLogoUrl(user.shop_logo_url || undefined)
    if (!phoneOnly && user.email) setNewEmail(user.email)
    if (user.phone_e164) setNewPhone(user.phone_e164.replace(/^\+232/, ""))
  }, [user, phoneOnly])

  const handleLogout = async () => {
    await logout()
    router.push("/login")
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
      await mutate({ user: data.user }, false)
    } catch {
      setSettingsError("Could not save settings. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const sendContactOtp = async (field: "email" | "phone") => {
    setContactError("")
    setContactMessage("")
    const value = field === "email" ? newEmail.trim() : newPhone.trim()
    if (!value) {
      setContactError(field === "email" ? "Enter an email address" : "Enter a phone number")
      return
    }
    setContactLoading(true)
    setContactField(field)
    try {
      const res = await fetch("/api/account/contact/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      })
      const data = await res.json()
      if (!res.ok) {
        setContactError(data.error || "Could not send code")
        return
      }
      setContactStep(2)
      setContactCode("")
      setContactMessage(
        field === "email"
          ? "Check your new email inbox for the code."
          : "Check WhatsApp on the new number for the code."
      )
    } catch {
      setContactError("Could not send code. Try again when online.")
    } finally {
      setContactLoading(false)
    }
  }

  const verifyContactOtp = async () => {
    if (!contactField) return
    setContactError("")
    setContactLoading(true)
    const value = contactField === "email" ? newEmail.trim() : newPhone.trim()
    try {
      const res = await fetch("/api/account/contact/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: contactField, value, code: contactCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setContactError(data.error || "Verification failed")
        return
      }
      await mutate(
        { user: { ...user!, email: data.user.email, phone_e164: data.user.phone_e164 } },
        false
      )
      setContactStep(1)
      setContactField(null)
      setContactCode("")
      setContactMessage("Contact updated successfully.")
    } catch {
      setContactError("Verification failed. Try again when online.")
    } finally {
      setContactLoading(false)
    }
  }

  return (
    <main className="p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">My Account</h1>
      </header>

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
              <p
                className={
                  phoneOnly
                    ? "text-xs text-muted-foreground/80 mt-1"
                    : "text-sm text-muted-foreground"
                }
              >
                {phoneOnly ? `Account ID: ${user?.email}` : user?.email}
              </p>
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
          <CardTitle className="text-base font-semibold">Sign-in contact</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Update email or WhatsApp number. We send a code to the new contact to confirm.
          </p>
          {contactMessage && (
            <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
              {contactMessage}
            </div>
          )}
          {contactError && (
            <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
              {contactError}
            </div>
          )}
          {contactStep === 1 ? (
            <FieldGroup className="gap-4">
              {!phoneOnly && (
                <Field>
                  <FieldLabel className="flex items-center gap-2">
                    <Mail className="size-4" />
                    Email
                  </FieldLabel>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="h-11"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full mt-2"
                    disabled={contactLoading}
                    onClick={() => sendContactOtp("email")}
                  >
                    {contactLoading && contactField === "email"
                      ? "Sending…"
                      : "Verify new email"}
                  </Button>
                </Field>
              )}
              <Field>
                <FieldLabel className="flex items-center gap-2">
                  <Smartphone className="size-4" />
                  Phone (Sierra Leone)
                </FieldLabel>
                <div className="flex rounded-md border border-input overflow-hidden">
                  <span className="flex items-center px-3 text-sm text-muted-foreground border-r bg-muted/50">
                    +232
                  </span>
                  <Input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="h-11 border-0 rounded-none"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-2"
                  disabled={contactLoading}
                  onClick={() => sendContactOtp("phone")}
                >
                  {contactLoading && contactField === "phone"
                    ? "Sending…"
                    : "Verify new number"}
                </Button>
              </Field>
            </FieldGroup>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel>6-digit code</FieldLabel>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={contactCode}
                  onChange={(e) => setContactCode(e.target.value.replace(/\D/g, ""))}
                  className="h-11 text-center tracking-widest font-mono"
                />
              </Field>
              <Button
                className="w-full"
                disabled={contactLoading || contactCode.length !== 6}
                onClick={verifyContactOtp}
              >
                {contactLoading ? "Verifying…" : "Confirm update"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setContactStep(1)
                  setContactField(null)
                  setContactCode("")
                }}
              >
                Cancel
              </Button>
            </FieldGroup>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Settings</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <FieldGroup>
            <Field>
              <FieldLabel className="text-base flex items-center gap-2">
                <Paintbrush className="size-4" />
                Theme Color
              </FieldLabel>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="h-12 w-16 rounded border bg-background cursor-pointer"
                />
                <div className="flex-1 rounded-lg border h-12 px-3 flex items-center text-sm text-muted-foreground">
                  {themeColor}
                </div>
              </div>
            </Field>
            <Field>
              <FieldLabel className="text-base">Shop Logo / Picture</FieldLabel>
              <ImageUpload value={shopLogoUrl} onChange={setShopLogoUrl} folder="branding" />
            </Field>
            {settingsError && (
              <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
                {settingsError}
              </div>
            )}
            <Button onClick={saveSettings} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save Theme & Logo"}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        size="lg"
        className="w-full h-14 text-base border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
        onClick={handleLogout}
      >
        <LogOut className="mr-2 size-5" />
        Sign Out
      </Button>

      <div className="mt-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground">StockEasy v1.0</p>
        <p className="text-xs text-muted-foreground">Made for Sierra Leone SMEs</p>
        <p className="text-xs text-muted-foreground">
          <a href="/privacy" className="hover:text-foreground hover:underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </main>
  )
}

function AddOnItem({
  icon: Icon,
  title,
  description,
  comingSoon,
}: {
  icon: React.ElementType
  title: string
  description: string
  comingSoon?: boolean
}) {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="size-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
        <Icon className="size-5 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{title}</h3>
          {comingSoon && (
            <Badge variant="secondary" className="text-xs">
              Coming Soon
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="size-5 text-muted-foreground shrink-0" />
    </div>
  )
}
