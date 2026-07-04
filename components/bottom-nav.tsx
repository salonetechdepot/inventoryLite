"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Package, ShoppingCart, Receipt, Undo2, User } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/products", label: "Products", icon: Package },
  { href: "/dashboard/sell", label: "Sell", icon: ShoppingCart },
  { href: "/dashboard/sales", label: "History", icon: Receipt },
  { href: "/dashboard/returns", label: "Returns", icon: Undo2 },
  { href: "/dashboard/account", label: "Account", icon: User, onlineOnly: true },
]

export function BottomNav() {
  const pathname = usePathname()
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const sync = () => setIsOffline(!navigator.onLine)
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href))
          const disabled = Boolean(item.onlineOnly && isOffline)

          if (disabled) {
            return (
              <span
                key={item.href}
                title="Account needs an internet connection"
                className="flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-xl text-muted-foreground/40 cursor-not-allowed"
                aria-disabled="true"
              >
                <item.icon className="size-6" />
                <span className="text-xs font-medium">{item.label}</span>
              </span>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-xl transition-colors",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="size-6" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
