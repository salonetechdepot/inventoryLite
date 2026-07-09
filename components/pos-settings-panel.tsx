'use client'

import { Switch } from '@/components/ui/switch'
import { usePosSettings } from '@/hooks/use-pos-settings'

function SettingRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  )
}

export function PosSettingsPanel({ className = '' }: { className?: string }) {
  const { settings, update } = usePosSettings()

  return (
    <div className={className}>
      <SettingRow
        label="Hardware scanner"
        description="USB or built-in scanner sends barcodes as keyboard input (recommended on POS devices)."
        checked={settings.hardwareScanner}
        onCheckedChange={(hardwareScanner) => update({ hardwareScanner })}
      />
      <SettingRow
        label="Auto-print receipt"
        description="Print to your 58mm printer right after checkout."
        checked={settings.autoPrintReceipt}
        onCheckedChange={(autoPrintReceipt) => update({ autoPrintReceipt })}
      />
      <SettingRow
        label="Keep screen awake"
        description="Prevent sleep while you are on the Sell screen."
        checked={settings.keepScreenAwake}
        onCheckedChange={(keepScreenAwake) => update({ keepScreenAwake })}
      />
      <SettingRow
        label="Scan beep"
        description="Short sound when a product is added by scan."
        checked={settings.scanBeep}
        onCheckedChange={(scanBeep) => update({ scanBeep })}
      />
    </div>
  )
}
