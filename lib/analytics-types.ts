/** Shape returned by GET /api/analytics — used for UI and offline cache. */
export type AnalyticsPayload = {
  revenue: {
    today: { amount: number; transactions: number }
    week: { amount: number; transactions: number }
    month: { amount: number; transactions: number }
    allTime: { amount: number; transactions: number }
  }
  profit: {
    today: number
    week: number
    month: number
    allTime: number
  }
  topProducts: Array<{
    name: string
    quantitySold: number
    revenue: number
    saleCount: number
  }>
  dailyRevenue: Array<{ date: string; transactions: number; revenue: number }>
  inventory: {
    totalProducts: number
    totalItems: number
    totalValue: number
    stockCostValue: number
    lowStock: number
    outOfStock: number
  }
  categories: Array<{
    name: string
    productCount: number
    totalQuantity: number
    totalValue: number
  }>
  recentSales: Array<{
    id: string
    productName: string
    quantity: number
    unitPrice: number
    total: number
    type: string
    date: string | Date | null
  }>
  _cachedAt?: string
}

export const EMPTY_ANALYTICS: AnalyticsPayload = {
  revenue: {
    today: { amount: 0, transactions: 0 },
    week: { amount: 0, transactions: 0 },
    month: { amount: 0, transactions: 0 },
    allTime: { amount: 0, transactions: 0 },
  },
  profit: { today: 0, week: 0, month: 0, allTime: 0 },
  topProducts: [],
  dailyRevenue: [],
  inventory: {
    totalProducts: 0,
    totalItems: 0,
    totalValue: 0,
    stockCostValue: 0,
    lowStock: 0,
    outOfStock: 0,
  },
  categories: [],
  recentSales: [],
}
