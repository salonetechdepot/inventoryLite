export function formatReceiptShortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export function formatReceiptLinkLabel(id: string, createdAt?: string | Date): string {
  const short = formatReceiptShortId(id)
  if (!createdAt) return `#${short}`
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  const day = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
  return `#${short} · ${day}`
}
