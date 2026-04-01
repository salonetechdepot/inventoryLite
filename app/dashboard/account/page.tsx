"use client"

import { useRouter } from "next/navigation"
import { User, LogOut, Users, BarChart3, Lock, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/hooks/use-auth"

export default function AccountPage() {
  const router = useRouter()
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.push("/login")
  }

  return (
    <main className="p-4">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold">My Account</h1>
      </header>

      {/* User Info */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="size-8 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{user?.business_name || "My Business"}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add-ons Section */}
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
          <AddOnItem
            icon={BarChart3}
            title="Reports & Analytics"
            description="See detailed sales reports and trends"
            comingSoon
          />
        </CardContent>
      </Card>

      {/* Settings Section */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Settings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SettingsItem
            icon={Lock}
            title="Change Password"
            onClick={() => {}}
            disabled
          />
        </CardContent>
      </Card>

      {/* Logout Button */}
      <Button
        variant="outline"
        size="lg"
        className="w-full h-14 text-base border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
        onClick={handleLogout}
      >
        <LogOut className="mr-2 size-5" />
        Sign Out
      </Button>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-sm text-muted-foreground">StockEasy v1.0</p>
        <p className="text-xs text-muted-foreground mt-1">Made for Sierra Leone SMEs</p>
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
            <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="size-5 text-muted-foreground shrink-0" />
    </div>
  )
}

function SettingsItem({
  icon: Icon,
  title,
  onClick,
  disabled,
}: {
  icon: React.ElementType
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      className="flex items-center gap-4 p-4 w-full text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <span className="flex-1 font-medium">{title}</span>
      <ChevronRight className="size-5 text-muted-foreground shrink-0" />
    </button>
  )
}
