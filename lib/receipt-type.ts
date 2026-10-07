export type ReceiptTransactionType = 'SALE' | 'RETURN'

export function toReceiptTypeString(type: ReceiptTransactionType): string {
  return type
}

export function parseReceiptType(value: string): ReceiptTransactionType {
  return value === 'RETURN' ? 'RETURN' : 'SALE'
}
