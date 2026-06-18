"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Smartphone, Mail, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldDescription, FieldGroup } from "@/components/ui/field"
import { cn } from "@/lib/utils"

type Mode = "login" | "register"
type Channel = "whatsapp" | "email"

function safeRedirectPath(path: string | null): string {
  if (path && path.startsWith("/") && !path.startsWith("//")) return path
  return "/dashboard"
}

function AuthOtpFlowInner({ mode }: { mode: Mode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [channel, setChannel] = useState<Channel>("whatsapp")

  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<1 | 2>(1)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const purpose = mode
  const isRegister = mode === "register"

  const resetFlow = () => {
    setStep(1)
    setOtp("")
    setError("")
  }

  const switchChannel = (next: Channel) => {
    if (next === channel) return
    setChannel(next)
    resetFlow()
  }

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (isRegister && !businessName.trim()) {
      setError("Enter your business name")
      return
    }
    setLoading(true)
    try {
      const url =
        channel === "whatsapp" ? "/api/auth/phone/send-otp" : "/api/auth/email/send-otp"
      const body =
        channel === "whatsapp"
          ? { phone, purpose, ...(isRegister ? { businessName: businessName.trim() } : {}) }
          : { email, purpose, ...(isRegister ? { businessName: businessName.trim() } : {}) }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Could not send code")
        return
      }
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
      const url =
        channel === "whatsapp" ? "/api/auth/phone/verify" : "/api/auth/email/verify"
      const body =
        channel === "whatsapp"
          ? { phone, purpose, code: otp }
          : { email, purpose, code: otp }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Verification failed")
        return
      }
      router.push(
        mode === "login"
          ? safeRedirectPath(searchParams.get("next"))
          : "/dashboard"
      )
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const businessField = isRegister ? (
    <Field>
      <FieldLabel htmlFor="businessName" className="text-base">
        <Store className="inline-block size-4 mr-1" />
        Business name
      </FieldLabel>
      <Input
        id="businessName"
        type="text"
        placeholder="e.g. My Shop"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        required
        className="h-12 text-base"
      />
    </Field>
  ) : null

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
          aria-selected={channel === "whatsapp"}
          onClick={() => switchChannel("whatsapp")}
          className={cn(
            "inline-flex h-full items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors sm:text-base",
            channel === "whatsapp"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Smartphone className="size-4 shrink-0" />
          WhatsApp
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
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                required
                className="h-12 text-base tracking-widest text-center font-mono text-lg"
              />
              <FieldDescription>
                {channel === "whatsapp"
                  ? "Check WhatsApp on this phone."
                  : "Check your email inbox (and spam folder)."}
              </FieldDescription>
            </Field>
            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-lg font-semibold"
              disabled={loading || otp.length !== 6}
            >
              {loading
                ? "Verifying…"
                : isRegister
                  ? "Verify & create account"
                  : "Verify & sign in"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={loading}
              onClick={resetFlow}
            >
              {channel === "whatsapp" ? "Use a different number" : "Use a different email"}
            </Button>
            <Button
              type="button"
              variant="link"
              className="w-full text-muted-foreground"
              disabled={loading}
              onClick={() => switchChannel(channel === "whatsapp" ? "email" : "whatsapp")}
            >
              {channel === "whatsapp"
                ? "Use email instead"
                : "Use WhatsApp instead"}
            </Button>
          </FieldGroup>
        </form>
      ) : channel === "whatsapp" ? (
        <form key="whatsapp-send" onSubmit={sendCode}>
          <FieldGroup>
            {errorBlock}
            {businessField}
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
                We&apos;ll send a one-time code via WhatsApp.
              </FieldDescription>
            </Field>
            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-lg font-semibold"
              disabled={loading}
            >
              {loading ? "Sending…" : "Send WhatsApp code"}
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <form key="email-send" onSubmit={sendCode}>
          <FieldGroup>
            {errorBlock}
            {businessField}
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

      {isRegister && (
        <p className="text-center text-xs text-muted-foreground">
          By creating an account, you agree to our{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      )}

      <FieldDescription className="text-center text-base block">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Sign in here
            </Link>
          </>
        ) : (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary font-semibold hover:underline">
              Create one here
            </Link>
          </>
        )}
      </FieldDescription>

      {!isRegister && (
        <p className="text-center text-xs text-muted-foreground">
          You stay signed in on this device for up to a year. Sign out from Account when needed.
        </p>
      )}
    </div>
  )
}

export function AuthOtpFlow({ mode }: { mode: Mode }) {
  return (
    <Suspense fallback={null}>
      <AuthOtpFlowInner mode={mode} />
    </Suspense>
  )
}
