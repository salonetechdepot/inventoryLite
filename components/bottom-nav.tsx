"use client"

import { usePathname, useRouter } from "next/navigation"
import { Home, Package, ShoppingCart, Receipt, Undo2, User } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/products", label: "Products", icon: Package },
  { href: "/dashboard/sell", label: "Sell", icon: ShoppingCart },
  { href: "/dashboard/sales", label: "History", icon: Receipt },
  { href: "/dashboard/returns", label: "Returns", icon: Undo2 },
  { href: "/dashboard/account", label: "Account", icon: User },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  const navigate = (href: string) => {
    if (pathname === href) return
    // Offline: load the saved page for this tab. Client routing reuses Sell's
    // payload and every tab looks like Sell.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      window.location.assign(href)
      return
    }
    router.push(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-16 w-full grid-cols-6">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href))
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => navigate(item.href)}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1 transition-colors",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className="size-5 shrink-0" />
              <span className="w-full truncate text-center text-[10px] font-medium leading-tight sm:text-xs">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
