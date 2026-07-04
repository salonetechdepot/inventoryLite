"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Smartphone, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldDescription, FieldGroup } from "@/components/ui/field"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth-store"
import { normalizeLoginIdentity, normalizeOtpCode } from "@/lib/login-identity"

type Channel = "phone" | "email"

function safeRedirectPath(path: string | null): string {
  if (path && path.startsWith("/") && !path.startsWith("//")) return path
  return "/dashboard"
}

function AuthOtpFlowInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sendOtp = useAuthStore((s) => s.sendOtp)
  const confirmOtp = useAuthStore((s) => s.confirmOtp)

  const [channel, setChannel] = useState<Channel>("phone")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [confirmedIdentity, setConfirmedIdentity] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const resetFlow = () => {
    setStep(1)
    setOtp("")
    setConfirmedIdentity(null)
    setError("")
  }

  const switchChannel = (next: Channel) => {
    if (next === channel) return
    setChannel(next)
    resetFlow()
  }

  const resolveEmailOrPhone = (): { ok: true; value: string } | { ok: false; error: string } => {
    if (channel === "email") {
      return normalizeLoginIdentity(email)
    }
    return normalizeLoginIdentity(phone)
  }

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const identity = resolveEmailOrPhone()
    if (!identity.ok) {
      setError(identity.error)
      return
    }
    setLoading(true)
    try {
      const result = await sendOtp(identity.value)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setConfirmedIdentity(identity.value)
      setStep(2)
      setOtp("")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await confirmOtp(otp, confirmedIdentity ?? undefined)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(safeRedirectPath(searchParams.get("next")))
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const errorBlock = error ? (
    <div className="rounded-lg bg-destructive/10 p-4 text-destructive text-sm text-center">
      {error}
    </div>
  ) : null

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Sign in method"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 h-12"
      >
        <button
          type="button"
          role="tab"
          aria-selected={channel === "phone"}
          onClick={() => switchChannel("phone")}
          className={cn(
            "inline-flex h-full items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors sm:text-base",
            channel === "phone"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Smartphone className="size-4 shrink-0" />
          Phone
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={channel === "email"}
          onClick={() => switchChannel("email")}
          className={cn(
            "inline-flex h-full items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors sm:text-base",
            channel === "email"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Mail className="size-4 shrink-0" />
          Email
        </button>
      </div>

      {step === 2 ? (
        <form key={`${channel}-verify`} onSubmit={verifyCode}>
          <FieldGroup>
            {errorBlock}
            <Field>
              <FieldLabel htmlFor="otp" className="text-base">
                6-digit code
              </FieldLabel>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(normalizeOtpCode(e.target.value))}
                required
                className="h-12 text-base tracking-widest text-center font-mono text-lg"
              />
              <FieldDescription>
                {confirmedIdentity ? (
                  <>
                    Code sent to{" "}
                    <span className="font-medium text-foreground">{confirmedIdentity}</span>
                    {channel === "phone"
                      ? ". Check your SMS messages."
                      : ". Check your inbox and spam folder."}
                  </>
                ) : channel === "phone" ? (
                  "Check your SMS messages on this phone."
                ) : (
                  "Check your email inbox (and spam folder)."
                )}
              </FieldDescription>
            </Field>
            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-lg font-semibold"
              disabled={loading || otp.length !== 6}
            >
              {loading ? "Verifying…" : "Verify & sign in"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={loading}
              onClick={async () => {
                if (!confirmedIdentity) {
                  resetFlow()
                  return
                }
                setError("")
                setLoading(true)
                try {
                  const result = await sendOtp(confirmedIdentity)
                  if (!result.ok) {
                    setError(result.error)
                    return
                  }
                  setOtp("")
                } catch {
                  setError("Could not resend code. Try again.")
                } finally {
                  setLoading(false)
                }
              }}
            >
              Resend code
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={loading}
              onClick={resetFlow}
            >
              {channel === "phone" ? "Use a different number" : "Use a different email"}
            </Button>
          </FieldGroup>
        </form>
      ) : channel === "phone" ? (
        <form key="phone-send" onSubmit={sendCode}>
          <FieldGroup>
            {errorBlock}
            <Field>
              <FieldLabel htmlFor="phone" className="text-base">
                Mobile number (Sierra Leone)
              </FieldLabel>
              <div className="flex rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <span className="flex items-center px-3 text-muted-foreground text-sm border-r bg-muted/50 shrink-0">
                  +232
                </span>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="7X XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="h-12 text-base border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                />
              </div>
              <FieldDescription>
                We&apos;ll send a one-time code by SMS via your account provider.
              </FieldDescription>
            </Field>
            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-lg font-semibold"
              disabled={loading}
            >
              {loading ? "Sending…" : "Send SMS code"}
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <form key="email-send" onSubmit={sendCode}>
          <FieldGroup>
            {errorBlock}
            <Field>
              <FieldLabel htmlFor="auth-email" className="text-base">
                Email address
              </FieldLabel>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 text-base"
              />
              <FieldDescription>
                We&apos;ll send a one-time code to your inbox.
              </FieldDescription>
            </Field>
            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-lg font-semibold"
              disabled={loading}
            >
              {loading ? "Sending…" : "Send email code"}
            </Button>
          </FieldGroup>
        </form>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Access requires SuperAdmin role, an active subscription, and the Lite Inventory
        System module.
      </p>
    </div>
  )
}

export function AuthOtpFlow({ mode: _mode }: { mode?: "login" | "register" }) {
  return (
    <Suspense fallback={null}>
      <AuthOtpFlowInner />
    </Suspense>
  )
}
