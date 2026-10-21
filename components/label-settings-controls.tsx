"use client"

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
  LABEL_SIZE_PRESETS,
  type LabelSettings,
  type LabelSizeId,
} from "@/lib/label-settings"

type Props = {
  settings: LabelSettings
  update: (patch: Partial<LabelSettings>) => void
}

/** Label size + "show price" options shown above the label preview. */
export function LabelSettingsControls({ settings, update }: Props) {
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
    </div>
  )
}
