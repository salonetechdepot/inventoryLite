import {
  attachThermalPrintCleanup,
  prepareThermalClone,
  scheduleThermalPrint,
} from '@/lib/thermal-print'

export const PRODUCT_LABEL_PRINT_CLASS = 'printing-product-label'
export const PRODUCT_LABEL_PRINT_PORTAL_ID = 'product-label-print-portal'

export function printProductLabel(sourceContainer: HTMLElement): boolean {
  if (typeof window === 'undefined') return false

  const label = sourceContainer.querySelector('.product-label-print-root')
  if (!label) return false

  removePrintPortal()
  removeOtherPrintPortals()

  const portal = document.createElement('div')
  portal.id = PRODUCT_LABEL_PRINT_PORTAL_ID
  portal.setAttribute('aria-hidden', 'true')
  portal.appendChild(prepareThermalClone(label))
  document.body.appendChild(portal)

  const root = document.documentElement
  const body = document.body
  root.classList.add(PRODUCT_LABEL_PRINT_CLASS)
  body.classList.add(PRODUCT_LABEL_PRINT_CLASS)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    root.classList.remove(PRODUCT_LABEL_PRINT_CLASS)
    body.classList.remove(PRODUCT_LABEL_PRINT_CLASS)
    removePrintPortal()
  }

  attachThermalPrintCleanup(cleanup)

  scheduleThermalPrint(() => {
    window.print()
  })

  return true
}

function removePrintPortal() {
  document.getElementById(PRODUCT_LABEL_PRINT_PORTAL_ID)?.remove()
}

function removeOtherPrintPortals() {
  document.getElementById('receipt-print-portal')?.remove()
}

function readLabelField(root: ParentNode, selector: string, fallback = ''): string {
  return root.querySelector(selector)?.textContent?.trim() || fallback
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function svgElementToImage(svg: SVGElement): Promise<HTMLImageElement | null> {
  const clone = svg.cloneNode(true) as SVGElement
  const widthAttr = clone.getAttribute('width')
  const heightAttr = clone.getAttribute('height')
  const viewBox = clone.getAttribute('viewBox')
  let width = widthAttr ? Number.parseFloat(widthAttr) : 0
  let height = heightAttr ? Number.parseFloat(heightAttr) : 0
  if ((!width || !height) && viewBox) {
    const parts = viewBox.split(/\s+/).map(Number)
    if (parts.length === 4) {
      width = parts[2]
      height = parts[3]
    }
  }
  if (!width || !height) {
    width = 100
    height = 100
  }
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: 'image/svg+xml;charset=utf-8',
    })
  )
  try {
    return await loadImage(url)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function loadGraphicFromRoot(
  root: ParentNode,
  mode: 'barcode' | 'qr'
): Promise<HTMLImageElement | null> {
  if (mode === 'barcode') {
    const barcodeImg = root.querySelector<HTMLImageElement>('.product-label-barcode-img')
    if (barcodeImg?.src) {
      try {
        return await loadImage(barcodeImg.src)
      } catch {
        return null
      }
    }
  }
  const svg = root.querySelector('.product-label-code-graphic svg')
  if (svg instanceof SVGElement) return svgElementToImage(svg)
  return null
}

export async function downloadLabelPreviewPng(
  container: HTMLElement,
  filename: string,
  mode: 'barcode' | 'qr' = 'barcode'
): Promise<boolean> {
  const root = container.querySelector('.product-label-print-root') ?? container
  const name = readLabelField(root, '.product-label-name', 'Product')
  const price = readLabelField(root, '.product-label-price')
  const category = readLabelField(root, '.product-label-category', 'Uncategorized')
  const code = readLabelField(root, '.product-label-code')

  const scale = 2
  const width = 320
  const padding = 16
  const lineHeight = 20
  let graphicHeight = 0
  const graphicEl = await loadGraphicFromRoot(root, mode)
  if (graphicEl) {
    graphicHeight = Math.min(mode === 'qr' ? 100 : 72, Math.max(48, graphicEl.height))
  }

  const totalHeight =
    padding * 2 + lineHeight * 3 + (graphicEl ? graphicHeight + 10 : 0) + lineHeight + 4

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  canvas.width = width * scale
  canvas.height = totalHeight * scale
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, totalHeight)

  ctx.fillStyle = '#000000'
  ctx.textAlign = 'center'

  let y = padding + 14
  ctx.font = 'bold 14px system-ui, sans-serif'
  ctx.fillText(name.slice(0, 48), width / 2, y)
  y += lineHeight

  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.fillText(price, width / 2, y)
  y += lineHeight

  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(category.slice(0, 40), width / 2, y)
  y += lineHeight

  if (graphicEl) {
    const drawWidth = mode === 'qr' ? graphicHeight : width - padding * 2
    const drawHeight = graphicHeight
    const x = mode === 'qr' ? (width - drawWidth) / 2 : padding
    ctx.drawImage(graphicEl, x, y + 4, drawWidth, drawHeight)
    y += drawHeight + 12
  }

  ctx.font = '11px ui-monospace, monospace'
  ctx.fillText(code.slice(0, 44), width / 2, y + 10)

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = filename
  link.click()
  return true
}

export function isLabelGraphicReady(
  container: HTMLElement | null,
  mode: 'barcode' | 'qr' = 'barcode'
): boolean {
  if (!container) return false
  const root = container.querySelector('.product-label-print-root')
  if (!root) return false
  if (mode === 'barcode') {
    const img = root.querySelector<HTMLImageElement>('.product-label-barcode-img')
    return Boolean(img?.src)
  }
  return Boolean(root.querySelector('.product-label-code-graphic svg'))
}

export function isLabelBarcodeReady(container: HTMLElement | null): boolean {
  return isLabelGraphicReady(container, 'barcode')
}
