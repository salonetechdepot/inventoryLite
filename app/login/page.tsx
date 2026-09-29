import { Package } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthOtpFlow } from "@/components/auth-otp-flow"
import { SessionExpiredNotice } from "@/components/session-expired-notice"
import { LoginOfflineNotice } from "@/components/login-offline-notice"
import { APP_SHORT_NAME, APP_TAGLINE } from "@/lib/site"

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary">
            <Package className="size-8 text-primary-foreground" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
            {APP_SHORT_NAME}
          </p>
          <CardTitle className="text-2xl font-bold">Welcome Back!</CardTitle>
          <CardDescription className="text-base">
            {APP_TAGLINE}
            <span className="block mt-2 text-muted-foreground">
              Sign in with your Roarbyte account (SMS or email OTP)
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginOfflineNotice />
          <SessionExpiredNotice />
          <AuthOtpFlow mode="login" />
        </CardContent>
      </Card>
    </main>
  )
}
