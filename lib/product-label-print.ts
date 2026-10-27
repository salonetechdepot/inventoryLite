import {
  attachThermalPrintCleanup,
  prepareThermalClone,
  printPreparedDocument,
  scheduleThermalPrint,
} from '@/lib/thermal-print'
import {
  describeLabelSize,
  LABEL_LINE_HEIGHT,
  labelLayout,
  MAX_LABEL_COPIES,
  type LabelPrintAdjust,
  type LabelSize,
} from '@/lib/label-settings'

export const PRODUCT_LABEL_PRINT_CLASS = 'printing-product-label'
export const PRODUCT_LABEL_PRINT_PORTAL_ID = 'product-label-print-portal'
const LABEL_PAGE_STYLE_ID = 'product-label-page-size'
/** Saved label images are ~300 dpi. */
const IMAGE_PX_PER_MM = 12
/**
 * Each printed page is this much shorter than the label so rounding can never
 * spill onto a second page — which makes the printer feed a blank label.
 */
const PAGE_SAFETY_MM = 0.4
/** Test label height on continuous rolls. */
const ROLL_TEST_HEIGHT_MM = 25

export type LabelPrintOptions = {
  copies?: number
  adjust?: LabelPrintAdjust
}

/** Size the label preview was rendered for (data attributes on the label root). */
export function readLabelSize(label: Element): LabelSize {
  const width = Number(label.getAttribute('data-label-width-mm')) || 58
  const height = Number(label.getAttribute('data-label-height-mm'))
  return { widthMm: width, heightMm: height > 0 ? height : null }
}

/**
 * Page size for this print only (the 58mm receipt @page in globals.css stays the
 * default), plus CSS variables for page height and printer calibration.
 */
function applyLabelPrintStyles(size: LabelSize, adjust?: LabelPrintAdjust): () => void {
  document.getElementById(LABEL_PAGE_STYLE_ID)?.remove()
  const style = document.createElement('style')
  style.id = LABEL_PAGE_STYLE_ID
  const height = size.heightMm === null ? 'auto' : `${size.heightMm}mm`
  style.textContent = `@media print { @page { size: ${size.widthMm}mm ${height}; margin: 0; } }`
  document.head.appendChild(style)

  const root = document.documentElement.style
  const vars: Record<string, string> = {
    '--label-paper-width': `${size.widthMm}mm`,
    '--label-page-height':
      size.heightMm === null ? 'auto' : `${Math.max(1, size.heightMm - PAGE_SAFETY_MM)}mm`,
    '--label-offset-x': `${adjust?.offsetXMm ?? 0}mm`,
    '--label-offset-y': `${adjust?.offsetYMm ?? 0}mm`,
    '--label-scale': String(adjust?.scale ?? 1),
    '--label-rotate': adjust?.rotate180 ? '180deg' : '0deg',
  }
  for (const [name, value] of Object.entries(vars)) root.setProperty(name, value)

  return () => {
    style.remove()
    for (const name of Object.keys(vars)) root.removeProperty(name)
  }
}

/** Print one label element as `copies` pages, each exactly one label. */
function printLabelElement(
  label: Element,
  size: LabelSize,
  options: LabelPrintOptions = {}
): boolean {
  removePrintPortal()
  removeOtherPrintPortals()

  const copies = Math.min(MAX_LABEL_COPIES, Math.max(1, Math.round(options.copies ?? 1)))
  const portal = document.createElement('div')
  portal.id = PRODUCT_LABEL_PRINT_PORTAL_ID
  portal.setAttribute('aria-hidden', 'true')
  const clone = prepareThermalClone(label)
  for (let i = 0; i < copies; i++) {
    const page = document.createElement('div')
    page.className = 'product-label-page'
    page.appendChild(i === 0 ? clone : clone.cloneNode(true))
    portal.appendChild(page)
  }
  document.body.appendChild(portal)

  const removeStyles = applyLabelPrintStyles(size, options.adjust)
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
    removeStyles()
    removePrintPortal()
  }

  attachThermalPrintCleanup(cleanup)

  scheduleThermalPrint(() => {
    printPreparedDocument()
  })

  return true
}

export function printProductLabel(
  sourceContainer: HTMLElement,
  options: LabelPrintOptions = {}
): boolean {
  if (typeof window === 'undefined') return false
  const label = sourceContainer.querySelector('.product-label-print-root')
  if (!label) return false
  return printLabelElement(label, readLabelSize(label), options)
}

/**
 * Calibration label: a border on the exact label edge plus the size, so the shop
 * can see whether the printer cuts, shifts or shrinks the page.
 */
