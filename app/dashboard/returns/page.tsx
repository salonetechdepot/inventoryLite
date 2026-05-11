"use client"

import useSWR from "swr"
import Link from "next/link"
import { ArrowLeft, Undo2, Calendar } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchWithOfflineCache } from "@/lib/offline-sync"

const fetcher = fetchWithOfflineCache

interface ReturnRecord {
  id: string
  product_name: string
  quantity_sold: number
  unit_price_at_sale: number
  total_amount: number
  customer_name: string | null
  customer_phone: string | null
  created_at: string
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function ReturnsPage() {
  const { data, error, isLoading } = useSWR<{ sales: ReturnRecord[] }>(
    "/api/sales?type=return&limit=100",
    fetcher
  )

  const returns = data?.sales || []
  const totalReturnedValue = returns.reduce((sum, item) => sum + Number(item.total_amount), 0)

  return (
    <main className="p-4 pb-24">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-5 mr-1" />
          Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Returns</h1>
        <p className="text-muted-foreground">Track all processed product returns</p>
      </header>

      <Card className="mb-6">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Return Value</p>
          <p className="text-2xl font-bold text-primary">
            {isLoading ? <Skeleton className="h-8 w-28" /> : `NLe ${formatCurrency(totalReturnedValue)}`}
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-destructive">Failed to load returns</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </Card>
      ) : returns.length === 0 ? (
        <Card className="p-8 text-center">
          <Undo2 className="size-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No returns yet</h3>
          <p className="text-muted-foreground mb-4">
            Use the Sell page and switch to Return mode to process your first return
          </p>
          <Button asChild>
            <Link href="/dashboard/sell">Go to Sell/Return</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {returns.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{item.product_name}</span>
                  <span className="text-primary">NLe {formatCurrency(Number(item.total_amount))}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground space-y-1">
                <p>{item.quantity_sold} x NLe {formatCurrency(Number(item.unit_price_at_sale))}</p>
                {(item.customer_name || item.customer_phone) && (
                  <p>
                    Customer: {item.customer_name || "Unknown"}
                    {item.customer_phone ? ` (${item.customer_phone})` : ""}
                  </p>
                )}
                <p className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {new Date(item.created_at).toLocaleDateString("en-GB")} {formatTime(item.created_at)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
