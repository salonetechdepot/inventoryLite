export type LabelSizeId =
  | "2x1in"
  | "2.25x1.25in"
  | "50x30mm"
  | "40x30mm"
  | "60x40mm"
  | "58mm-roll"
  | "custom"

export type LabelSize = {
  widthMm: number
  /** null = continuous roll; the label is as tall as its content. */
  heightMm: number | null
}

export const LABEL_SIZE_PRESETS: Array<{ id: Exclude<LabelSizeId, "custom">; label: string } & LabelSize> = [
  { id: "2x1in", label: "2 × 1 in (51 × 25 mm)", widthMm: 50.8, heightMm: 25.4 },
  { id: "2.25x1.25in", label: "2.25 × 1.25 in (57 × 32 mm)", widthMm: 57.2, heightMm: 31.8 },
  { id: "50x30mm", label: "50 × 30 mm", widthMm: 50, heightMm: 30 },
  { id: "40x30mm", label: "40 × 30 mm", widthMm: 40, heightMm: 30 },
  { id: "60x40mm", label: "60 × 40 mm", widthMm: 60, heightMm: 40 },
  { id: "58mm-roll", label: "58 mm receipt roll", widthMm: 58, heightMm: null },
]

export const CUSTOM_LABEL_LIMITS = {
  minWidthMm: 25,
  maxWidthMm: 120,
  minHeightMm: 15,
  maxHeightMm: 100,
} as const

export type LabelSettings = {
  showPrice: boolean
  sizeId: LabelSizeId
  customWidthMm: number
  customHeightMm: number
  /** Printer calibration: shift printed content (mm). Positive = right / down. */
  offsetXMm: number
  offsetYMm: number
  /** Printer calibration: enlarge/shrink printed content. */
  scalePct: number
  /** For printers that feed labels the other way round. */
  rotate180: boolean
}

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  showPrice: false,
  sizeId: "2x1in",
  customWidthMm: 50,
  customHeightMm: 25,
  offsetXMm: 0,
  offsetYMm: 0,
  scalePct: 100,
  rotate180: false,
}

export const LABEL_ADJUST_LIMITS = {
  maxOffsetMm: 10,
  minScalePct: 50,
  maxScalePct: 150,
} as const

export const MAX_LABEL_COPIES = 100

/** Calibration applied only when printing (not to the preview or saved image). */
export type LabelPrintAdjust = {
  offsetXMm: number
  offsetYMm: number
  scale: number
  rotate180: boolean
}

export function resolvePrintAdjust(settings: LabelSettings): LabelPrintAdjust {
  const offset = (value: number) =>
    clamp(Number(value) || 0, -LABEL_ADJUST_LIMITS.maxOffsetMm, LABEL_ADJUST_LIMITS.maxOffsetMm)
  return {
    offsetXMm: offset(settings.offsetXMm),
    offsetYMm: offset(settings.offsetYMm),
    scale:
      clamp(
        Number(settings.scalePct) || 100,
        LABEL_ADJUST_LIMITS.minScalePct,
        LABEL_ADJUST_LIMITS.maxScalePct
      ) / 100,
    rotate180: Boolean(settings.rotate180),
  }
}

export function hasPrintAdjust(adjust: LabelPrintAdjust): boolean {
  return (
    adjust.offsetXMm !== 0 || adjust.offsetYMm !== 0 || adjust.scale !== 1 || adjust.rotate180
  )
}

const STORAGE_KEY = "biva-label-settings-v1"
export const LABEL_SETTINGS_CHANGED = "biva-label-settings-changed"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function resolveLabelSize(settings: LabelSettings): LabelSize {
  if (settings.sizeId === "custom") {
    return {
      widthMm: clamp(
        Number(settings.customWidthMm) || DEFAULT_LABEL_SETTINGS.customWidthMm,
        CUSTOM_LABEL_LIMITS.minWidthMm,
        CUSTOM_LABEL_LIMITS.maxWidthMm
      ),
      heightMm: clamp(
        Number(settings.customHeightMm) || DEFAULT_LABEL_SETTINGS.customHeightMm,
        CUSTOM_LABEL_LIMITS.minHeightMm,
        CUSTOM_LABEL_LIMITS.maxHeightMm
      ),
    }
  }
  const preset =
    LABEL_SIZE_PRESETS.find((p) => p.id === settings.sizeId) ?? LABEL_SIZE_PRESETS[0]
  return { widthMm: preset.widthMm, heightMm: preset.heightMm }
}

export function describeLabelSize(size: LabelSize): string {
  const mm = (n: number) => `${Math.round(n * 10) / 10}`
  return size.heightMm === null
    ? `${mm(size.widthMm)} mm roll`
    : `${mm(size.widthMm)} × ${mm(size.heightMm)} mm`
}

/** All measurements in mm. */
export type LabelLayout = {
  widthMm: number
  heightMm: number | null
  paddingMm: number
  gapMm: number
  titleFontMm: number
  codeFontMm: number
  codeRowMm: number
  qrMm: number
}

export const LABEL_LINE_HEIGHT = 1.15
const ROLL_CODE_ROW_MM = 11
/** Codes use this share of the free height; the rest is breathing room so nothing touches the edges. */
const CODE_ROW_FILL = 0.75

/** Scale padding, text and codes so everything fits the chosen label. */
export function labelLayout(size: LabelSize): LabelLayout {
  const base = size.heightMm ?? 30
  const paddingMm = clamp(base * 0.06, 1, 2.5)
  const gapMm = clamp(base * 0.04, 0.6, 1.5)
  const titleFontMm = clamp(base * 0.11, 2.2, 4.2)
  const codeFontMm = clamp(base * 0.11, 2.2, 4.4)

  const availableRowMm =
    size.heightMm === null
      ? ROLL_CODE_ROW_MM
      : Math.max(
          6,
          size.heightMm -
            paddingMm * 2 -
            gapMm * 2 -
            (titleFontMm + codeFontMm) * LABEL_LINE_HEIGHT
        )
  // Leave the barcode most of the width so its bars stay wide enough to print.
  const qrMm = Math.min(
    size.heightMm === null ? availableRowMm : availableRowMm * CODE_ROW_FILL,
    size.widthMm * 0.3
  )

  return {
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    paddingMm,
    gapMm,
    titleFontMm,
    codeFontMm,
    // Barcode matches the QR height; any spare height is spread between the rows.
    codeRowMm: qrMm,
    qrMm,
  }
}

export function getLabelSettings(): LabelSettings {
  if (typeof window === "undefined") return { ...DEFAULT_LABEL_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LABEL_SETTINGS }
    return { ...DEFAULT_LABEL_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_LABEL_SETTINGS }
  }
}

export function saveLabelSettings(patch: Partial<LabelSettings>): LabelSettings {
  const next = { ...getLabelSettings(), ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked — settings apply for this session only.
  }
  window.dispatchEvent(new CustomEvent(LABEL_SETTINGS_CHANGED, { detail: next }))
  return next
}
