"use client"

import { useState } from "react"
import useSWR from "swr"
import { ArrowLeft, Receipt, Calendar, TrendingUp } from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface Sale {
  id: string
  product_name: string
  quantity_sold: number
  unit_price_at_sale: number
  total_amount: number
  created_at: string
}

interface DailySummary {
  date: string
  displayDate: string
  totalSales: number
  totalAmount: number
  sales: Sale[]
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-SL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return "Today"
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday"
  } else {
    return date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  }
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function groupSalesByDate(sales: Sale[]): DailySummary[] {
  const grouped: { [key: string]: DailySummary } = {}

  sales.forEach((sale) => {
    const date = new Date(sale.created_at).toDateString()
    if (!grouped[date]) {
      grouped[date] = {
        date,
        displayDate: formatDate(sale.created_at),
        totalSales: 0,
        totalAmount: 0,
        sales: [],
      }
    }
    grouped[date].totalSales += 1
    grouped[date].totalAmount += Number(sale.total_amount)
    grouped[date].sales.push(sale)
  })

  return Object.values(grouped)
}

export default function SalesHistoryPage() {
  const [limit] = useState(100)
  const { data, error, isLoading } = useSWR<{ sales: Sale[] }>(
    `/api/sales?limit=${limit}`,
    fetcher
  )

  const sales = data?.sales || []
  const dailySummaries = groupSalesByDate(sales)

  // Calculate totals
  const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)
  const totalTransactions = sales.length

  return (
    <main className="p-4 pb-24">
      {/* Header */}
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-5 mr-1" />
          Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Sales History</h1>
        <p className="text-muted-foreground">View all your past sales</p>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="size-4" />
              <span className="text-sm">Total Revenue</span>
            </div>
            <p className="text-xl font-bold text-primary">
              {isLoading ? <Skeleton className="h-7 w-24" /> : `NLe ${formatCurrency(totalRevenue)}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Receipt className="size-4" />
              <span className="text-sm">Transactions</span>
            </div>
            <p className="text-xl font-bold">
              {isLoading ? <Skeleton className="h-7 w-16" /> : totalTransactions}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sales List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-destructive">Failed to load sales history</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </Card>
      ) : sales.length === 0 ? (
        <Card className="p-8 text-center">
          <Receipt className="size-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No sales yet</h3>
          <p className="text-muted-foreground mb-4">
            Start selling to see your sales history here
          </p>
          <Button asChild>
            <Link href="/dashboard/sell">Make a Sale</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {dailySummaries.map((day) => (
            <Card key={day.date}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Calendar className="size-4" />
                    {day.displayDate}
                  </span>
                  <span className="text-primary font-bold">
                    NLe {formatCurrency(day.totalAmount)}
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {day.totalSales} {day.totalSales === 1 ? "sale" : "sales"}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {day.sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{sale.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {sale.quantity_sold} x NLe {formatCurrency(Number(sale.unit_price_at_sale))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-primary">
                          NLe {formatCurrency(Number(sale.total_amount))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(sale.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
