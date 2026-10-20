'use client'

import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ScannerTestDialog } from '@/components/scanner-test-dialog'
import { usePosSettings } from '@/hooks/use-pos-settings'
import { SCANNER_SPEEDS } from '@/lib/pos-settings'
import { cn } from '@/lib/utils'

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
  const [showScannerTest, setShowScannerTest] = useState(false)

  return (
    <div className={className}>
      <SettingRow
        label="Open on Sell screen"
        description="When the app opens on this device, go straight to Sell. Use this on tills."
        checked={settings.openOnSell}
        onCheckedChange={(openOnSell) => update({ openOnSell })}
      />
      <SettingRow
        label="Hardware scanner"
        description="USB or built-in scanner sends barcodes as keyboard input (recommended on POS devices)."
        checked={settings.hardwareScanner}
        onCheckedChange={(hardwareScanner) => update({ hardwareScanner })}
      />
      {settings.hardwareScanner && (
        <div className="py-3 space-y-2">
          <div>
            <p className="text-sm font-medium">Scanner speed</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick Slow if some scans are missed. The scanner test can choose for you.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-lg">
            {SCANNER_SPEEDS.map((speed) => (
              <button
                key={speed.id}
                type="button"
                onClick={() => update({ scannerKeyGapMs: speed.keyGapMs })}
                className={cn(
                  'h-9 rounded-md text-sm font-medium transition-colors',
                  settings.scannerKeyGapMs === speed.keyGapMs
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {speed.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => setShowScannerTest(true)}
          >
            <ScanLine className="size-4" />
            Test scanner
          </Button>
        </div>
      )}
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
      <ScannerTestDialog open={showScannerTest} onOpenChange={setShowScannerTest} />
    </div>
  )
}
