"use client"

import { useState } from "react"
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  Printer,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CUSTOM_LABEL_LIMITS,
  describeLabelSize,
  hasPrintAdjust,
  LABEL_ADJUST_LIMITS,
  LABEL_SIZE_PRESETS,
  MAX_LABEL_COPIES,
  resolveLabelSize,
  resolvePrintAdjust,
  type LabelSettings,
  type LabelSizeId,
} from "@/lib/label-settings"
import { printLabelTestPage } from "@/lib/product-label-print"

type Props = {
  settings: LabelSettings
  update: (patch: Partial<LabelSettings>) => void
}

const OFFSET_STEP_MM = 0.5
const SCALE_STEP_PCT = 5

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatOffset(mm: number, negative: string, positive: string) {
  if (mm === 0) return "0 mm"
  return `${Math.abs(mm)} mm ${mm < 0 ? negative : positive}`
}

/** How many identical labels to print — one per sticker, in a single print. */
export function LabelCopiesField({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const set = (next: number) => onChange(clamp(Math.round(next) || 1, 1, MAX_LABEL_COPIES))
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm font-medium" htmlFor="label-copies">
        Copies
      </label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10"
          onClick={() => set(value - 1)}
          aria-label="Fewer copies"
        >
          <Minus className="size-4" />
        </Button>
        <Input
          id="label-copies"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_LABEL_COPIES}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="h-10 w-16 text-center"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10"
          onClick={() => set(value + 1)}
          aria-label="More copies"
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/** Label size, price option and printer calibration shown above the label preview. */
export function LabelSettingsControls({ settings, update }: Props) {
  const [showAdjust, setShowAdjust] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const size = resolveLabelSize(settings)
  const adjust = resolvePrintAdjust(settings)
  const sizeText = describeLabelSize(size)

  const nudge = (key: "offsetXMm" | "offsetYMm", delta: number) => {
    const next = clamp(
      Math.round(((Number(settings[key]) || 0) + delta) * 10) / 10,
      -LABEL_ADJUST_LIMITS.maxOffsetMm,
      LABEL_ADJUST_LIMITS.maxOffsetMm
    )
    update({ [key]: next })
  }

  const resize = (delta: number) =>
    update({
      scalePct: clamp(
        (Number(settings.scalePct) || 100) + delta,
        LABEL_ADJUST_LIMITS.minScalePct,
        LABEL_ADJUST_LIMITS.maxScalePct
      ),
    })

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="label-size">
          Label size
        </label>
        <Select
          value={settings.sizeId}
          onValueChange={(value) => update({ sizeId: value as LabelSizeId })}
        >
          <SelectTrigger id="label-size" className="w-full h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LABEL_SIZE_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom size…</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Measure one sticker (without the gap) and pick the same size.
        </p>
      </div>

      {settings.sizeId === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="label-width">
              Width (mm)
            </label>
            <Input
              id="label-width"
              type="number"
              inputMode="decimal"
              min={CUSTOM_LABEL_LIMITS.minWidthMm}
              max={CUSTOM_LABEL_LIMITS.maxWidthMm}
              value={settings.customWidthMm}
              onChange={(e) => update({ customWidthMm: Number(e.target.value) })}
              className="h-11"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="label-height">
              Height (mm)
            </label>
            <Input
              id="label-height"
              type="number"
              inputMode="decimal"
              min={CUSTOM_LABEL_LIMITS.minHeightMm}
              max={CUSTOM_LABEL_LIMITS.maxHeightMm}
              value={settings.customHeightMm}
              onChange={(e) => update({ customHeightMm: Number(e.target.value) })}
              className="h-11"
            />
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={settings.showPrice}
          onCheckedChange={(checked) => update({ showPrice: checked === true })}
        />
        Show price on label
      </label>

      <div className="rounded-lg border">
        <button
          type="button"
          onClick={() => setShowAdjust((value) => !value)}
          className="flex w-full items-center justify-between p-3 text-sm font-medium"
        >
          <span>
            Printer adjustments
            {hasPrintAdjust(adjust) && (
              <span className="ml-2 text-xs font-normal text-primary">(in use)</span>
            )}
          </span>
          {showAdjust ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showAdjust && (
          <div className="space-y-3 border-t p-3">
            <p className="text-xs text-muted-foreground">
              Print a test label first. Use these only if the border is cut off or not centred
              after the printer is set to {sizeText}.
            </p>

            <Button
              type="button"
              variant="secondary"
              className="w-full h-11"
              onClick={() => printLabelTestPage(size, adjust)}
            >
              <Printer className="size-4" />
              Print test label
            </Button>

            <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
              <span>
                Up / down
                <span className="block text-xs text-muted-foreground">
                  {formatOffset(adjust.offsetYMm, "up", "down")}
                </span>
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-10"
                  onClick={() => nudge("offsetYMm", -OFFSET_STEP_MM)}
                  aria-label="Move up"
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-10"
                  onClick={() => nudge("offsetYMm", OFFSET_STEP_MM)}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>

              <span>
                Left / right
                <span className="block text-xs text-muted-foreground">
                  {formatOffset(adjust.offsetXMm, "left", "right")}
                </span>
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-10"
                  onClick={() => nudge("offsetXMm", -OFFSET_STEP_MM)}
                  aria-label="Move left"
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-10"
                  onClick={() => nudge("offsetXMm", OFFSET_STEP_MM)}
                  aria-label="Move right"
                >
                  <ArrowRight className="size-4" />
                </Button>
              </div>

              <span>
                Size
                <span className="block text-xs text-muted-foreground">
                  {Math.round(adjust.scale * 100)}%
                </span>
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-10"
                  onClick={() => resize(-SCALE_STEP_PCT)}
                  aria-label="Smaller"
                >
                  <Minus className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-10"
                  onClick={() => resize(SCALE_STEP_PCT)}
                  aria-label="Larger"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={settings.rotate180}
                onCheckedChange={(checked) => update({ rotate180: checked === true })}
              />
              Labels print upside down — turn 180°
            </label>

            {hasPrintAdjust(adjust) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  update({ offsetXMm: 0, offsetYMm: 0, scalePct: 100, rotate180: false })
                }
              >
                <RotateCcw className="size-4" />
                Reset adjustments
              </Button>
            )}

            <div className="rounded-md bg-muted/50">
              <button
                type="button"
                onClick={() => setShowSetup((value) => !value)}
                className="flex w-full items-center justify-between p-2.5 text-xs font-semibold"
              >
                Label printer setup (do once)
                {showSetup ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
              {showSetup && (
                <div className="space-y-2 px-2.5 pb-2.5 text-xs text-muted-foreground">
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>
                      Windows: Settings → Printers → your label printer →{" "}
                      <strong>Printing preferences</strong> → paper / stock size → create{" "}
                      <strong>{sizeText}</strong> and select it. Media type:{" "}
                      <strong>labels with gaps</strong>.
                    </li>
                    <li>Run the printer&apos;s <strong>calibrate</strong> (or hold FEED) so it finds the gaps.</li>
                    <li>
                      In BIVA&apos;s print screen: printer = label printer, paper size ={" "}
                      <strong>{sizeText}</strong>, margins <strong>None</strong>, scale{" "}
                      <strong>Default / 100%</strong>, headers and footers off.
                    </li>
                    <li>Print a test label — the whole border should be on one sticker.</li>
                  </ol>
                  <table className="w-full text-left">
                    <tbody className="align-top">
                      <tr>
                        <td className="pr-2 py-0.5 font-medium text-foreground">Two labels per print</td>
                        <td>Printer paper size is longer than the sticker — fix step 1, then calibrate.</td>
                      </tr>
                      <tr>
                        <td className="pr-2 py-0.5 font-medium text-foreground">Label printed small</td>
                        <td>Print screen paper size or scale is wrong — fix step 3.</td>
                      </tr>
                      <tr>
                        <td className="pr-2 py-0.5 font-medium text-foreground">Top or side cut off</td>
                        <td>Calibrate; then use Up / down or Left / right above.</td>
                      </tr>
                      <tr>
                        <td className="pr-2 py-0.5 font-medium text-foreground">Upside down</td>
                        <td>Tick &ldquo;turn 180°&rdquo;.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
