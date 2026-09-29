import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthOtpFlow } from "@/components/auth-otp-flow"
import { SessionExpiredNotice } from "@/components/session-expired-notice"
import { LoginOfflineNotice } from "@/components/login-offline-notice"
import { BivaLogo } from "@/components/biva-logo"
import { APP_TAGLINE } from "@/lib/site"

export default function LoginPage() {
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
