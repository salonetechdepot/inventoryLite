"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  Package,
  AlertTriangle,
  TrendingUp,
  ShoppingCart,
  Plus,
  ArrowRight,
  Undo2,
  WifiOff,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import {
  DASHBOARD_STATS_CACHE_KEY,
  fetchWithOfflineCache,
  getCacheUpdatedAt,
} from "@/lib/offline-sync"

const fetcher = fetchWithOfflineCache

function formatPrice(amount: number) {
  return new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount).replace('SLL', 'NLe')
}

interface DashboardStats {
  totalProducts: number
  lowStockCount: number
  outOfStockCount: number
  inventoryValue: number
  todaySalesCount: number
  todaySalesTotal: number
}

interface LowStockProduct {
  id: string
  name: string
  quantity: number
  low_stock_threshold: number
}

function formatCacheAge(updatedAt: number) {
  const minutes = Math.floor((Date.now() - updatedAt) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(updatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<number | null>(null)

  const { data, isLoading } = useSWR<{ stats: DashboardStats; lowStockProducts: LowStockProduct[] }>(
    DASHBOARD_STATS_CACHE_KEY,
    fetcher,
    { refreshInterval: 30000 }
  )

  const isOffline = typeof navigator !== "undefined" && !navigator.onLine
  const showStaleBanner = Boolean(data) && isOffline

  useEffect(() => {
    void getCacheUpdatedAt(DASHBOARD_STATS_CACHE_KEY).then(setCacheUpdatedAt)
  }, [data])

  const stats = data?.stats
  const lowStockProducts = data?.lowStockProducts || []

  return (
    <main className="p-4">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Hi, {user?.business_name || "there"}!
        </h1>
        <p className="text-muted-foreground">Here&apos;s your inventory overview</p>
      </header>

      {showStaleBanner && (
        <div
          className={cn(
            "mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            isOffline
              ? "border-warning/40 bg-warning/10 text-warning-foreground"
              : "border-muted bg-muted/50 text-muted-foreground"
          )}
        >
          <WifiOff className="size-4 shrink-0 mt-0.5" />
          <p>
            <>
              <span className="font-medium">You&apos;re offline.</span> Showing saved overview
              {cacheUpdatedAt ? ` from ${formatCacheAge(cacheUpdatedAt)}` : ""}. Figures may
              change after sync.
            </>
          </p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Button asChild size="lg" className="flex-1 h-14 text-base font-semibold">
          <Link href="/dashboard/products/new">
            <Plus className="mr-2 size-5" />
            Add Product
          </Link>
        </Button>
        <Button asChild variant="secondary" size="lg" className="flex-1 h-14 text-base font-semibold">
          <Link href="/dashboard/sell">
            <ShoppingCart className="mr-2 size-5" />
            Make Sale
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="flex-1 h-14 text-base font-semibold">
          <Link href="/dashboard/returns">
            <Undo2 className="mr-2 size-5" />
            Returns
          </Link>
        </Button>
      </div>

      {/* Low Stock Alert */}
      {!isLoading && lowStockProducts.length > 0 && (
        <Card className="mb-6 border-warning bg-warning/10">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-warning-foreground">
              <AlertTriangle className="size-5 text-accent" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {lowStockProducts.slice(0, 3).map((product) => (
                <div key={product.id} className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{product.name}</span>
                  <Badge variant={product.quantity === 0 ? "destructive" : "secondary"}>
                    {product.quantity} left
                  </Badge>
                </div>
              ))}
              {lowStockProducts.length > 3 && (
                <Link 
                  href="/dashboard/products?filter=low-stock" 
                  className="text-sm text-primary font-medium flex items-center gap-1 mt-1"
                >
                  View all {lowStockProducts.length} items
                  <ArrowRight className="size-4" />
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatsCard
          title="Total Products"
          value={stats?.totalProducts}
          icon={Package}
          isLoading={isLoading}
          color="primary"
        />
        <StatsCard
          title="Low Stock"
          value={stats?.lowStockCount}
          icon={AlertTriangle}
          isLoading={isLoading}
          color="warning"
        />
        <StatsCard
          title="Today&apos;s Sales"
          value={stats?.todaySalesCount}
          icon={ShoppingCart}
          isLoading={isLoading}
          color="accent"
          suffix=" items"
        />
        <StatsCard
          title="Inventory Value"
          value={stats?.inventoryValue}
          icon={TrendingUp}
          isLoading={isLoading}
          color="primary"
          isPrice
        />
      </div>

      {/* Today's Revenue Card */}
      {!isLoading && (
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Today&apos;s Revenue</p>
                <p className="text-3xl font-bold mt-1">
                  {formatPrice(stats?.todaySalesTotal || 0)}
                </p>
              </div>
              <div className="size-14 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <TrendingUp className="size-7" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}

function StatsCard({
  title,
  value,
  icon: Icon,
  isLoading,
  color,
  isPrice,
  suffix,
}: {
  title: string
  value?: number
  icon: React.ElementType
  isLoading: boolean
  color: "primary" | "warning" | "accent"
  isPrice?: boolean
  suffix?: string
}) {
  const colorClasses = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/20 text-accent",
    accent: "bg-accent/10 text-accent",
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className={`size-10 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-3`}>
          <Icon className="size-5" />
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-bold">
            {isPrice ? formatPrice(value || 0) : (value || 0)}{suffix}
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-1">{title}</p>
      </CardContent>
    </Card>
  )
}
