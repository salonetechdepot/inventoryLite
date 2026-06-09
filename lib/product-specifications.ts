export type ProductSpecifications = {
  brand?: string
  model?: string
  size?: string
  color?: string
  notes?: string
}

export function parseSpecifications(raw: unknown): ProductSpecifications | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const spec: ProductSpecifications = {}
  for (const key of ['brand', 'model', 'size', 'color', 'notes'] as const) {
    if (typeof o[key] === 'string' && o[key].trim()) {
      spec[key] = o[key].trim()
    }
  }
  return Object.keys(spec).length > 0 ? spec : null
}

export function formatSpecifications(spec: ProductSpecifications | null | undefined): string {
  if (!spec) return ''
  const parts: string[] = []
  if (spec.brand) parts.push(spec.brand)
  if (spec.model) parts.push(spec.model)
  if (spec.size) parts.push(`Size: ${spec.size}`)
  if (spec.color) parts.push(spec.color)
  if (spec.notes) parts.push(spec.notes)
  return parts.join(' · ')
}