export function printLabelTestPage(size: LabelSize, adjust?: LabelPrintAdjust): boolean {
  if (typeof window === 'undefined') return false
  const heightMm = size.heightMm ?? ROLL_TEST_HEIGHT_MM

  const label = document.createElement('div')
  label.className = 'product-label-print-root'
  label.setAttribute('data-label-width-mm', String(size.widthMm))
  label.setAttribute('data-label-height-mm', size.heightMm === null ? '' : String(size.heightMm))
  Object.assign(label.style, {
    position: 'relative',
    width: `${size.widthMm}mm`,
    height: `${heightMm}mm`,
    boxSizing: 'border-box',
    border: '0.5mm solid #000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.6mm',
    fontFamily: 'system-ui, sans-serif',
    fontSize: `${Math.min(3.2, heightMm * 0.12)}mm`,
    lineHeight: '1.15',
    textAlign: 'center',
    background: '#fff',
    color: '#000',
  })

  const line = (text: string, extra: Partial<CSSStyleDeclaration> = {}) => {
    const el = document.createElement('div')
    el.textContent = text
    Object.assign(el.style, extra)
    label.appendChild(el)
  }
  const corner = (text: string, position: Partial<CSSStyleDeclaration>) =>
    line(text, { position: 'absolute', fontSize: '2.2mm', fontWeight: '700', ...position })

  corner('▲ TOP', { top: '0.6mm', left: '50%', transform: 'translateX(-50%)' })
  corner('L', { left: '0.8mm', top: '50%', transform: 'translateY(-50%)' })
  corner('R', { right: '0.8mm', top: '50%', transform: 'translateY(-50%)' })
  line('BIVA TEST LABEL', { fontWeight: '700' })
  line(describeLabelSize(size))
  line('Full border must show on ONE label', { fontSize: '0.8em' })

  return printLabelElement(label, size, { adjust })
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

async function loadBarcodeImage(root: ParentNode): Promise<HTMLImageElement | null> {
  const svg = root.querySelector('.product-label-barcode-svg[data-ready]')
  return svg instanceof SVGElement ? svgElementToImage(svg) : null
}

async function loadQrImage(root: ParentNode): Promise<HTMLImageElement | null> {
  const svg = root.querySelector('.product-label-qr svg')
  return svg instanceof SVGElement ? svgElementToImage(svg) : null
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let end = text.length
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1
  return `${text.slice(0, end)}…`
}

/** Same layout as the preview: title (+ price), QR beside barcode, code number underneath. */
export async function downloadLabelPreviewPng(
  container: HTMLElement,
  filename: string
): Promise<boolean> {
  const root = container.querySelector('.product-label-print-root')
  if (!root) return false
  const title = readLabelField(root, '.product-label-name', 'Product')
  const price = readLabelField(root, '.product-label-price')
  const code = readLabelField(root, '.product-label-code')
  const [qr, barcode] = await Promise.all([loadQrImage(root), loadBarcodeImage(root)])
  if (!qr && !barcode) return false

  const layout = labelLayout(readLabelSize(root))
  const pxPerMm = IMAGE_PX_PER_MM
  const px = (valueMm: number) => valueMm * pxPerMm
  const titleLine = layout.titleFontMm * LABEL_LINE_HEIGHT
  const codeLine = layout.codeFontMm * LABEL_LINE_HEIGHT
  const contentMm =
    layout.paddingMm * 2 + titleLine + layout.gapMm * 2 + layout.codeRowMm + codeLine
  const heightMm = layout.heightMm ?? contentMm
  const spareGapMm = Math.max(0, heightMm - contentMm) / 2

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  const width = px(layout.widthMm)
  canvas.width = Math.round(width)
  canvas.height = Math.round(px(heightMm))
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'

  const padding = px(layout.paddingMm)
  const gap = px(layout.gapMm)
  const rowGap = px(layout.gapMm + spareGapMm)
  let y = padding

  ctx.font = `bold ${px(layout.titleFontMm)}px system-ui, sans-serif`
  let titleWidth = width - padding * 2
  if (price) {
    ctx.textAlign = 'right'
    ctx.fillText(price, width - padding, y)
    titleWidth -= ctx.measureText(price).width + gap
  }
  ctx.textAlign = 'left'
  ctx.fillText(fitText(ctx, title, titleWidth), padding, y)
  y += px(titleLine) + rowGap

  const rowHeight = px(layout.codeRowMm)
  let x = padding
  if (qr) {
    ctx.drawImage(qr, x, y, rowHeight, rowHeight)
    x += rowHeight + gap
  }
  if (barcode) {
    ctx.drawImage(barcode, x, y, width - padding - x, rowHeight)
  }
  y += rowHeight + rowGap

  ctx.font = `500 ${px(layout.codeFontMm)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(fitText(ctx, code, width - padding * 2), width / 2, y)

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = filename
  link.click()
  return true
}

export function isLabelGraphicReady(container: HTMLElement | null): boolean {
  if (!container) return false
  const root = container.querySelector('.product-label-print-root')
  if (!root) return false
  const barcodeReady = root.querySelector('.product-label-barcode-svg[data-ready]')
  const qrSettled = root.querySelector('.product-label-qr svg, .product-label-qr-error')
  return Boolean(barcodeReady) && Boolean(qrSettled)
}
