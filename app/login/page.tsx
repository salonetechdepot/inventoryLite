import { Package } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthOtpFlow } from "@/components/auth-otp-flow"

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary">
            <Package className="size-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Welcome Back!</CardTitle>
          <CardDescription className="text-base">
            Sign in with a one-time code via WhatsApp or email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuthOtpFlow mode="login" />
        </CardContent>
      </Card>
    </main>
  )
}
