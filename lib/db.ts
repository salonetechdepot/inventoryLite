import { neon } from "@neondatabase/serverless"

// Create a reusable SQL client
export const sql = neon(process.env.DATABASE_URL!)

// Helper to format currency in Sierra Leone New Leone (NLe)
export function formatCurrency(amount: number): string {
  return `NLe ${amount.toLocaleString("en-SL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// Helper to format dates in DD/MM/YYYY format (common in Sierra Leone)
export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

// Helper to format dates with time
export function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Stock status helper
export type StockStatus = "good" | "low" | "critical"

export function getStockStatus(
  quantity: number,
  threshold: number
): StockStatus {
  if (quantity === 0) return "critical"
  if (quantity <= threshold) return "low"
  return "good"
}
