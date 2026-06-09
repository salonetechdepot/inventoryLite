/** Physical state of a returned item */
export type ReturnCondition = 'SEALED' | 'OPENED' | 'DAMAGED'

/** Whether returned stock goes back on the shelf or is written off */
export type ReturnDisposition = 'RESTOCK' | 'DISCARD'

export const RETURN_CONDITIONS: ReturnCondition[] = ['SEALED', 'OPENED', 'DAMAGED']
export const RETURN_DISPOSITIONS: ReturnDisposition[] = ['RESTOCK', 'DISCARD']

export function isReturnCondition(value: unknown): value is ReturnCondition {
  return typeof value === 'string' && RETURN_CONDITIONS.includes(value as ReturnCondition)
}

export function isReturnDisposition(value: unknown): value is ReturnDisposition {
  return typeof value === 'string' && RETURN_DISPOSITIONS.includes(value as ReturnDisposition)
}

export function formatReturnCondition(condition: ReturnCondition | null | undefined): string {
  switch (condition) {
    case 'SEALED':
      return 'Sealed'
    case 'OPENED':
      return 'Opened'
    case 'DAMAGED':
      return 'Damaged'
    default:
      return '—'
  }
}

export function formatReturnDisposition(disposition: ReturnDisposition | null | undefined): string {
  switch (disposition) {
    case 'RESTOCK':
      return 'Restock'
    case 'DISCARD':
      return 'Discard'
    default:
      return '—'
  }
}

/** Suggested disposition when staff picks a condition (they can override). */
export function defaultDispositionForCondition(
  condition: ReturnCondition
): ReturnDisposition {
  if (condition === 'DAMAGED') return 'DISCARD'
  return 'RESTOCK'
}

export function restockQuantityForLine(
  quantity: number,
  disposition: ReturnDisposition | null | undefined
): number {
  return disposition === 'RESTOCK' ? Math.max(0, quantity) : 0
}
