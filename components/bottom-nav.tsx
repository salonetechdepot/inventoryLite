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
    router.push(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
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
                "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-xl transition-colors",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className="size-6" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
