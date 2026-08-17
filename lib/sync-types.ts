/** Shared shape for GET /api/sync — delta + full bootstrap. */

export type SyncProduct = {
  id: string
  name: string
  scan_code: string | null
  tags: string[]
  has_specifications: boolean
  specifications: Record<string, string> | null
  quantity: number
  unit_price: number
  cost_price: number | null
  low_stock_threshold: number
  image_url: string | null
  created_at: string | Date | null
  updated_at: string | Date | null
  category_id: string | null
  category_name: string | null
  category_icon: string | null
}

export type SyncCategory = {
  id: string
  name: string
  icon: string | null
  is_default: boolean
  product_count: number
  created_at: string | Date | null
}

export type SyncReceipt = {
  id: string
  type: string
  customer_name: string | null
  customer_phone: string | null
  subtotal: number
  discount_amount: number
  net_amount: number
  amount_paid: number
  amount_due: number
  change_given: number
  is_part_payment: boolean
  is_paid: boolean
  notes: string | null
  original_receipt_id: string | null
  original_receipt: {
    id: string
    created_at: string | Date
    net_amount: number
  } | null
  created_at: string | Date
  updated_at: string | Date
  item_count: number
  sales: Array<{
    id: string
    product_id: string | null
    product_name: string
    quantity_sold: number
    unit_price_at_sale: number
    total_amount: number
    return_condition: string | null
    return_disposition: string | null
    created_at: string | Date | null
  }>
  payments: Array<{
    id: string
    amount: number
    method: string | null
    note: string | null
    created_at: string | Date
  }>
}

export type SyncDashboardStats = {
  stats: {
    totalProducts: number
    lowStockCount: number
    outOfStockCount: number
    inventoryValue: number
    todaySalesCount: number
    todaySalesTotal: number
  }
  lowStockProducts: Array<{
    id: string
    name: string
    quantity: number
    low_stock_threshold: number
  }>
}

export type SyncPayload = {
  cursor: string
  full: boolean
  products: SyncProduct[]
  categories: SyncCategory[]
  sale_receipts: SyncReceipt[]
  return_receipts: SyncReceipt[]
  stats: SyncDashboardStats
  counts: {
    products: number
    sale_receipts: number
    return_receipts: number
  }
}

export type SyncCursorState = {
  tenantId: string
  cursor: string
  lastFullSyncAt: string
}
