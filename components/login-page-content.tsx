"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthOtpFlow } from "@/components/auth-otp-flow"
import { SessionExpiredNotice } from "@/components/session-expired-notice"
import { LoginOfflineNotice } from "@/components/login-offline-notice"
import { LoginSsoHandoff } from "@/components/login-sso-handoff"
import { BivaLogo } from "@/components/biva-logo"
import { APP_TAGLINE } from "@/lib/site"

export function LoginPageContent() {
  const [ssoError, setSsoError] = useState("")
  const [ssoBusy, setSsoBusy] = useState(false)

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-5 flex justify-center px-2">
            <BivaLogo height={64} priority />
          </div>
          <CardTitle className="text-2xl font-bold">Welcome Back!</CardTitle>
          <CardDescription className="text-base">
            {APP_TAGLINE}
            <span className="block mt-2 text-muted-foreground">
              Sign in with your Roarbyte account (portal link or SMS / email OTP)
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginSsoHandoff onError={setSsoError} onBusyChange={setSsoBusy} />
          {ssoError ? (
            <div
              className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {ssoError}
            </div>
          ) : null}
          <LoginOfflineNotice />
          <SessionExpiredNotice />
          {!ssoBusy ? <AuthOtpFlow mode="login" /> : null}
        </CardContent>
      </Card>
    </main>
  )
}
