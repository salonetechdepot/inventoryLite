import type { Prisma } from '@prisma/client'

type ReceiptWithRelations = Prisma.ReceiptGetPayload<{
  include: {
    originalReceipt: {
      select: {
        id: true
        createdAt: true
        netAmount: true
      }
    }
    sales: {
      select: {
        id: true
        productId: true
        productName: true
        quantitySold: true
        unitPriceAtSale: true
        totalAmount: true
        returnCondition: true
        returnDisposition: true
        createdAt: true
      }
    }
    payments: {
      select: {
        id: true
        amount: true
        method: true
        note: true
        createdAt: true
      }
    }
  }
}>

export function formatReceiptForSync(receipt: ReceiptWithRelations) {
  return {
    id: receipt.id,
    type: receipt.type,
    customer_name: receipt.customerName,
    customer_phone: receipt.customerPhone,
    subtotal: Number(receipt.subtotal),
    discount_amount: Number(receipt.discountAmount),
    net_amount: Number(receipt.netAmount),
    amount_paid: Number(receipt.amountPaid),
    amount_due: Number(receipt.amountDue),
    change_given: Number(receipt.changeGiven),
    is_part_payment: receipt.isPartPayment,
    is_paid: receipt.isPaid,
    notes: receipt.notes,
    original_receipt_id: receipt.originalReceiptId,
    original_receipt: receipt.originalReceipt
      ? {
          id: receipt.originalReceipt.id,
          created_at: receipt.originalReceipt.createdAt,
          net_amount: Number(receipt.originalReceipt.netAmount),
        }
      : null,
    created_at: receipt.createdAt,
    updated_at: receipt.updatedAt,
    item_count: receipt.sales.length,
    sales: receipt.sales.map((sale) => ({
      id: sale.id,
      product_id: sale.productId,
      product_name: sale.productName,
      quantity_sold: sale.quantitySold,
      unit_price_at_sale: Number(sale.unitPriceAtSale),
      total_amount: Number(sale.totalAmount),
      return_condition: sale.returnCondition,
      return_disposition: sale.returnDisposition,
      created_at: sale.createdAt,
    })),
    payments: receipt.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      method: p.method,
      note: p.note,
      created_at: p.createdAt,
    })),
  }
}

export const receiptSyncInclude = {
  originalReceipt: {
    select: {
      id: true,
      createdAt: true,
      netAmount: true,
    },
  },
  sales: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      productId: true,
      productName: true,
      quantitySold: true,
      unitPriceAtSale: true,
      totalAmount: true,
      returnCondition: true,
      returnDisposition: true,
      createdAt: true,
    },
  },
  payments: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      amount: true,
      method: true,
      note: true,
      createdAt: true,
    },
  },
}
